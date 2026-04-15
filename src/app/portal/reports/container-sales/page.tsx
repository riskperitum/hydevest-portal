'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Search, Filter, Download, FileText, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ContainerSalesRow {
  // Container + presale info
  container_db_id: string
  container_id: string
  tracking_number: string | null
  trip_id: string
  trip: { trip_id: string; title: string } | null
  presale_id: string
  sale_type: string
  presale_status: string

  // Financials
  expected_revenue: number
  price_per_piece: number | null
  warehouse_confirmed_pieces: number | null
  total_number_of_pallets: number | null

  // Sales figures
  sales_to_date: number
  recovery_to_date: number
  receivables: number

  // Inventory
  pieces_remaining: number
  pallets_remaining: number
  unsold_stock_value: number

  // Status
  sales_status: 'not_started' | 'in_progress' | 'completed'
}

const SALES_STATUS_CONFIG = {
  not_started: { label: 'Not started',      color: 'bg-gray-100 text-gray-600' },
  in_progress:  { label: 'In progress',      color: 'bg-amber-50 text-amber-700' },
  completed:    { label: 'Sales completed',  color: 'bg-green-50 text-green-700' },
}

export default function ContainerSalesReportPage() {
  const router = useRouter()
  const [rows, setRows] = useState<ContainerSalesRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')

  const load = useCallback(async () => {
    const supabase = createClient()

    const [
      { data: presales },
      { data: containers },
      { data: salesOrders },
      { data: recoveries },
      { data: palletDists },
    ] = await Promise.all([
      supabase.from('presales').select('id, presale_id, container_id, sale_type, status, expected_sale_revenue, price_per_piece, warehouse_confirmed_pieces, total_number_of_pallets'),
      supabase.from('containers').select('id, container_id, tracking_number, trip_id'),
      supabase.from('sales_orders').select('id, presale_id, container_id, customer_payable, sale_type'),
      supabase.from('recoveries').select('sales_order_id, amount_paid, payment_type'),
      supabase.from('presale_pallet_distributions').select('id, presale_id, pallet_pieces, number_of_pallets, pallets_sold'),
    ])

    // Load trips
    const tripIds = [...new Set((containers ?? []).map(c => c.trip_id).filter(Boolean))]
    const { data: trips } = tripIds.length > 0
      ? await supabase.from('trips').select('id, trip_id, title').in('id', tripIds)
      : { data: [] }

    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const containerMap = Object.fromEntries((containers ?? []).map(c => [c.id, c]))

    // Group sales orders by presale
    const ordersByPresale = (salesOrders ?? []).reduce((acc, so) => {
      if (!acc[so.presale_id]) acc[so.presale_id] = []
      acc[so.presale_id].push(so)
      return acc
    }, {} as Record<string, typeof salesOrders[0][]>)

    // Group recoveries by sales order
    const recoveriesByOrder = (recoveries ?? []).reduce((acc, r) => {
      if (!acc[r.sales_order_id]) acc[r.sales_order_id] = []
      acc[r.sales_order_id].push(r)
      return acc
    }, {} as Record<string, typeof recoveries[0][]>)

    // Group pallet distributions by presale
    const palletsByPresale = (palletDists ?? []).reduce((acc, pd) => {
      if (!acc[pd.presale_id]) acc[pd.presale_id] = []
      acc[pd.presale_id].push(pd)
      return acc
    }, {} as Record<string, typeof palletDists[0][]>)

    const result: ContainerSalesRow[] = (presales ?? []).map(presale => {
      const container = containerMap[presale.container_id]
      const orders = ordersByPresale[presale.id] ?? []
      const pallets = palletsByPresale[presale.id] ?? []

      // Sales to date — sum of all customer_payable across orders
      const salesToDate = orders.reduce((s, o) => s + Number(o.customer_payable), 0)

      // Recovery to date — sum of all recoveries across all orders for this presale
      const recoveryToDate = orders.reduce((s, o) => {
        const recs = recoveriesByOrder[o.id] ?? []
        return s + recs.reduce((rs, r) => rs + Number(r.amount_paid), 0)
      }, 0)

      // Receivables — what is owed but not yet recovered
      const receivables = salesToDate - recoveryToDate

      // Pallet / piece availability
      const palletsTotal = pallets.reduce((s, pd) => s + pd.number_of_pallets, 0)
      const palletsSold = pallets.reduce((s, pd) => s + pd.pallets_sold, 0)
      const palletsRemaining = palletsTotal - palletsSold

      let piecesRemaining = 0
      if (presale.sale_type === 'box_sale') {
        piecesRemaining = orders.length > 0 ? 0 : (presale.warehouse_confirmed_pieces ?? 0)
      } else {
        piecesRemaining = pallets.reduce((s, pd) => s + pd.pallet_pieces * (pd.number_of_pallets - pd.pallets_sold), 0)
      }

      // Unsold stock value
      const unsoldStockValue = piecesRemaining * (presale.price_per_piece ?? 0)

      // Sales status
      let salesStatus: ContainerSalesRow['sales_status'] = 'not_started'
      if (presale.sale_type === 'box_sale') {
        if (orders.length > 0) salesStatus = 'completed'
        else salesStatus = 'not_started'
      } else {
        if (orders.length === 0) salesStatus = 'not_started'
        else if (palletsRemaining > 0) salesStatus = 'in_progress'
        else salesStatus = 'completed'
      }

      return {
        container_db_id: container?.id ?? presale.container_id,
        container_id: container?.container_id ?? '—',
        tracking_number: container?.tracking_number ?? null,
        trip_id: container?.trip_id ?? '',
        trip: container?.trip_id ? (tripMap[container.trip_id] ?? null) : null,
        presale_id: presale.presale_id,
        sale_type: presale.sale_type,
        presale_status: presale.status,
        expected_revenue: Number(presale.expected_sale_revenue ?? 0),
        price_per_piece: presale.price_per_piece ? Number(presale.price_per_piece) : null,
        warehouse_confirmed_pieces: presale.warehouse_confirmed_pieces,
        total_number_of_pallets: presale.total_number_of_pallets,
        sales_to_date: salesToDate,
        recovery_to_date: recoveryToDate,
        receivables: Math.max(receivables, 0),
        pieces_remaining: piecesRemaining,
        pallets_remaining: palletsRemaining,
        unsold_stock_value: unsoldStockValue,
        sales_status: salesStatus,
      }
    })

    setRows(result)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filtered = rows.filter(r => {
    const matchSearch = search === '' ||
      (r.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      r.container_id.toLowerCase().includes(search.toLowerCase()) ||
      r.presale_id.toLowerCase().includes(search.toLowerCase()) ||
      (r.trip?.trip_id ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || r.sales_status === statusFilter
    const matchType = saleTypeFilter === '' || r.sale_type === saleTypeFilter
    return matchSearch && matchStatus && matchType
  })

  const activeFilters = [statusFilter, saleTypeFilter].filter(Boolean).length

  // Aggregate totals
  const totalExpected = filtered.reduce((s, r) => s + r.expected_revenue, 0)
  const totalSales = filtered.reduce((s, r) => s + r.sales_to_date, 0)
  const totalRecovery = filtered.reduce((s, r) => s + r.recovery_to_date, 0)
  const totalReceivables = filtered.reduce((s, r) => s + r.receivables, 0)
  const totalUnsold = filtered.reduce((s, r) => s + r.unsold_stock_value, 0)

  function generateReport(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filtered : rows
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Container Sales Report — Hydevest</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,sans-serif;color:#1a1a2e}
      .header{background:#55249E;color:white;padding:32px 40px}
      .header h1{font-size:24px;font-weight:700}
      .header p{font-size:13px;opacity:.8;margin-top:4px}
      .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:20px 40px;background:#f8f7ff;border-bottom:1px solid #e8e0ff}
      .card{background:white;border-radius:8px;padding:14px;border:1px solid #ede9f7}
      .card .label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
      .card .value{font-size:16px;font-weight:700;color:#55249E}
      .content{padding:24px 40px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      thead tr{background:#55249E;color:white}
      thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap}
      tbody tr{border-bottom:1px solid #f0ebff}
      tbody tr:nth-child(even){background:#faf8ff}
      tbody td{padding:9px 12px;color:#374151;white-space:nowrap}
      tfoot tr{background:#55249E;color:white}
      tfoot td{padding:10px 12px;font-weight:700;font-size:11px}
      .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600}
      .not_started{background:#f3f4f6;color:#4b5563}
      .in_progress{background:#fffbeb;color:#b45309}
      .completed{background:#f0fdf4;color:#15803d}
      .footer{padding:20px 40px;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="header">
      <h1>Container Sales Report</h1>
      <p>Hydevest Portal — ${type === 'filtered' ? 'Filtered View' : 'Full Report'} · Generated ${new Date().toLocaleString()}</p>
    </div>
    <div class="summary">
      <div class="card"><div class="label">Expected revenue</div><div class="value">₦${data.reduce((s,r)=>s+r.expected_revenue,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Sales to date</div><div class="value">₦${data.reduce((s,r)=>s+r.sales_to_date,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Recovery to date</div><div class="value">₦${data.reduce((s,r)=>s+r.recovery_to_date,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Receivables</div><div class="value">₦${data.reduce((s,r)=>s+r.receivables,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Unsold stock value</div><div class="value">₦${data.reduce((s,r)=>s+r.unsold_stock_value,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    </div>
    <div class="content">
      <table><thead><tr>
        <th>Tracking No.</th><th>Container</th><th>Presale</th><th>Trip</th><th>Type</th>
        <th>Expected Revenue</th><th>Sales to Date</th><th>Recovery to Date</th>
        <th>Receivables</th><th>Unsold Stock Value</th><th>Sales Status</th>
      </tr></thead><tbody>
      ${data.map(r=>`<tr>
        <td><strong>${r.tracking_number??'—'}</strong></td>
        <td>${r.container_id}</td>
        <td>${r.presale_id}</td>
        <td>${r.trip?.trip_id??'—'}</td>
        <td>${r.sale_type==='box_sale'?'Box sale':'Split sale'}</td>
        <td>₦${r.expected_revenue.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td>₦${r.sales_to_date.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td>₦${r.recovery_to_date.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td style="color:${r.receivables>0?'#dc2626':'#16a34a'}">₦${r.receivables.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td>₦${r.unsold_stock_value.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td><span class="badge ${r.sales_status}">${SALES_STATUS_CONFIG[r.sales_status].label}</span></td>
      </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="5">Totals — ${data.length} container${data.length!==1?'s':''}</td>
        <td>₦${data.reduce((s,r)=>s+r.expected_revenue,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td>₦${data.reduce((s,r)=>s+r.sales_to_date,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td>₦${data.reduce((s,r)=>s+r.recovery_to_date,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td>₦${data.reduce((s,r)=>s+r.receivables,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td>₦${data.reduce((s,r)=>s+r.unsold_stock_value,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        <td></td>
      </tr></tfoot>
      </table>
    </div>
    <div class="footer">Hydevest Portal · Container Sales Report · Confidential</div>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  function exportCSV() {
    const headers = ['Tracking No.','Container ID','Presale ID','Trip','Sale Type','Expected Revenue','Sales to Date','Recovery to Date','Receivables','Unsold Stock Value','Sales Status']
    const csvRows = filtered.map(r => [
      r.tracking_number ?? '',
      r.container_id,
      r.presale_id,
      r.trip?.trip_id ?? '',
      r.sale_type === 'box_sale' ? 'Box sale' : 'Split sale',
      r.expected_revenue,
      r.sales_to_date,
      r.recovery_to_date,
      r.receivables,
      r.unsold_stock_value,
      SALES_STATUS_CONFIG[r.sales_status].label,
    ])
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `container-sales-report-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/reports"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Container Sales Report</h1>
          <p className="text-sm text-gray-400 mt-0.5">Revenue, recovery and receivables per container</p>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Expected revenue', value: fmt(totalExpected), color: 'text-brand-700' },
          { label: 'Sales to date', value: fmt(totalSales), color: 'text-blue-700' },
          { label: 'Recovery to date', value: fmt(totalRecovery), color: 'text-green-700' },
          { label: 'Receivables', value: fmt(totalReceivables), color: totalReceivables > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Unsold stock value', value: fmt(totalUnsold), color: 'text-amber-700' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
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
              placeholder="Search by tracking number, container or presale ID..."
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sales status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All statuses</option>
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Sales completed</option>
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[
                  'Tracking No.', 'Container', 'Presale', 'Trip', 'Type',
                  'Expected Revenue', 'Sales to Date', 'Recovery to Date',
                  'Receivables', 'Unsold Stock Value', 'Sales Status'
                ].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center">
                    <p className="text-sm text-gray-400">No presaled containers found.</p>
                  </td>
                </tr>
              ) : filtered.map(row => {
                const statusCfg = SALES_STATUS_CONFIG[row.sales_status]
                return (
                  <tr key={row.container_db_id}
                    onClick={() => router.push(`/portal/reports/container-sales/${row.container_db_id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors cursor-pointer">
                    <td className="px-3 py-3 font-mono text-xs text-gray-700 whitespace-nowrap font-medium">
                      {row.tracking_number ?? '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{row.container_id}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-500">{row.presale_id}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{row.trip?.trip_id ?? '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {row.sale_type === 'box_sale' ? 'Box' : 'Split'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{fmt(row.expected_revenue)}</td>
                    <td className="px-3 py-3 text-blue-700 font-medium whitespace-nowrap">{row.sales_to_date > 0 ? fmt(row.sales_to_date) : '—'}</td>
                    <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap">{row.recovery_to_date > 0 ? fmt(row.recovery_to_date) : '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${row.receivables > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {row.receivables > 0 ? fmt(row.receivables) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={row.unsold_stock_value > 0 ? 'text-amber-600 font-medium' : 'text-gray-300'}>
                        {row.unsold_stock_value > 0 ? fmt(row.unsold_stock_value) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
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
                    {t === 'filtered' ? `${filtered.length} containers` : `${rows.length} total containers`}
                  </p>
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
    </div>
  )
}
