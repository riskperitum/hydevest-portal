'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Package, Layers, TrendingDown, CheckCircle2,
  Clock, Search, Filter, Eye, ChevronDown, ChevronUp,
  FileText, Download
} from 'lucide-react'
import { usePermissions, can } from '@/lib/permissions/hooks'
import {
  computeContainerStatus,
  getContainerStatusBadge,
  type ContainerStatusInput,
  normalizeSaleTypeForStatus,
} from '@/lib/utils/containerStatus'

interface ContainerInventory {
  // Container info
  container_db_id: string
  container_id: string
  tracking_number: string | null
  pieces_purchased: number
  status: string
  trip_id: string
  trip: { trip_id: string; title: string; source_location: string | null } | null

  // Presale info
  presale_db_id: string | null
  presale_id: string | null
  sale_type: string | null
  presale_status: string | null
  warehouse_confirmed_pieces: number | null
  total_number_of_pallets: number | null
  price_per_piece: number | null

  // Sales info
  has_sales: boolean
  total_orders: number

  // Computed inventory
  inventory_status: 'no_presale' | 'presaled_unsold' | 'partially_sold' | 'fully_sold'
  pieces_remaining: number
  pieces_sold: number
  pallets_total: number
  pallets_sold: number
  pallets_available: number

  // Pallet distributions
  pallet_distributions: {
    id: string
    pallet_pieces: number
    number_of_pallets: number
    pallets_sold: number
    pallets_available: number
  }[]
}

const INVENTORY_STATUS_CONFIG = {
  no_presale:      { label: 'Not presaled',     color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
  presaled_unsold: { label: 'Presaled — unsold', color: 'bg-blue-50 text-blue-700',   dot: 'bg-blue-500' },
  partially_sold:  { label: 'Partially sold',   color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  fully_sold:      { label: 'Fully sold',        color: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
}

export default function InventoryPage() {
  const router = useRouter()
  const { permissions, isSuperAdmin } = usePermissions()
  const canViewCosts = can(permissions, isSuperAdmin, 'view_costs')

  const [inventory, setInventory] = useState<ContainerInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const [presaleMap, setPresaleMap] = useState<Record<string, number>>({})
  const [salesMap, setSalesMap] = useState<Record<string, number>>({})
  const [paidMap, setPaidMap] = useState<Record<string, number>>({})
  const [settledMap, setSettledMap] = useState<Record<string, number>>({})
  const [outstandingMap, setOutstandingMap] = useState<Record<string, number>>({})
  const [presaleTypeMap, setPresaleTypeMap] = useState<Record<string, string>>({})
  const [presalePalletsMap, setPresalePalletsMap] = useState<Record<string, number>>({})
  const [palletDistMap, setPalletDistMap] = useState<Record<string, number>>({})
  const [tripStatusMap, setTripStatusMap] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data: inventoryData } = await supabase
      .from('containers')
      .select(`
        id, container_id, tracking_number, pieces_purchased, status, trip_id,
        trip:trips!containers_trip_id_fkey(status, trip_id, title, source_location)
      `)
      .order('created_at', { ascending: false })

    const containerIds = (inventoryData ?? []).map((c: { id: string }) => c.id)

    const [{ data: presaleCounts }, { data: salesCounts }, { data: paidCounts }, { data: settledCounts }] = await Promise.all([
      containerIds.length > 0
        ? supabase.from('presales').select('container_id').in('container_id', containerIds)
        : { data: [] as { container_id: string }[] },
      containerIds.length > 0
        ? supabase.from('sales_orders').select('container_id, payment_status').in('container_id', containerIds)
        : { data: [] as { container_id: string; payment_status: string }[] },
      containerIds.length > 0
        ? supabase.from('sales_orders').select('container_id').in('container_id', containerIds).eq('payment_status', 'paid')
        : { data: [] as { container_id: string }[] },
      containerIds.length > 0
        ? supabase.from('sales_orders').select('container_id, outstanding_balance, write_off_status').in('container_id', containerIds)
        : { data: [] as { container_id: string; outstanding_balance: unknown; write_off_status: string | null }[] },
    ])

    const presaleMap: Record<string, number> = {}
    for (const p of (presaleCounts ?? [])) {
      presaleMap[p.container_id] = (presaleMap[p.container_id] ?? 0) + 1
    }
    const salesMap: Record<string, number> = {}
    for (const s of (salesCounts ?? [])) {
      salesMap[s.container_id] = (salesMap[s.container_id] ?? 0) + 1
    }
    const paidMap: Record<string, number> = {}
    for (const p of (paidCounts ?? [])) {
      paidMap[p.container_id] = (paidMap[p.container_id] ?? 0) + 1
    }
    const settledMap: Record<string, number> = {}
    for (const s of (settledCounts ?? [])) {
      if (Number(s.outstanding_balance) <= 0 || s.write_off_status === 'approved') {
        settledMap[s.container_id] = (settledMap[s.container_id] ?? 0) + 1
      }
    }
    const outstandingMap: Record<string, number> = {}
    for (const s of (settledCounts ?? [])) {
      outstandingMap[s.container_id] = (outstandingMap[s.container_id] ?? 0) + Number(s.outstanding_balance ?? 0)
    }

    const presaleTypeMap: Record<string, string> = {}
    const presalePalletsMap: Record<string, number> = {}
    const palletDistMap: Record<string, number> = {}
    if (containerIds.length > 0) {
      const { data: presaleDetails } = await supabase
        .from('presales')
        .select('id, container_id, sale_type, total_number_of_pallets')
        .in('container_id', containerIds)
      for (const p of (presaleDetails ?? [])) {
        presaleTypeMap[p.container_id] = p.sale_type
        presalePalletsMap[p.container_id] = p.total_number_of_pallets ?? 0
      }
      const presaleIds = [...new Set((presaleDetails ?? []).map(p => p.id))]
      const { data: palletDistRows } = presaleIds.length > 0
        ? await supabase.from('presale_pallet_distributions').select('presale_id').in('presale_id', presaleIds)
        : { data: [] as { presale_id: string }[] }
      const presaleIdToContainer = Object.fromEntries((presaleDetails ?? []).map(p => [p.id, p.container_id]))
      for (const pd of (palletDistRows ?? [])) {
        const cid = presaleIdToContainer[pd.presale_id]
        if (cid) palletDistMap[cid] = (palletDistMap[cid] ?? 0) + 1
      }
    }

    const tsMap: Record<string, string> = {}
    for (const c of (inventoryData ?? [])) {
      const t = c.trip as { status?: string } | { status?: string }[] | null | undefined
      const trip = Array.isArray(t) ? t[0] : t
      tsMap[c.id] = trip?.status ?? 'not_started'
    }
    setTripStatusMap(tsMap)
    setPresaleMap(presaleMap)
    setSalesMap(salesMap)
    setPaidMap(paidMap)
    setSettledMap(settledMap)
    setOutstandingMap(outstandingMap)
    setPresaleTypeMap(presaleTypeMap)
    setPresalePalletsMap(presalePalletsMap)
    setPalletDistMap(palletDistMap)

    const [
      { data: presales },
      { data: palletDists },
      { data: salesOrders },
      { data: orderPallets },
    ] = await Promise.all([
      supabase.from('presales')
        .select('id, presale_id, container_id, sale_type, status, warehouse_confirmed_pieces, total_number_of_pallets, price_per_piece'),
      supabase.from('presale_pallet_distributions')
        .select('id, presale_id, pallet_pieces, number_of_pallets, pallets_sold'),
      supabase.from('sales_orders')
        .select('id, container_id, sale_type, customer_payable'),
      supabase.from('sales_order_pallets')
        .select('id, order_id, pallet_distribution_id, pallets_sold, total_pieces'),
    ])

    const presaleByContainerId = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    type PalletDistRow = NonNullable<typeof palletDists>[number]
    type SalesOrderRow = NonNullable<typeof salesOrders>[number]
    const palletsByPresale = (palletDists ?? []).reduce((acc, pd) => {
      if (!acc[pd.presale_id]) acc[pd.presale_id] = []
      acc[pd.presale_id].push(pd)
      return acc
    }, {} as Record<string, PalletDistRow[]>)

    const ordersByContainer = (salesOrders ?? []).reduce((acc, so) => {
      if (!acc[so.container_id]) acc[so.container_id] = []
      acc[so.container_id].push(so)
      return acc
    }, {} as Record<string, SalesOrderRow[]>)

    // Build inventory rows
    const rows: ContainerInventory[] = (inventoryData ?? []).map(container => {
      const presale = presaleByContainerId[container.id] ?? null
      const tripRaw = container.trip as { trip_id: string; title: string; source_location: string | null } | { trip_id: string; title: string; source_location: string | null }[] | null | undefined
      const tripObj = Array.isArray(tripRaw) ? tripRaw[0] : tripRaw
      const trip = tripObj
        ? { trip_id: tripObj.trip_id, title: tripObj.title, source_location: tripObj.source_location }
        : null
      const orders = ordersByContainer[container.id] ?? []
      const pallets = presale ? (palletsByPresale[presale.id] ?? []) : []

      // Pieces calculations
      const confirmedPieces = presale?.warehouse_confirmed_pieces ?? container.pieces_purchased ?? 0
      const palletPiecesTotal = pallets.reduce((s, pd) => s + pd.pallet_pieces * pd.number_of_pallets, 0)
      const palletPiecesSold = pallets.reduce((s, pd) => s + pd.pallet_pieces * pd.pallets_sold, 0)

      let piecesSold = 0
      let piecesRemaining = confirmedPieces

      if (presale?.sale_type === 'box_sale') {
        piecesSold = orders.length > 0 ? confirmedPieces : 0
        piecesRemaining = orders.length > 0 ? 0 : confirmedPieces
      } else if (presale?.sale_type === 'split_sale') {
        piecesSold = palletPiecesSold
        piecesRemaining = palletPiecesTotal - palletPiecesSold
      }

      // Pallet calculations
      const palletsTotal = pallets.reduce((s, pd) => s + pd.number_of_pallets, 0)
      const palletsSold = pallets.reduce((s, pd) => s + pd.pallets_sold, 0)
      const palletsAvailable = palletsTotal - palletsSold

      // Inventory status
      let inventoryStatus: ContainerInventory['inventory_status'] = 'no_presale'
      if (!presale) {
        inventoryStatus = 'no_presale'
      } else if (orders.length === 0) {
        inventoryStatus = 'presaled_unsold'
      } else if (presale.sale_type === 'box_sale') {
        inventoryStatus = 'fully_sold'
      } else if (palletsAvailable === 0) {
        inventoryStatus = 'fully_sold'
      } else {
        inventoryStatus = 'partially_sold'
      }

      return {
        container_db_id: container.id,
        container_id: container.container_id,
        tracking_number: container.tracking_number,
        pieces_purchased: container.pieces_purchased ?? 0,
        status: container.status,
        trip_id: container.trip_id,
        trip,
        presale_db_id: presale?.id ?? null,
        presale_id: presale?.presale_id ?? null,
        sale_type: presale?.sale_type ?? null,
        presale_status: presale?.status ?? null,
        warehouse_confirmed_pieces: presale?.warehouse_confirmed_pieces ?? null,
        total_number_of_pallets: presale?.total_number_of_pallets ?? null,
        price_per_piece: presale?.price_per_piece ?? null,
        has_sales: orders.length > 0,
        total_orders: orders.length,
        inventory_status: inventoryStatus,
        pieces_remaining: piecesRemaining,
        pieces_sold: piecesSold,
        pallets_total: palletsTotal,
        pallets_sold: palletsSold,
        pallets_available: palletsAvailable,
        pallet_distributions: pallets.map(pd => ({
          id: pd.id,
          pallet_pieces: pd.pallet_pieces,
          number_of_pallets: pd.number_of_pallets,
          pallets_sold: pd.pallets_sold,
          pallets_available: pd.number_of_pallets - pd.pallets_sold,
        })),
      }
    })

    setInventory(rows)
    setLoading(false)
  }, [])

  function generateReport(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filtered : inventory
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Inventory Report — Hydevest</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,sans-serif;color:#1a1a2e}
      .header{background:#55249E;color:white;padding:32px 40px}
      .header h1{font-size:24px;font-weight:700}
      .header p{font-size:13px;opacity:.8;margin-top:4px}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:24px 40px;background:#f8f7ff;border-bottom:1px solid #e8e0ff}
      .card{background:white;border-radius:8px;padding:16px;border:1px solid #ede9f7}
      .card .label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
      .card .value{font-size:20px;font-weight:700;color:#55249E}
      .content{padding:24px 40px}
      .section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin-bottom:12px;margin-top:24px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}
      thead tr{background:#55249E;color:white}
      thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap}
      tbody tr{border-bottom:1px solid #f0ebff}
      tbody tr:nth-child(even){background:#faf8ff}
      tbody td{padding:9px 12px;color:#374151;white-space:nowrap}
      .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600}
      .badge-no_presale{background:#f3f4f6;color:#4b5563}
      .badge-presaled_unsold{background:#eff6ff;color:#1d4ed8}
      .badge-partially_sold{background:#fffbeb;color:#b45309}
      .badge-fully_sold{background:#f0fdf4;color:#15803d}
      .sub-table{margin:0 0 8px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}
      .sub-table thead tr{background:#6d4fc2}
      .footer{padding:20px 40px;border-top:1px solid #ede9f7;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="header">
      <h1>Inventory Report</h1>
      <p>Hydevest Portal — ${type === 'filtered' ? 'Filtered View' : 'Full Report'} · Generated ${new Date().toLocaleString()}</p>
    </div>
    <div class="summary">
      <div class="card"><div class="label">Total containers</div><div class="value">${data.length}</div></div>
      <div class="card"><div class="label">Pieces remaining</div><div class="value">${data.reduce((s,r)=>s+r.pieces_remaining,0).toLocaleString()}</div></div>
      <div class="card"><div class="label">Pallets available</div><div class="value">${data.reduce((s,r)=>s+r.pallets_available,0)} / ${data.reduce((s,r)=>s+r.pallets_total,0)}</div></div>
      <div class="card"><div class="label">Fully sold</div><div class="value">${data.filter(r=>r.inventory_status==='fully_sold').length}</div></div>
    </div>
    <div class="content">
      <div class="section-title">Container inventory</div>
      <table><thead><tr>
        <th>Container</th><th>Tracking No.</th><th>Trip</th><th>Sale type</th><th>Status</th>
        <th>Pcs purchased</th><th>W/H pcs</th><th>Pcs sold</th><th>Pcs remaining</th>
        <th>Pallets total</th><th>Pallets sold</th><th>Pallets avail</th><th>Orders</th>
      </tr></thead><tbody>
      ${data.map(r=>`<tr>
        <td><strong style="color:#55249E">${r.container_id}</strong></td>
        <td>${r.tracking_number??'—'}</td>
        <td>${r.trip?.trip_id??'—'}</td>
        <td>${r.sale_type?r.sale_type==='box_sale'?'Box sale':'Split sale':'—'}</td>
        <td><span class="badge badge-${r.inventory_status}">${INVENTORY_STATUS_CONFIG[r.inventory_status].label}</span></td>
        <td>${r.pieces_purchased.toLocaleString()}</td>
        <td>${r.warehouse_confirmed_pieces?.toLocaleString()??'—'}</td>
        <td>${r.pieces_sold>0?r.pieces_sold.toLocaleString():'—'}</td>
        <td><strong>${r.pieces_remaining.toLocaleString()}</strong></td>
        <td>${r.pallets_total>0?r.pallets_total:'—'}</td>
        <td>${r.pallets_sold>0?r.pallets_sold:'—'}</td>
        <td><strong>${r.pallets_available>0?r.pallets_available:'—'}</strong></td>
        <td>${r.total_orders}</td>
      </tr>
      ${r.pallet_distributions.length>0?`
      <tr><td colspan="13" style="padding:8px 12px;background:#f8f7ff">
        <table class="sub-table" style="width:100%"><thead><tr>
          <th>Pallet type</th><th>Total pallets</th><th>Sold</th><th>Available</th><th>Total pieces</th><th>Pieces sold</th><th>Pieces remaining</th>
        </tr></thead><tbody>
        ${r.pallet_distributions.map(pd=>`<tr>
          <td>${pd.pallet_pieces.toLocaleString()} pcs/pallet</td>
          <td>${pd.number_of_pallets}</td>
          <td>${pd.pallets_sold}</td>
          <td><strong>${pd.pallets_available}</strong></td>
          <td>${(pd.pallet_pieces*pd.number_of_pallets).toLocaleString()}</td>
          <td>${(pd.pallet_pieces*pd.pallets_sold).toLocaleString()}</td>
          <td><strong>${(pd.pallet_pieces*pd.pallets_available).toLocaleString()}</strong></td>
        </tr>`).join('')}
        </tbody></table>
      </td></tr>`:''}
      `).join('')}
      </tbody>
      <tfoot><tr style="background:#55249E;color:white">
        <td colspan="5" style="padding:10px 12px;font-weight:700;font-size:11px;text-transform:uppercase">Totals</td>
        <td style="padding:10px 12px;font-weight:700">${data.reduce((s,r)=>s+r.pieces_purchased,0).toLocaleString()}</td>
        <td style="padding:10px 12px;font-weight:700">${data.reduce((s,r)=>s+(r.warehouse_confirmed_pieces??0),0).toLocaleString()}</td>
        <td style="padding:10px 12px;font-weight:700">${data.reduce((s,r)=>s+r.pieces_sold,0).toLocaleString()}</td>
        <td style="padding:10px 12px;font-weight:700">${data.reduce((s,r)=>s+r.pieces_remaining,0).toLocaleString()}</td>
        <td style="padding:10px 12px;font-weight:700">${data.reduce((s,r)=>s+r.pallets_total,0)}</td>
        <td style="padding:10px 12px;font-weight:700">${data.reduce((s,r)=>s+r.pallets_sold,0)}</td>
        <td style="padding:10px 12px;font-weight:700">${data.reduce((s,r)=>s+r.pallets_available,0)}</td>
        <td style="padding:10px 12px;font-weight:700">${data.reduce((s,r)=>s+r.total_orders,0)}</td>
      </tr></tfoot>
      </table>
    </div>
    <div class="footer">Hydevest Portal · Inventory Report · Confidential</div>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  function exportCSV(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filtered : inventory
    const headers = [
      'Container ID','Tracking No.','Trip','Sale Type','Inventory Status',
      'Pieces Purchased','W/H Pieces','Pieces Sold','Pieces Remaining',
      'Pallets Total','Pallets Sold','Pallets Available','Orders'
    ]
    const rows = data.map(r => [
      r.container_id,
      r.tracking_number ?? '',
      r.trip?.trip_id ?? '',
      r.sale_type ?? '',
      INVENTORY_STATUS_CONFIG[r.inventory_status].label,
      r.pieces_purchased,
      r.warehouse_confirmed_pieces ?? '',
      r.pieces_sold,
      r.pieces_remaining,
      r.pallets_total,
      r.pallets_sold,
      r.pallets_available,
      r.total_orders,
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  useEffect(() => { load() }, [load])

  const filtered = inventory.filter(row => {
    const matchSearch = search === '' ||
      (row.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      row.container_id.toLowerCase().includes(search.toLowerCase()) ||
      (row.trip?.trip_id ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || row.inventory_status === statusFilter
    const matchType = saleTypeFilter === '' || row.sale_type === saleTypeFilter
    return matchSearch && matchStatus && matchType
  })

  const activeFilters = [statusFilter, saleTypeFilter].filter(Boolean).length

  // Aggregate metrics
  const totalContainers = inventory.length
  const noPresale = inventory.filter(r => r.inventory_status === 'no_presale').length
  const presaledUnsold = inventory.filter(r => r.inventory_status === 'presaled_unsold').length
  const partiallySold = inventory.filter(r => r.inventory_status === 'partially_sold').length
  const fullySold = inventory.filter(r => r.inventory_status === 'fully_sold').length
  const totalPiecesRemaining = inventory.reduce((s, r) => s + r.pieces_remaining, 0)
  const totalPalletsAvailable = inventory.reduce((s, r) => s + r.pallets_available, 0)
  const totalPalletsAcrossAll = inventory.reduce((s, r) => s + r.pallets_total, 0)

  function toggleRow(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Inventory</h1>
        <p className="text-sm text-gray-400 mt-0.5">Live view of container and pallet availability</p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total containers', value: totalContainers.toString(), color: 'text-gray-900', icon: <Package size={14} className="text-gray-500" /> },
          { label: 'Not presaled', value: noPresale.toString(), color: 'text-gray-600', icon: <Clock size={14} className="text-gray-400" /> },
          { label: 'Presaled unsold', value: presaledUnsold.toString(), color: 'text-blue-700', icon: <Package size={14} className="text-blue-500" /> },
          { label: 'Partially sold', value: partiallySold.toString(), color: 'text-amber-700', icon: <TrendingDown size={14} className="text-amber-500" /> },
          { label: 'Fully sold', value: fullySold.toString(), color: 'text-green-700', icon: <CheckCircle2 size={14} className="text-green-500" /> },
          { label: 'Pieces remaining', value: totalPiecesRemaining.toLocaleString(), color: 'text-brand-700', icon: <Layers size={14} className="text-brand-500" /> },
          { label: 'Pallets available', value: `${totalPalletsAvailable} / ${totalPalletsAcrossAll}`, color: 'text-purple-700', icon: <Layers size={14} className="text-purple-500" /> },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {m.icon}
              <p className="text-xs text-gray-400 leading-tight">{m.label}</p>
            </div>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by tracking number, container ID or trip..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
                ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={15} /> Filters
              {activeFilters > 0 && <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>}
            </button>
            <button onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <FileText size={15} /> Report
            </button>
            <button onClick={() => exportCSV('filtered')}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <Download size={15} /> Export
            </button>
          </div>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Inventory status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All statuses</option>
                <option value="no_presale">Not presaled</option>
                <option value="presaled_unsold">Presaled — unsold</option>
                <option value="partially_sold">Partially sold</option>
                <option value="fully_sold">Fully sold</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sale type</label>
              <select value={saleTypeFilter} onChange={e => setSaleTypeFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All types</option>
                <option value="box_sale">Box sale</option>
                <option value="split_sale">Split sale</option>
              </select>
            </div>
            {activeFilters > 0 && (
              <div className="flex items-end pb-0.5">
                <button onClick={() => { setStatusFilter(''); setSaleTypeFilter('') }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">Clear filters</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inventory table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-3 w-8" />
                {['Container', 'Tracking No.', 'Trip', 'Sale type', 'Inventory status',
                  'Pieces purchased', 'W/H pieces',
                  'Pallets total', 'Pallets sold', 'Pallets available', 'Orders'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Stage</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 14 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Package size={24} className="text-gray-200" />
                      <p className="text-sm text-gray-400">No containers found.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(row => {
                const statusCfg = INVENTORY_STATUS_CONFIG[row.inventory_status]
                const isExpanded = expandedRows.has(row.container_db_id)
                const hasDetails = row.sale_type === 'split_sale' && row.pallet_distributions.length > 0

                return (
                  <React.Fragment key={row.container_db_id}>
                    <tr
                      className={`border-b border-gray-50 transition-colors
                        ${isExpanded ? 'bg-brand-50/20' : 'hover:bg-gray-50/50'}`}>
                      <td className="px-3 py-3">
                        {hasDetails && (
                          <button onClick={() => toggleRow(row.container_db_id)}
                            className="p-1 rounded hover:bg-gray-200 text-gray-400 transition-colors">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{row.container_id}</span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{row.tracking_number ?? '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-600">{row.trip?.trip_id ?? '—'}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.sale_type ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                            {row.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${statusCfg.dot}`} />
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap font-medium">{row.pieces_purchased.toLocaleString()}</td>
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                        {row.warehouse_confirmed_pieces?.toLocaleString() ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                        {row.pallets_total > 0 ? row.pallets_total : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={row.pallets_sold > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}>
                          {row.pallets_sold > 0 ? row.pallets_sold : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.pallets_available > 0 ? (
                          <span className="font-semibold text-brand-700">{row.pallets_available}</span>
                        ) : row.pallets_total > 0 ? (
                          <span className="text-gray-300">0</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.total_orders > 0 ? (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{row.total_orders} order{row.total_orders !== 1 ? 's' : ''}</span>
                        ) : <span className="text-gray-300 text-xs">No orders</span>}
                      </td>
                      {(() => {
                        const statusInput: ContainerStatusInput = {
                          trip_status: tripStatusMap[row.container_db_id] ?? 'not_started',
                          presale_count: presaleMap[row.container_db_id] ?? 0,
                          sale_type: normalizeSaleTypeForStatus(presaleTypeMap[row.container_db_id] ?? null),
                          presale_pallets: presalePalletsMap[row.container_db_id] ?? 0,
                          pallet_dist_count: palletDistMap[row.container_db_id] ?? 0,
                          sales_order_count: salesMap[row.container_db_id] ?? 0,
                          fully_paid_count: paidMap[row.container_db_id] ?? 0,
                          settled_count: settledMap[row.container_db_id] ?? 0,
                          total_outstanding: outstandingMap[row.container_db_id] ?? 0,
                          total_written_off: 0,
                        }
                        const computedStatus = computeContainerStatus(statusInput)
                        const badge = getContainerStatusBadge(computedStatus)
                        return (
                          <>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                                ${badge.stage === 'Trip' ? 'bg-blue-50 text-blue-600' :
                                  badge.stage === 'Presale' ? 'bg-purple-50 text-purple-600' :
                                  badge.stage === 'Sale' ? 'bg-amber-50 text-amber-600' :
                                  badge.stage === 'Recovery' ? 'bg-green-50 text-green-600' :
                                  'bg-gray-100 text-gray-500'}`}>
                                {badge.stage}
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                                {badge.label}
                              </span>
                            </td>
                          </>
                        )
                      })()}
                    </tr>

                    {/* Expanded pallet distribution rows */}
                    {isExpanded && hasDetails && (
                      <tr className="border-b border-gray-100 bg-brand-50/10">
                        <td colSpan={14} className="px-6 py-4">
                          <div className="ml-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                              Pallet distribution breakdown — {row.container_id}
                            </p>
                            <div className="rounded-xl overflow-hidden border border-gray-100">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-100">
                                    {['Pallet type', 'Total pallets', 'Pallets sold', 'Pallets available', 'Pieces per pallet', 'Total pieces', 'Pieces sold', 'Pieces remaining', 'Availability'].map(h => (
                                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.pallet_distributions.map((pd, i) => {
                                    const pctAvail = pd.number_of_pallets > 0
                                      ? (pd.pallets_available / pd.number_of_pallets) * 100
                                      : 0
                                    const totalPieces = pd.pallet_pieces * pd.number_of_pallets
                                    const piecesSold = pd.pallet_pieces * pd.pallets_sold
                                    const piecesRemaining = pd.pallet_pieces * pd.pallets_available

                                    return (
                                      <tr key={pd.id} className="border-b border-gray-50 last:border-0">
                                        <td className="px-3 py-2.5 font-medium text-gray-900">
                                          {pd.pallet_pieces.toLocaleString()} pcs/pallet
                                        </td>
                                        <td className="px-3 py-2.5 text-gray-700">{pd.number_of_pallets}</td>
                                        <td className="px-3 py-2.5">
                                          <span className={pd.pallets_sold > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}>
                                            {pd.pallets_sold > 0 ? pd.pallets_sold : '—'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <span className={`font-semibold ${pd.pallets_available > 0 ? 'text-brand-700' : 'text-gray-300'}`}>
                                            {pd.pallets_available}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-gray-600">{pd.pallet_pieces.toLocaleString()}</td>
                                        <td className="px-3 py-2.5 text-gray-600">{totalPieces.toLocaleString()}</td>
                                        <td className="px-3 py-2.5">
                                          <span className={piecesSold > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}>
                                            {piecesSold > 0 ? piecesSold.toLocaleString() : '—'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <span className={`font-semibold ${piecesRemaining > 0 ? 'text-brand-700' : 'text-red-400'}`}>
                                            {piecesRemaining.toLocaleString()}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <div className="flex items-center gap-2">
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                                              <div
                                                className={`h-full rounded-full transition-all ${pctAvail >= 70 ? 'bg-green-500' : pctAvail >= 30 ? 'bg-amber-400' : 'bg-red-400'}`}
                                                style={{ width: `${pctAvail}%` }}
                                              />
                                            </div>
                                            <span className="text-gray-500 whitespace-nowrap">{pctAvail.toFixed(0)}%</span>
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                                    <td className="px-3 py-2 font-bold text-gray-500 uppercase text-xs">Totals</td>
                                    <td className="px-3 py-2 font-bold text-gray-700">{row.pallets_total}</td>
                                    <td className="px-3 py-2 font-bold text-green-600">{row.pallets_sold}</td>
                                    <td className="px-3 py-2 font-bold text-brand-700">{row.pallets_available}</td>
                                    <td className="px-3 py-2 text-gray-400">—</td>
                                    <td className="px-3 py-2 font-bold text-gray-700">
                                      {row.pallet_distributions.reduce((s, pd) => s + pd.pallet_pieces * pd.number_of_pallets, 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2 font-bold text-green-600">{row.pieces_sold.toLocaleString()}</td>
                                    <td className="px-3 py-2 font-bold text-brand-700">{row.pieces_remaining.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-gray-400">—</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>

            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-brand-100">
                  {/* col 1: expand button */}
                  <td className="px-3 py-3" />
                  {/* col 2: Container */}
                  <td className="px-3 py-3 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                    {filtered.length} container{filtered.length !== 1 ? 's' : ''}
                  </td>
                  {/* col 3: Tracking No. */}
                  <td className="px-3 py-3" />
                  {/* col 4: Trip */}
                  <td className="px-3 py-3" />
                  {/* col 5: Sale type */}
                  <td className="px-3 py-3" />
                  {/* col 6: Inventory status */}
                  <td className="px-3 py-3" />
                  {/* col 7: Pieces purchased */}
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pieces_purchased, 0).toLocaleString()} pcs
                  </td>
                  {/* col 8: W/H pieces */}
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + (r.warehouse_confirmed_pieces ?? 0), 0).toLocaleString()} pcs
                  </td>
                  {/* col 9: Pallets total */}
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pallets_total, 0)}
                  </td>
                  {/* col 10: Pallets sold */}
                  <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pallets_sold, 0)}
                  </td>
                  {/* col 11: Pallets available */}
                  <td className="px-3 py-3 text-xs font-bold text-brand-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pallets_available, 0)}
                  </td>
                  {/* col 12: Orders */}
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.total_orders, 0)}
                  </td>
                  {/* col 13–14: Stage / pipeline status */}
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Report modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Generate report</h2>
            <div className="space-y-2">
              {(['filtered', 'full'] as const).map(t => (
                <button key={t} onClick={() => setReportType(t)}
                  className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType === t ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <p className={`text-sm font-semibold ${reportType === t ? 'text-brand-700' : 'text-gray-700'}`}>
                    {t === 'filtered' ? 'Filtered view' : 'Full report'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t === 'filtered' ? `${filtered.length} container${filtered.length !== 1 ? 's' : ''}` : `${inventory.length} total containers`}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setReportOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => generateReport(reportType)}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                Generate
              </button>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-2">Or export as CSV:</p>
              <div className="flex gap-2">
                <button onClick={() => { exportCSV('filtered'); setReportOpen(false) }}
                  className="flex-1 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                  Filtered CSV
                </button>
                <button onClick={() => { exportCSV('full'); setReportOpen(false) }}
                  className="flex-1 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                  Full CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
