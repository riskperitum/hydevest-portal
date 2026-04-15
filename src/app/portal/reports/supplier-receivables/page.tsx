'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Search, Filter, Download, FileText,
  Loader2, ArrowRightLeft, AlertTriangle, CheckCircle2,
  Clock, XCircle
} from 'lucide-react'
import Link from 'next/link'

interface ReceivableRow {
  id: string
  container_id: string
  container_db_id: string
  tracking_number: string | null
  pieces_purchased: number | null
  supplier_loaded_pieces: number | null
  trip_id: string
  trip_title: string
  trip_created_at: string | null
  supplier_name: string | null
  missing_pieces: number
  unit_price_usd: number
  gross_value_usd: number
  agreed_value_usd: number | null
  total_applied_usd: number
  total_written_off_usd: number
  remaining_usd: number
  status: 'open' | 'partially_applied' | 'fully_applied' | 'written_off'
}

const STATUS_CONFIG = {
  open:              { label: 'Open',              color: 'bg-red-50 text-red-600 border-red-200',    dot: 'bg-red-500'    },
  partially_applied: { label: 'Partially applied', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  fully_applied:     { label: 'Fully applied',     color: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  written_off:       { label: 'Written off',       color: 'bg-gray-100 text-gray-500 border-gray-200',   dot: 'bg-gray-400'  },
}

const fmtUSD = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SupplierReceivablesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<ReceivableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: receivables } = await supabase
      .from('supplier_receivables')
      .select(`
        id, missing_pieces, unit_price_usd, gross_value_usd,
        agreed_value_usd, total_applied_usd, total_written_off_usd,
        remaining_usd, status,
        container:containers(id, container_id, tracking_number),
        trip:trips(id, trip_id, title, created_at),
        supplier:suppliers(name)
      `)
      .order('created_at', { ascending: false })

    // Fetch pieces_purchased and supplier_loaded_pieces from presales
    const containerIds = (receivables ?? []).map(r => (r.container as any)?.id).filter(Boolean)
    const { data: presaleData } = containerIds.length > 0
      ? await supabase.from('presales')
          .select('container_id, supplier_loaded_pieces')
          .in('container_id', containerIds)
      : { data: [] }
    const { data: containerData } = containerIds.length > 0
      ? await supabase.from('containers')
          .select('id, pieces_purchased')
          .in('id', containerIds)
      : { data: [] }

    const presaleMap = Object.fromEntries((presaleData ?? []).map(p => [p.container_id, p]))
    const containerPiecesMap = Object.fromEntries((containerData ?? []).map(c => [c.id, c.pieces_purchased]))

    setRows((receivables ?? []).map(r => ({
      id: r.id,
      container_id: (r.container as any)?.container_id ?? '—',
      container_db_id: (r.container as any)?.id ?? '',
      tracking_number: (r.container as any)?.tracking_number ?? null,
      pieces_purchased: containerPiecesMap[(r.container as any)?.id] ?? null,
      supplier_loaded_pieces: presaleMap[(r.container as any)?.id]?.supplier_loaded_pieces ?? null,
      trip_id: (r.trip as any)?.trip_id ?? '—',
      trip_title: (r.trip as any)?.title ?? '—',
      trip_created_at: (r.trip as any)?.created_at ?? null,
      supplier_name: (r.supplier as any)?.name ?? null,
      missing_pieces: r.missing_pieces,
      unit_price_usd: Number(r.unit_price_usd),
      gross_value_usd: Number(r.gross_value_usd),
      agreed_value_usd: r.agreed_value_usd ? Number(r.agreed_value_usd) : null,
      total_applied_usd: Number(r.total_applied_usd),
      total_written_off_usd: Number(r.total_written_off_usd),
      remaining_usd: Number(r.remaining_usd ?? 0),
      status: r.status as ReceivableRow['status'],
    })))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    const matchSearch = search === '' ||
      r.container_id.toLowerCase().includes(search.toLowerCase()) ||
      r.trip_id.toLowerCase().includes(search.toLowerCase()) ||
      r.trip_title.toLowerCase().includes(search.toLowerCase()) ||
      (r.supplier_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.tracking_number ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || r.status === statusFilter
    const matchFrom = dateFrom === '' || !r.trip_created_at || new Date(r.trip_created_at) >= new Date(dateFrom)
    const matchTo = dateTo === '' || !r.trip_created_at || new Date(r.trip_created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchFrom && matchTo
  })

  const activeFilters = [statusFilter, dateFrom, dateTo].filter(Boolean).length
  const totalGross = filtered.reduce((s, r) => s + r.gross_value_usd, 0)
  const totalAgreed = filtered.reduce((s, r) => s + (r.agreed_value_usd ?? r.gross_value_usd), 0)
  const totalApplied = filtered.reduce((s, r) => s + r.total_applied_usd, 0)
  const totalWrittenOff = filtered.reduce((s, r) => s + r.total_written_off_usd, 0)
  const totalRemaining = filtered.reduce((s, r) => s + r.remaining_usd, 0)

  function generateReport(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filtered : rows
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Supplier Receivables Report — Hydevest</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1a1a2e}
      .header{background:#55249E;color:white;padding:32px 40px}.header h1{font-size:24px;font-weight:700}
      .header p{font-size:13px;opacity:.8;margin-top:4px}
      .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:20px 40px;background:#f8f7ff;border-bottom:1px solid #e8e0ff}
      .card{background:white;border-radius:8px;padding:14px;border:1px solid #ede9f7}
      .card .label{font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px}
      .card .value{font-size:15px;font-weight:700;color:#55249E}
      .content{padding:24px 40px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      thead tr{background:#55249E;color:white}
      thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap}
      tbody tr{border-bottom:1px solid #f0ebff}tbody tr:nth-child(even){background:#faf8ff}
      tbody td{padding:9px 12px;color:#374151;white-space:nowrap}
      .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600}
      .open{background:#fef2f2;color:#dc2626}
      .partially_applied{background:#fffbeb;color:#b45309}
      .fully_applied{background:#f0fdf4;color:#15803d}
      .written_off{background:#f3f4f6;color:#6b7280}
      .footer{padding:20px 40px;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="header"><h1>Supplier Receivables Report</h1>
    <p>Hydevest Portal · Generated ${new Date().toLocaleString()}</p></div>
    <div class="summary">
      <div class="card"><div class="label">Total containers</div><div class="value">${data.length}</div></div>
      <div class="card"><div class="label">Gross value (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.gross_value_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Total applied (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.total_applied_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Written off (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.total_written_off_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Remaining (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.remaining_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    </div>
    <div class="content"><table><thead><tr>
      <th>Container</th><th>Tracking No.</th><th>Trip</th><th>Supplier</th>
      <th>Missing Pieces</th><th>Unit Price</th><th>Gross Value</th>
      <th>Agreed Value</th><th>Applied</th><th>Written Off</th><th>Remaining</th><th>Status</th>
    </tr></thead><tbody>
    ${data.map(r=>`<tr>
      <td><strong style="color:#55249E">${r.container_id}</strong></td>
      <td>${r.tracking_number??'—'}</td>
      <td>${r.trip_id}</td>
      <td>${r.supplier_name??'—'}</td>
      <td>${r.missing_pieces}</td>
      <td>$${r.unit_price_usd.toFixed(2)}</td>
      <td>$${r.gross_value_usd.toFixed(2)}</td>
      <td>${r.agreed_value_usd?'$'+r.agreed_value_usd.toFixed(2):'—'}</td>
      <td>$${r.total_applied_usd.toFixed(2)}</td>
      <td>$${r.total_written_off_usd.toFixed(2)}</td>
      <td style="color:${r.remaining_usd>0?'#dc2626':'#16a34a'}">$${r.remaining_usd.toFixed(2)}</td>
      <td><span class="badge ${r.status}">${STATUS_CONFIG[r.status].label}</span></td>
    </tr>`).join('')}
    </tbody></table></div>
    <div class="footer">Hydevest Portal · Supplier Receivables · Confidential</div>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  function exportCSV() {
    const headers = ['Container','Tracking No.','Trip','Supplier','Missing Pieces','Unit Price (USD)','Gross Value (USD)','Agreed Value (USD)','Applied (USD)','Written Off (USD)','Remaining (USD)','Status']
    const csvRows = filtered.map(r => [
      r.container_id, r.tracking_number??'', r.trip_id, r.supplier_name??'',
      r.missing_pieces, r.unit_price_usd, r.gross_value_usd,
      r.agreed_value_usd??'', r.total_applied_usd, r.total_written_off_usd,
      r.remaining_usd, STATUS_CONFIG[r.status].label,
    ])
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `supplier-receivables-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/reports"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Supplier Receivables</h1>
          <p className="text-sm text-gray-400 mt-0.5">Missing pieces value owed back from suppliers</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Containers', value: filtered.length.toString(), icon: <ArrowRightLeft size={14} className="text-brand-600" />, color: 'text-gray-900' },
          { label: 'Gross value (USD)', value: fmtUSD(totalGross), icon: <AlertTriangle size={14} className="text-red-500" />, color: 'text-red-600' },
          { label: 'Applied (USD)', value: fmtUSD(totalApplied), icon: <CheckCircle2 size={14} className="text-green-600" />, color: 'text-green-700' },
          { label: 'Written off (USD)', value: fmtUSD(totalWrittenOff), icon: <XCircle size={14} className="text-gray-400" />, color: 'text-gray-600' },
          { label: 'Remaining (USD)', value: fmtUSD(totalRemaining), icon: <Clock size={14} className={totalRemaining > 0 ? 'text-amber-500' : 'text-green-500'} />, color: totalRemaining > 0 ? 'text-amber-700' : 'text-green-700' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-1">{m.icon}<p className="text-xs text-gray-400">{m.label}</p></div>
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
              placeholder="Search by container, trip or supplier..."
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="partially_applied">Partially applied</option>
                <option value="fully_applied">Fully applied</option>
                <option value="written_off">Written off</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Trip date from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Trip date to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {activeFilters > 0 && (
              <div className="flex items-end pb-0.5">
                <button onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo('') }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
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
                {['Container','Tracking No.','Trip','Supplier','Trip Date','Pieces Purchased','Supplier Loaded','Missing Pieces','Unit Price','Gross Value','Agreed Value','Applied','Written Off','Remaining','Status',''].map(h => (
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
                  <td colSpan={16} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <ArrowRightLeft size={24} className="text-gray-200" />
                      <p className="text-sm text-gray-400">No supplier receivables found.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(row => {
                const statusCfg = STATUS_CONFIG[row.status]
                return (
                  <tr key={row.id}
                    className="border-b border-gray-50 hover:bg-brand-50/20 transition-colors group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{row.container_id}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{row.tracking_number ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap font-medium text-xs">
                      {row.pieces_purchased?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.supplier_loaded_pieces != null ? (
                        <div>
                          <span className="text-xs font-medium text-gray-700">{row.supplier_loaded_pieces.toLocaleString()}</span>
                          {row.pieces_purchased != null && row.supplier_loaded_pieces < row.pieces_purchased && (
                            <span className="ml-1.5 text-xs text-red-500 font-medium">
                              ({(row.pieces_purchased - row.supplier_loaded_pieces).toLocaleString()} short)
                            </span>
                          )}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-700">{row.trip_id}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[100px]">{row.trip_title}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap text-xs">{row.supplier_name ?? '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {row.trip_created_at
                        ? new Date(row.trip_created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-red-600">{row.missing_pieces.toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap text-xs">${row.unit_price_usd.toFixed(2)}</td>
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmtUSD(row.gross_value_usd)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.agreed_value_usd
                        ? <span className="text-blue-700 font-medium">{fmtUSD(row.agreed_value_usd)}</span>
                        : <span className="text-gray-300 text-xs">Not set</span>}
                    </td>
                    <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap">
                      {row.total_applied_usd > 0 ? fmtUSD(row.total_applied_usd) : '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                      {row.total_written_off_usd > 0 ? fmtUSD(row.total_written_off_usd) : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`font-bold ${row.remaining_usd > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {row.remaining_usd > 0 ? fmtUSD(row.remaining_usd) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => router.push(`/portal/reports/supplier-receivables/${row.id}`)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors whitespace-nowrap">
                          View
                        </button>
                        {row.status !== 'fully_applied' && row.status !== 'written_off' && (
                          <button
                            onClick={() => router.push(`/portal/reports/supplier-receivables/${row.id}?action=reallocate`)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">
                            <ArrowRightLeft size={11} /> Apply
                          </button>
                        )}
                      </div>
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
              {(['filtered','full'] as const).map(t => (
                <button key={t} onClick={() => setReportType(t)}
                  className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType===t?'border-brand-400 bg-brand-50':'border-gray-100 hover:border-gray-200'}`}>
                  <p className={`text-sm font-semibold ${reportType===t?'text-brand-700':'text-gray-700'}`}>{t==='filtered'?'Filtered view':'Full report'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t==='filtered'?`${filtered.length} receivables`:`${rows.length} total`}</p>
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

