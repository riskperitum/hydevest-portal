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

interface TripReceivableRow {
  trip_db_id: string
  trip_id: string
  trip_title: string
  trip_created_at: string | null
  supplier_name: string | null
  container_count: number
  total_missing_pieces: number
  total_gross_value_usd: number
  total_effective_value_usd: number
  total_applied_usd: number
  total_written_off_usd: number
  total_remaining_usd: number
  status: 'open' | 'partially_applied' | 'fully_applied' | 'written_off'
}

const STATUS_CONFIG = {
  open:              { label: 'Open',               color: 'bg-red-50 text-red-600 border-red-200',       dot: 'bg-red-500'    },
  partially_applied: { label: 'Partially applied',  color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400'  },
  fully_applied:     { label: 'Fully applied',      color: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500'  },
  written_off:       { label: 'Written off',         color: 'bg-gray-100 text-gray-500 border-gray-200',   dot: 'bg-gray-400'   },
}

const fmtUSD = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SupplierReceivablesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<TripReceivableRow[]>([])
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
    const { data } = await supabase
      .from('supplier_receivables_by_trip')
      .select('*')
      .order('trip_created_at', { ascending: false })

    setRows((data ?? []).map(r => ({
      trip_db_id: r.trip_db_id,
      trip_id: r.trip_id,
      trip_title: r.trip_title,
      trip_created_at: r.trip_created_at,
      supplier_name: r.supplier_name,
      container_count: Number(r.container_count),
      total_missing_pieces: Number(r.total_missing_pieces),
      total_gross_value_usd: Number(r.total_gross_value_usd),
      total_effective_value_usd: Number(r.total_effective_value_usd),
      total_applied_usd: Number(r.total_applied_usd),
      total_written_off_usd: Number(r.total_written_off_usd),
      total_remaining_usd: Number(r.total_remaining_usd),
      status: r.status as TripReceivableRow['status'],
    })))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    const matchSearch = search === '' ||
      r.trip_id.toLowerCase().includes(search.toLowerCase()) ||
      r.trip_title.toLowerCase().includes(search.toLowerCase()) ||
      (r.supplier_name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || r.status === statusFilter
    const matchFrom = dateFrom === '' || !r.trip_created_at || new Date(r.trip_created_at) >= new Date(dateFrom)
    const matchTo = dateTo === '' || !r.trip_created_at || new Date(r.trip_created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchFrom && matchTo
  })

  const activeFilters = [statusFilter, dateFrom, dateTo].filter(Boolean).length
  const totalGross = filtered.reduce((s, r) => s + r.total_gross_value_usd, 0)
  const totalApplied = filtered.reduce((s, r) => s + r.total_applied_usd, 0)
  const totalWrittenOff = filtered.reduce((s, r) => s + r.total_written_off_usd, 0)
  const totalRemaining = filtered.reduce((s, r) => s + r.total_remaining_usd, 0)
  const totalMissingPieces = filtered.reduce((s, r) => s + r.total_missing_pieces, 0)

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
      .open{background:#fef2f2;color:#dc2626}.partially_applied{background:#fffbeb;color:#b45309}
      .fully_applied{background:#f0fdf4;color:#15803d}.written_off{background:#f3f4f6;color:#6b7280}
      .footer{padding:20px 40px;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="header"><h1>Supplier Receivables Report</h1>
    <p>Hydevest Portal · Generated ${new Date().toLocaleString()}</p></div>
    <div class="summary">
      <div class="card"><div class="label">Total trips</div><div class="value">${data.length}</div></div>
      <div class="card"><div class="label">Missing pieces</div><div class="value">${data.reduce((s,r)=>s+r.total_missing_pieces,0).toLocaleString()}</div></div>
      <div class="card"><div class="label">Gross value (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.total_gross_value_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Applied (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.total_applied_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Remaining (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.total_remaining_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    </div>
    <div class="content"><table><thead><tr>
      <th>Trip</th><th>Supplier</th><th>Trip Date</th><th>Containers</th>
      <th>Missing Pieces</th><th>Gross Value (USD)</th><th>Applied (USD)</th>
      <th>Written Off (USD)</th><th>Remaining (USD)</th><th>Status</th>
    </tr></thead><tbody>
    ${data.map(r=>`<tr>
      <td><strong style="color:#55249E">${r.trip_id}</strong><br><span style="color:#6b7280;font-size:11px">${r.trip_title}</span></td>
      <td>${r.supplier_name??'—'}</td>
      <td>${r.trip_created_at?new Date(r.trip_created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}</td>
      <td>${r.container_count}</td>
      <td style="color:#dc2626;font-weight:600">${r.total_missing_pieces.toLocaleString()}</td>
      <td>$${r.total_gross_value_usd.toFixed(2)}</td>
      <td>$${r.total_applied_usd.toFixed(2)}</td>
      <td>$${r.total_written_off_usd.toFixed(2)}</td>
      <td style="color:${r.total_remaining_usd>0?'#dc2626':'#16a34a'}">$${r.total_remaining_usd.toFixed(2)}</td>
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
    const headers = ['Trip ID','Trip Title','Supplier','Trip Date','Containers','Missing Pieces','Gross Value (USD)','Applied (USD)','Written Off (USD)','Remaining (USD)','Status']
    const csvRows = filtered.map(r => [
      r.trip_id, r.trip_title, r.supplier_name??'',
      r.trip_created_at ? new Date(r.trip_created_at).toLocaleDateString() : '',
      r.container_count, r.total_missing_pieces,
      r.total_gross_value_usd, r.total_applied_usd,
      r.total_written_off_usd, r.total_remaining_usd,
      STATUS_CONFIG[r.status].label,
    ])
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `supplier-receivables-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/reports"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Supplier Receivables</h1>
          <p className="text-sm text-gray-400 mt-0.5">Missing pieces value owed back from suppliers — per trip</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Trips', value: filtered.length.toString(), icon: <ArrowRightLeft size={14} className="text-brand-600" />, color: 'text-gray-900' },
          { label: 'Missing pieces', value: totalMissingPieces.toLocaleString(), icon: <AlertTriangle size={14} className="text-red-500" />, color: 'text-red-600' },
          { label: 'Gross value (USD)', value: fmtUSD(totalGross), icon: <AlertTriangle size={14} className="text-amber-500" />, color: 'text-amber-700' },
          { label: 'Applied (USD)', value: fmtUSD(totalApplied), icon: <CheckCircle2 size={14} className="text-green-600" />, color: 'text-green-700' },
          { label: 'Remaining (USD)', value: fmtUSD(totalRemaining), icon: <Clock size={14} className={totalRemaining > 0 ? 'text-red-500' : 'text-green-500'} />, color: totalRemaining > 0 ? 'text-red-600' : 'text-green-700' },
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
              placeholder="Search by trip or supplier..."
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
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Trip','Supplier','Trip Date','Containers','Missing Pieces','Gross Value (USD)','Applied (USD)','Remaining (USD)','Status','Progress'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <ArrowRightLeft size={24} className="text-gray-200" />
                      <p className="text-sm text-gray-400">No supplier receivables found.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(row => {
                const statusCfg = STATUS_CONFIG[row.status]
                const pct = row.total_gross_value_usd > 0
                  ? Math.min(((row.total_applied_usd + row.total_written_off_usd) / row.total_gross_value_usd) * 100, 100)
                  : 0
                return (
                  <tr key={row.trip_db_id}
                    onClick={() => router.push(`/portal/reports/supplier-receivables/${row.trip_db_id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors cursor-pointer group">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-mono text-xs font-semibold text-brand-700 group-hover:text-brand-800">{row.trip_id}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[140px]">{row.trip_title}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{row.supplier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {row.trip_created_at
                        ? new Date(row.trip_created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                        {row.container_count} container{row.container_count !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-semibold text-red-600">{row.total_missing_pieces.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmtUSD(row.total_gross_value_usd)}</td>
                    <td className="px-4 py-3 text-green-600 font-medium whitespace-nowrap">
                      {row.total_applied_usd > 0 ? fmtUSD(row.total_applied_usd) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-bold ${row.total_remaining_usd > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {row.total_remaining_usd > 0 ? fmtUSD(row.total_remaining_usd) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{pct.toFixed(0)}%</span>
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
                  <p className="text-xs text-gray-400 mt-0.5">{t==='filtered'?`${filtered.length} trips`:`${rows.length} total trips`}</p>
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

