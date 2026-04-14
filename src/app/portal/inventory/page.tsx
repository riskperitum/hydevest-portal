'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Package, Layers, TrendingDown, CheckCircle2,
  Clock, Search, Filter, Eye, ChevronDown, ChevronUp
} from 'lucide-react'

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
  const [inventory, setInventory] = useState<ContainerInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const supabase = createClient()

    const [
      { data: containers },
      { data: presales },
      { data: palletDists },
      { data: salesOrders },
      { data: orderPallets },
    ] = await Promise.all([
      supabase.from('containers')
        .select('id, container_id, tracking_number, pieces_purchased, status, trip_id')
        .order('created_at', { ascending: false }),
      supabase.from('presales')
        .select('id, presale_id, container_id, sale_type, status, warehouse_confirmed_pieces, total_number_of_pallets, price_per_piece'),
      supabase.from('presale_pallet_distributions')
        .select('id, presale_id, pallet_pieces, number_of_pallets, pallets_sold'),
      supabase.from('sales_orders')
        .select('id, container_id, sale_type, customer_payable'),
      supabase.from('sales_order_pallets')
        .select('id, order_id, pallet_distribution_id, pallets_sold, total_pieces'),
    ])

    // Load trips for container info
    const tripIds = [...new Set((containers ?? []).map(c => c.trip_id).filter(Boolean))]
    const { data: trips } = tripIds.length > 0
      ? await supabase.from('trips').select('id, trip_id, title, source_location').in('id', tripIds)
      : { data: [] }

    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const presaleMap = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const palletsByPresale = (palletDists ?? []).reduce((acc, pd) => {
      if (!acc[pd.presale_id]) acc[pd.presale_id] = []
      acc[pd.presale_id].push(pd)
      return acc
    }, {} as Record<string, typeof palletDists[0][]>)

    const ordersByContainer = (salesOrders ?? []).reduce((acc, so) => {
      if (!acc[so.container_id]) acc[so.container_id] = []
      acc[so.container_id].push(so)
      return acc
    }, {} as Record<string, typeof salesOrders[0][]>)

    // Build inventory rows
    const rows: ContainerInventory[] = (containers ?? []).map(container => {
      const presale = presaleMap[container.id] ?? null
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
        trip: tripMap[container.trip_id] ?? null,
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
          <button onClick={() => setShowFilters(v => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
              ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Filter size={15} /> Filters
            {activeFilters > 0 && <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>}
          </button>
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
                  'Pieces purchased', 'W/H pieces', 'Pieces sold', 'Pieces remaining',
                  'Pallets total', 'Pallets sold', 'Pallets available', 'Orders'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
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
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={row.pieces_sold > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}>
                          {row.pieces_sold > 0 ? row.pieces_sold.toLocaleString() : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-semibold ${row.pieces_remaining > 0 ? 'text-brand-700' : 'text-gray-300'}`}>
                          {row.pieces_remaining > 0 ? row.pieces_remaining.toLocaleString() : '0'}
                        </span>
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
                  {/* col 9: Pieces sold */}
                  <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pieces_sold, 0).toLocaleString()} pcs
                  </td>
                  {/* col 10: Pieces remaining */}
                  <td className="px-3 py-3 text-xs font-bold text-brand-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pieces_remaining, 0).toLocaleString()} pcs
                  </td>
                  {/* col 11: Pallets total */}
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pallets_total, 0)}
                  </td>
                  {/* col 12: Pallets sold */}
                  <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pallets_sold, 0)}
                  </td>
                  {/* col 13: Pallets available */}
                  <td className="px-3 py-3 text-xs font-bold text-brand-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.pallets_available, 0)}
                  </td>
                  {/* col 14: Orders */}
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">
                    {filtered.reduce((s, r) => s + r.total_orders, 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
