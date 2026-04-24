'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Search, Filter, Download, FileText,
  TrendingUp, TrendingDown, Minus, Package,
  DollarSign, Target, Zap, BarChart2, Loader2
} from 'lucide-react'
import Link from 'next/link'
import { usePermissions, can } from '@/lib/permissions/hooks'

interface ContainerProfitRow {
  container_db_id: string
  container_id: string
  tracking_number: string | null
  trip_id: string
  trip_title: string
  sale_type: string | null
  presale_id: string | null
  trip_created_at: string | null

  // Costs
  estimated_landing_cost: number
  pieces_purchased: number
  warehouse_confirmed_pieces: number | null

  // Presale
  price_per_piece: number | null
  expected_sale_revenue: number

  // Actual sales
  total_sales_to_date: number
  total_recovery_to_date: number
  pieces_sold: number
  pieces_remaining: number
  pallets_total: number
  pallets_sold: number
  pallets_remaining: number

  // Profit calculations
  expected_profit: number
  expected_profit_margin: number
  actual_profit: number
  actual_profit_margin: number
  unearned_profit: number
  total_commissions: number

  // Status
  sales_status: 'not_started' | 'in_progress' | 'completed'
  profit_status: 'profitable' | 'loss' | 'break_even' | 'pending'
}

const PROFIT_STATUS_CONFIG = {
  profitable:  { label: 'Profitable',  color: 'bg-green-50 text-green-700 border-green-200',  dot: 'bg-green-500',  icon: <TrendingUp size={12} /> },
  loss:        { label: 'Loss',         color: 'bg-red-50 text-red-600 border-red-200',        dot: 'bg-red-500',    icon: <TrendingDown size={12} /> },
  break_even:  { label: 'Break even',   color: 'bg-gray-100 text-gray-600 border-gray-200',    dot: 'bg-gray-400',   icon: <Minus size={12} /> },
  pending:     { label: 'Pending',      color: 'bg-amber-50 text-amber-700 border-amber-200',  dot: 'bg-amber-400',  icon: <Target size={12} /> },
}

const SALES_STATUS_CONFIG = {
  not_started: { label: 'Not started',     color: 'bg-gray-100 text-gray-600' },
  in_progress:  { label: 'In progress',     color: 'bg-blue-50 text-blue-700' },
  completed:    { label: 'Sales completed', color: 'bg-green-50 text-green-700' },
}

export default function ContainerProfitReportPage() {
  const router = useRouter()
  const { permissions, isSuperAdmin, loading: permLoading } = usePermissions()
  const canViewCosts = can(permissions, isSuperAdmin, 'view_costs')

  const [rows, setRows] = useState<ContainerProfitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [profitFilter, setProfitFilter] = useState('')
  const [salesFilter, setSalesFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 12

  const load = useCallback(async () => {
    const supabase = createClient()

    const [
      { data: containers },
      { data: presales },
      { data: salesOrders },
      { data: recoveries },
      { data: palletDists },
      { data: commissions },
    ] = await Promise.all([
      supabase.from('containers').select('id, container_id, tracking_number, trip_id, pieces_purchased, estimated_landing_cost, unit_price_usd, shipping_amount_usd'),
      supabase.from('presales').select('id, presale_id, container_id, sale_type, expected_sale_revenue, price_per_piece, warehouse_confirmed_pieces, total_number_of_pallets'),
      supabase.from('sales_orders').select('id, container_id, presale_id, customer_payable, sale_type'),
      supabase.from('recoveries').select('sales_order_id, amount_paid'),
      supabase.from('presale_pallet_distributions').select('presale_id, pallet_pieces, number_of_pallets, pallets_sold'),
      supabase.from('commissions').select('sales_order_id, commission_amount, status').in('status', ['approved', 'paid']),
    ])

    const tripIds = [...new Set((containers ?? []).map(c => c.trip_id).filter(Boolean))]
    const { data: trips } = tripIds.length > 0
      ? await supabase.from('trips').select('id, trip_id, title, created_at').in('id', tripIds)
      : { data: [] }

    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const presaleByContainer = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const ordersByPresale = (salesOrders ?? []).reduce((acc, o) => {
      if (!acc[o.presale_id]) acc[o.presale_id] = []
      acc[o.presale_id].push(o)
      return acc
    }, {} as Record<string, NonNullable<typeof salesOrders>[number][]>)
    const recsByOrder = (recoveries ?? []).reduce((acc, r) => {
      if (!acc[r.sales_order_id]) acc[r.sales_order_id] = []
      acc[r.sales_order_id].push(r)
      return acc
    }, {} as Record<string, NonNullable<typeof recoveries>[number][]>)
    const commissionsByOrder = (commissions ?? []).reduce((acc, c) => {
      acc[c.sales_order_id] = (acc[c.sales_order_id] ?? 0) + Number(c.commission_amount)
      return acc
    }, {} as Record<string, number>)
    const palletsByPresale = (palletDists ?? []).reduce((acc, pd) => {
      if (!acc[pd.presale_id]) acc[pd.presale_id] = []
      acc[pd.presale_id].push(pd)
      return acc
    }, {} as Record<string, NonNullable<typeof palletDists>[number][]>)

    const result: ContainerProfitRow[] = (containers ?? [])
      .filter(c => presaleByContainer[c.id])
      .map(container => {
        const presale = presaleByContainer[container.id]
        const orders = ordersByPresale[presale.id] ?? []
        const pallets = palletsByPresale[presale.id] ?? []
        const trip = tripMap[container.trip_id]

        const landingCost = Number(container.estimated_landing_cost ?? 0)
        const expectedRevenue = Number(presale.expected_sale_revenue ?? 0)
        const pricePerPiece = presale.price_per_piece ? Number(presale.price_per_piece) : null
        const whPieces = presale.warehouse_confirmed_pieces ?? 0

        // Sales to date
        const salesToDate = orders.reduce((s, o) => s + Number(o.customer_payable), 0)

        // Recovery to date
        const recoveryToDate = orders.reduce((s, o) => {
          return s + (recsByOrder[o.id] ?? []).reduce((rs, r) => rs + Number(r.amount_paid), 0)
        }, 0)

        // Pieces sold / remaining
        let piecesSold = 0
        let piecesRemaining = whPieces

        const palletsTotal = pallets.reduce((s, pd) => s + pd.number_of_pallets, 0)
        const palletsSold = pallets.reduce((s, pd) => s + pd.pallets_sold, 0)
        const palletsRemaining = palletsTotal - palletsSold

        if (presale.sale_type === 'box_sale') {
          piecesSold = orders.length > 0 ? whPieces : 0
          piecesRemaining = orders.length > 0 ? 0 : whPieces
        } else {
          const palletPiecesSold = pallets.reduce((s, pd) => s + pd.pallet_pieces * pd.pallets_sold, 0)
          const palletPiecesTotal = pallets.reduce((s, pd) => s + pd.pallet_pieces * pd.number_of_pallets, 0)
          piecesSold = palletPiecesSold
          piecesRemaining = palletPiecesTotal - palletPiecesSold
        }

        // Profit calculations
        const expectedProfit = expectedRevenue - landingCost
        const expectedProfitMargin = landingCost > 0 ? (expectedProfit / landingCost) * 100 : 0

        const totalCommissions = orders.reduce((s, o) => s + (commissionsByOrder[o.id] ?? 0), 0)
        const actualProfit = salesToDate - landingCost - totalCommissions
        const actualProfitMargin = landingCost > 0 ? (actualProfit / landingCost) * 100 : 0

        // Unearned profit = value of unsold pieces at presale price minus proportional cost
        const unearnedRevenue = piecesRemaining * (pricePerPiece ?? 0)
        const proportionalCost = whPieces > 0 ? (piecesRemaining / whPieces) * landingCost : 0
        const unearnedProfit = unearnedRevenue - proportionalCost

        // Sales status
        let salesStatus: ContainerProfitRow['sales_status'] = 'not_started'
        if (presale.sale_type === 'box_sale') {
          salesStatus = orders.length > 0 ? 'completed' : 'not_started'
        } else {
          if (orders.length === 0) salesStatus = 'not_started'
          else if (piecesRemaining > 0) salesStatus = 'in_progress'
          else salesStatus = 'completed'
        }

        // Profit status
        let profitStatus: ContainerProfitRow['profit_status'] = 'pending'
        if (salesStatus === 'completed') {
          if (actualProfitMargin > 2) profitStatus = 'profitable'
          else if (actualProfitMargin < -2) profitStatus = 'loss'
          else profitStatus = 'break_even'
        } else if (salesStatus === 'in_progress') {
          if (expectedProfitMargin > 2) profitStatus = 'profitable'
          else if (expectedProfitMargin < -2) profitStatus = 'loss'
          else profitStatus = 'break_even'
        }

        return {
          container_db_id: container.id,
          container_id: container.container_id,
          tracking_number: container.tracking_number,
          trip_id: trip?.trip_id ?? '—',
          trip_title: trip?.title ?? '—',
          sale_type: presale.sale_type,
          presale_id: presale.presale_id,
          trip_created_at: trip?.created_at ?? null,
          estimated_landing_cost: landingCost,
          pieces_purchased: container.pieces_purchased ?? 0,
          warehouse_confirmed_pieces: whPieces,
          price_per_piece: pricePerPiece,
          expected_sale_revenue: expectedRevenue,
          total_sales_to_date: salesToDate,
          total_recovery_to_date: recoveryToDate,
          pieces_sold: piecesSold,
          pieces_remaining: piecesRemaining,
          pallets_total: palletsTotal,
          pallets_sold: palletsSold,
          pallets_remaining: palletsRemaining,
          expected_profit: expectedProfit,
          expected_profit_margin: expectedProfitMargin,
          actual_profit: actualProfit,
          actual_profit_margin: actualProfitMargin,
          unearned_profit: unearnedProfit,
          total_commissions: totalCommissions,
          sales_status: salesStatus,
          profit_status: profitStatus,
        }
      })

    setRows(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (permLoading || !canViewCosts) return
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load, canViewCosts, permLoading])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

  const filtered = rows.filter(r => {
    const matchSearch = search === '' ||
      (r.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      r.container_id.toLowerCase().includes(search.toLowerCase()) ||
      r.trip_id.toLowerCase().includes(search.toLowerCase())
    const matchProfit = profitFilter === '' || r.profit_status === profitFilter
    const matchSales = salesFilter === '' || r.sales_status === salesFilter
    const matchFrom = dateFrom === '' || !r.trip_created_at || new Date(r.trip_created_at) >= new Date(dateFrom)
    const matchTo = dateTo === '' || !r.trip_created_at || new Date(r.trip_created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchProfit && matchSales && matchFrom && matchTo
  })

  const activeFilters = [profitFilter, salesFilter, dateFrom, dateTo].filter(Boolean).length
  const paginatedFiltered = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  // Portfolio metrics
  const totalLandingCost = filtered.reduce((s, r) => s + r.estimated_landing_cost, 0)
  const totalExpectedRevenue = filtered.reduce((s, r) => s + r.expected_sale_revenue, 0)
  const totalExpectedProfit = filtered.reduce((s, r) => s + r.expected_profit, 0)
  const totalActualProfit = filtered.reduce((s, r) => s + (r.sales_status === 'completed' ? r.actual_profit : 0), 0)
  const totalUnearnedProfit = filtered.reduce((s, r) => s + Math.max(r.unearned_profit, 0), 0)
  const totalCommissions = filtered.reduce((s, r) => s + r.total_commissions, 0)
  const completedCount = filtered.filter(r => r.sales_status === 'completed').length
  const portfolioMargin = totalLandingCost > 0 ? ((totalExpectedRevenue - totalLandingCost) / totalLandingCost) * 100 : 0

  function generateReport(type: 'filtered' | 'full') {
    if (!canViewCosts) return
    const data = type === 'filtered' ? filtered : rows
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Container Profit Report — Hydevest</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1a1a2e}
      .header{background:#55249E;color:white;padding:32px 40px}
      .header h1{font-size:24px;font-weight:700}.header p{font-size:13px;opacity:.8;margin-top:4px}
      .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:20px 40px;background:#f8f7ff;border-bottom:1px solid #e8e0ff}
      .card{background:white;border-radius:8px;padding:14px;border:1px solid #ede9f7}
      .card .label{font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px}
      .card .value{font-size:15px;font-weight:700;color:#55249E}
      .content{padding:24px 40px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      thead tr{background:#55249E;color:white}
      thead th{padding:9px 10px;text-align:left;font-weight:600;text-transform:uppercase;white-space:nowrap}
      tbody tr{border-bottom:1px solid #f0ebff}tbody tr:nth-child(even){background:#faf8ff}
      tbody td{padding:8px 10px;color:#374151;white-space:nowrap}
      .profitable{color:#15803d;font-weight:700}.loss{color:#dc2626;font-weight:700}
      .footer{padding:20px 40px;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="header"><h1>Container Sales Profit Report</h1>
    <p>Hydevest Portal — ${type === 'filtered' ? 'Filtered View' : 'Full Report'} · Generated ${new Date().toLocaleString()}</p></div>
    <div class="summary">
      <div class="card"><div class="label">Total landing cost</div><div class="value">₦${data.reduce((s,r)=>s+r.estimated_landing_cost,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Expected revenue</div><div class="value">₦${data.reduce((s,r)=>s+r.expected_sale_revenue,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Expected profit</div><div class="value">₦${data.reduce((s,r)=>s+r.expected_profit,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Actual profit (completed)</div><div class="value">₦${data.filter(r=>r.sales_status==='completed').reduce((s,r)=>s+r.actual_profit,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Unearned profit</div><div class="value">₦${data.reduce((s,r)=>s+Math.max(r.unearned_profit,0),0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    </div>
    <div class="content"><table><thead><tr>
      <th>Container</th><th>Tracking No.</th><th>Trip</th><th>Type</th>
      <th>Landing Cost</th><th>Exp. Revenue</th><th>Exp. Profit</th><th>Exp. Margin</th>
      <th>Actual Sales</th><th>Actual Profit</th><th>Act. Margin</th>
      <th>Unearned Profit</th><th>Sales Status</th><th>Profit Status</th>
    </tr></thead><tbody>
    ${data.map(r=>`<tr>
      <td><strong style="color:#55249E">${r.container_id}</strong></td>
      <td>${r.tracking_number??'—'}</td><td>${r.trip_id}</td>
      <td>${r.sale_type==='box_sale'?'Box':'Split'}</td>
      <td>₦${r.estimated_landing_cost.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td>₦${r.expected_sale_revenue.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td class="${r.expected_profit>=0?'profitable':'loss'}">₦${r.expected_profit.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td class="${r.expected_profit_margin>=0?'profitable':'loss'}">${fmtPct(r.expected_profit_margin)}</td>
      <td>${r.total_sales_to_date>0?'₦'+r.total_sales_to_date.toLocaleString(undefined,{minimumFractionDigits:2}):'—'}</td>
      <td class="${r.actual_profit>=0?'profitable':'loss'}">${r.total_sales_to_date>0?'₦'+r.actual_profit.toLocaleString(undefined,{minimumFractionDigits:2}):'—'}</td>
      <td class="${r.actual_profit_margin>=0?'profitable':'loss'}">${r.total_sales_to_date>0?fmtPct(r.actual_profit_margin):'—'}</td>
      <td>${r.unearned_profit>0?'₦'+r.unearned_profit.toLocaleString(undefined,{minimumFractionDigits:2}):'—'}</td>
      <td>${SALES_STATUS_CONFIG[r.sales_status].label}</td>
      <td>${PROFIT_STATUS_CONFIG[r.profit_status].label}</td>
    </tr>`).join('')}
    </tbody></table></div>
    <div class="footer">Hydevest Portal · Container Profit Report · Confidential</div>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  function exportCSV() {
    if (!canViewCosts) return
    const headers = ['Container','Tracking No.','Trip','Sale Type','Landing Cost','Exp. Revenue','Exp. Profit','Exp. Margin %','Actual Sales','Actual Profit','Act. Margin %','Unearned Profit','Sales Status','Profit Status']
    const csvRows = filtered.map(r => [
      r.container_id, r.tracking_number??'', r.trip_id,
      r.sale_type??'', r.estimated_landing_cost, r.expected_sale_revenue,
      r.expected_profit, r.expected_profit_margin.toFixed(1),
      r.total_sales_to_date, r.actual_profit, r.actual_profit_margin.toFixed(1),
      r.unearned_profit, SALES_STATUS_CONFIG[r.sales_status].label,
      PROFIT_STATUS_CONFIG[r.profit_status].label,
    ])
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `container-profit-report-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/reports"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Container Sales Profit Report</h1>
          <p className="text-sm text-gray-400 mt-0.5">Profit analysis across all presaled containers</p>
        </div>
      </div>

      {permLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-brand-600" size={28} />
        </div>
      ) : canViewCosts ? (
        <>
          {/* Portfolio overview cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {[
              { label: 'Total landing cost', value: fmt(totalLandingCost), color: 'text-gray-900', icon: <Package size={14} className="text-gray-500" /> },
              { label: 'Expected revenue', value: fmt(totalExpectedRevenue), color: 'text-brand-700', icon: <Target size={14} className="text-brand-600" /> },
              { label: 'Expected profit', value: fmt(totalExpectedProfit), color: totalExpectedProfit >= 0 ? 'text-green-700' : 'text-red-600', icon: <TrendingUp size={14} className={totalExpectedProfit >= 0 ? 'text-green-600' : 'text-red-500'} /> },
              { label: 'Total commissions', value: fmt(totalCommissions), color: 'text-purple-700', icon: <TrendingUp size={14} className="text-purple-600" /> },
              { label: 'Actual profit', value: completedCount > 0 ? fmt(totalActualProfit) : '—', color: totalActualProfit >= 0 ? 'text-green-700' : 'text-red-600', icon: <Zap size={14} className={totalActualProfit >= 0 ? 'text-green-600' : 'text-red-500'} /> },
              { label: 'Unearned profit', value: fmt(totalUnearnedProfit), color: 'text-amber-700', icon: <BarChart2 size={14} className="text-amber-600" /> },
              { label: 'Portfolio margin', value: fmtPct(portfolioMargin), color: portfolioMargin >= 0 ? 'text-green-700' : 'text-red-600', icon: <DollarSign size={14} className={portfolioMargin >= 0 ? 'text-green-600' : 'text-red-500'} /> },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-1.5 mb-1">{m.icon}<p className="text-xs text-gray-400 leading-tight">{m.label}</p></div>
                <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Profit status summary pills */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Portfolio breakdown:</span>
            {Object.entries(PROFIT_STATUS_CONFIG).map(([key, cfg]) => {
              const count = filtered.filter(r => r.profit_status === key).length
              if (count === 0) return null
              return (
            <button key={key}
              onClick={() => { setProfitFilter(profitFilter === key ? '' : key); setCurrentPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-all
                ${profitFilter === key ? cfg.color + ' shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}: {count}
                </button>
              )
            })}
          </div>

          {/* Search + filters */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
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
                <button onClick={exportCSV}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                  <Download size={15} /> Export
                </button>
              </div>
            </div>
            {showFilters && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Profit status</label>
              <select value={profitFilter} onChange={e => { setProfitFilter(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                    <option value="">All</option>
                    <option value="profitable">Profitable</option>
                    <option value="break_even">Break even</option>
                    <option value="loss">Loss</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Sales status</label>
              <select value={salesFilter} onChange={e => { setSalesFilter(e.target.value); setCurrentPage(1) }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                    <option value="">All</option>
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Trip date from</label>
                  <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setCurrentPage(1) }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Trip date to</label>
                  <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setCurrentPage(1) }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                {activeFilters > 0 && (
                  <div className="flex items-end pb-0.5">
                    <button onClick={() => { setProfitFilter(''); setSalesFilter(''); setDateFrom(''); setDateTo(''); setCurrentPage(1) }}
                      className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Profit analysis cards — one per container */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-8 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
              <BarChart2 size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No containers with profit data found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {paginatedFiltered.map(row => {
                const profitCfg = PROFIT_STATUS_CONFIG[row.profit_status]
                const salesCfg = SALES_STATUS_CONFIG[row.sales_status]
                const isCompleted = row.sales_status === 'completed'
                const displayProfit = isCompleted ? row.actual_profit : row.expected_profit
                const displayMargin = isCompleted ? row.actual_profit_margin : row.expected_profit_margin
                const isPositive = displayProfit >= 0
                const landingPct = row.expected_sale_revenue > 0
                  ? Math.min((row.estimated_landing_cost / row.expected_sale_revenue) * 100, 100)
                  : 0
                const salesPct = row.expected_sale_revenue > 0
                  ? Math.min((row.total_sales_to_date / row.expected_sale_revenue) * 100, 100)
                  : 0

                return (
                  <div key={row.container_db_id}
                    onClick={() => router.push(`/portal/reports/container-profit/${row.container_db_id}`)}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden">

                    {/* Card header */}
                    <div className={`px-5 pt-5 pb-4 ${isPositive ? 'bg-gradient-to-br from-green-50/50 to-white' : 'bg-gradient-to-br from-red-50/30 to-white'}`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{row.container_id}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${salesCfg.color}`}>{salesCfg.label}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1 font-mono truncate">{row.tracking_number ?? '—'} · {row.trip_id}</p>
                          {row.trip_created_at && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Trip started: {new Date(row.trip_created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border shrink-0 ${profitCfg.color}`}>
                          {profitCfg.icon}
                          {profitCfg.label}
                        </div>
                      </div>

                      {/* Big profit number */}
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">{isCompleted ? 'Actual profit' : 'Expected profit'}</p>
                          <p className={`text-lg font-bold ${isPositive ? 'text-green-700' : 'text-red-600'}`}>
                            {isPositive ? '+' : ''}{fmt(displayProfit)}
                          </p>
                        </div>
                        <div className={`text-right`}>
                          <p className="text-xs text-gray-400 mb-0.5">Margin</p>
                          <p className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                            {fmtPct(displayMargin)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Progress bars */}
                    <div className="px-5 py-3 border-t border-gray-50 space-y-2.5">
                      {/* Landing cost vs expected revenue */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Landing cost</span>
                          <span className="font-medium text-gray-700">{fmt(row.estimated_landing_cost)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-400 rounded-full" style={{ width: `${landingPct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{isCompleted ? 'Sales achieved' : 'Sales to date'}</span>
                          <span className="font-medium text-gray-700">{row.total_sales_to_date > 0 ? fmt(row.total_sales_to_date) : fmt(row.expected_sale_revenue)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${isCompleted ? (isPositive ? 'bg-green-500' : 'bg-red-400') : 'bg-brand-400'}`}
                            style={{ width: `${isCompleted ? Math.min(salesPct, 100) : 100}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Footer metrics */}
                    <div className="px-5 pb-4 pt-1 grid grid-cols-4 gap-2 border-t border-gray-50">
                      <div>
                        <p className="text-xs text-gray-400 text-[10px]">Exp. revenue</p>
                        <p className="text-xs font-semibold text-gray-700 truncate text-[11px]">{fmt(row.expected_sale_revenue)}</p>
                      </div>
                      {row.total_commissions > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 text-[10px]">Commissions</p>
                          <p className="text-xs font-semibold text-purple-600 truncate text-[11px]">{fmt(row.total_commissions)}</p>
                        </div>
                      )}
                      {!isCompleted && row.unearned_profit > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 text-[10px]">Unearned</p>
                          <p className="text-xs font-semibold text-amber-600 truncate text-[11px]">{fmt(row.unearned_profit)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-gray-400">
                          {row.sale_type === 'split_sale' ? 'Pallets left' : 'Type'}
                        </p>
                        <p className="text-[11px] font-semibold text-gray-700">
                          {row.sale_type === 'split_sale'
                            ? `${row.pallets_remaining} / ${row.pallets_total}`
                            : 'Box sale'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Sale type</p>
                        <span className={`text-xs font-medium ${row.sale_type === 'box_sale' ? 'text-blue-600' : 'text-purple-600'}`}>
                          {row.sale_type === 'box_sale' ? 'Box' : 'Split'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3">
              <p className="text-sm text-gray-500">
                Showing <span className="font-semibold text-gray-700">{((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</span> of <span className="font-semibold text-gray-700">{filtered.length}</span> containers
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum = i + 1
                    if (totalPages > 7) {
                      if (currentPage <= 4) pageNum = i + 1
                      else if (currentPage >= totalPages - 3) pageNum = totalPages - 6 + i
                      else pageNum = currentPage - 3 + i
                    }
                    return (
                      <button key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 text-xs font-medium rounded-lg transition-colors
                          ${currentPage === pageNum ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Report modal */}
          {reportOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <h2 className="text-base font-semibold text-gray-900">Generate report</h2>
                <div className="space-y-2">
                  {(['filtered', 'full'] as const).map(t => (
                    <button key={t} onClick={() => setReportType(t)}
                      className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType===t?'border-brand-400 bg-brand-50':'border-gray-100 hover:border-gray-200'}`}>
                      <p className={`text-sm font-semibold ${reportType===t?'text-brand-700':'text-gray-700'}`}>{t==='filtered'?'Filtered view':'Full report'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t==='filtered'?`${filtered.length} containers`:`${rows.length} total`}</p>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setReportOpen(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button onClick={() => generateReport(reportType)}
                    className="flex-1 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700">Generate</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600">Access restricted</p>
          <p className="text-xs text-gray-400 text-center max-w-xs">You do not have permission to view cost and profit data. Contact your administrator.</p>
        </div>
      )}
    </div>
  )
}
