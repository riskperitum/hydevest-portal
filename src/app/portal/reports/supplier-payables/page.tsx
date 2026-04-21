'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Filter, Download, FileText, Loader2, Truck } from 'lucide-react'
import Link from 'next/link'

interface SupplierPayableRow {
  trip_db_id: string
  trip_id: string
  title: string
  source_location: string | null
  supplier_name: string | null
  supplier_id: string | null
  container_count: number
  total_cost_usd: number
  total_paid_usd: number
  outstanding_usd: number
  payment_status: 'paid' | 'partial' | 'outstanding'
  created_at: string
}

const PAYMENT_STATUS_CONFIG = {
  paid:        { label: 'Fully paid',   color: 'bg-green-50 text-green-700' },
  partial:     { label: 'Partial',      color: 'bg-amber-50 text-amber-700' },
  outstanding: { label: 'Outstanding',  color: 'bg-red-50 text-red-600' },
}

const fmtUSD = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SupplierPayablesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<SupplierPayableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: trips }, { data: containers }, { data: tripExpenses }] = await Promise.all([
      supabase.from('trips').select('id, trip_id, title, source_location, created_at, supplier:suppliers(id, name)').order('created_at', { ascending: false }),
      supabase.from('containers').select('id, trip_id, unit_price_usd, shipping_amount_usd, pieces_purchased, quoted_price_usd'),
      supabase.from('trip_expenses').select('trip_id, amount, currency, category').eq('category', 'container').eq('currency', 'USD'),
    ])

    // Group containers by trip
    const containersByTrip = (containers ?? []).reduce((acc, c) => {
      if (!acc[c.trip_id]) acc[c.trip_id] = []
      acc[c.trip_id].push(c)
      return acc
    }, {} as Record<string, any[]>)

    // Group expenses by trip
    const expensesByTrip = (tripExpenses ?? []).reduce((acc, e) => {
      acc[e.trip_id] = (acc[e.trip_id] ?? 0) + Number(e.amount)
      return acc
    }, {} as Record<string, number>)

    const result: SupplierPayableRow[] = (trips ?? []).map(trip => {
      const tripContainers = containersByTrip[trip.id] ?? []
      const supplier = trip.supplier as unknown as { id: string; name: string } | null

      // Total cost = sum of (unit_price_usd * pieces_purchased) + shipping_amount_usd per container
      const totalCostUsd = tripContainers.reduce((s, c) => {
        const containerCost = (Number(c.unit_price_usd ?? 0) * Number(c.pieces_purchased ?? 0))
        const shipping = Number(c.shipping_amount_usd ?? 0)
        return s + containerCost + shipping
      }, 0)

      const totalPaidUsd = expensesByTrip[trip.id] ?? 0
      const outstandingUsd = Math.max(totalCostUsd - totalPaidUsd, 0)

      let paymentStatus: SupplierPayableRow['payment_status'] = 'outstanding'
      if (totalCostUsd <= 0) paymentStatus = 'paid'
      else if (outstandingUsd <= 0) paymentStatus = 'paid'
      else if (totalPaidUsd > 0) paymentStatus = 'partial'

      return {
        trip_db_id: trip.id,
        trip_id: trip.trip_id,
        title: trip.title,
        source_location: trip.source_location,
        supplier_name: supplier?.name ?? null,
        supplier_id: supplier?.id ?? null,
        container_count: tripContainers.length,
        total_cost_usd: totalCostUsd,
        total_paid_usd: totalPaidUsd,
        outstanding_usd: outstandingUsd,
        payment_status: paymentStatus,
        created_at: trip.created_at,
      }
    }).filter(r => r.total_cost_usd > 0 || r.total_paid_usd > 0)

    setRows(result)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    const matchSearch = search === '' ||
      r.trip_id.toLowerCase().includes(search.toLowerCase()) ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.supplier_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.source_location ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || r.payment_status === statusFilter
    return matchSearch && matchStatus
  })

  const activeFilters = [statusFilter].filter(Boolean).length
  const totalCost = filtered.reduce((s, r) => s + r.total_cost_usd, 0)
  const totalPaid = filtered.reduce((s, r) => s + r.total_paid_usd, 0)
  const totalOutstanding = filtered.reduce((s, r) => s + r.outstanding_usd, 0)
  const fullyPaid = filtered.filter(r => r.payment_status === 'paid').length

  function generateReport(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filtered : rows
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Supplier Payables Report — Hydevest</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1a1a2e}
      .header{background:#55249E;color:white;padding:32px 40px}.header h1{font-size:24px;font-weight:700}
      .header p{font-size:13px;opacity:.8;margin-top:4px}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:20px 40px;background:#f8f7ff;border-bottom:1px solid #e8e0ff}
      .card{background:white;border-radius:8px;padding:14px;border:1px solid #ede9f7}
      .card .label{font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px}
      .card .value{font-size:16px;font-weight:700;color:#55249E}
      .content{padding:24px 40px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      thead tr{background:#55249E;color:white}
      thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap}
      tbody tr{border-bottom:1px solid #f0ebff}tbody tr:nth-child(even){background:#faf8ff}
      tbody td{padding:9px 12px;color:#374151;white-space:nowrap}
      tfoot tr{background:#55249E;color:white}tfoot td{padding:10px 12px;font-weight:700;font-size:11px}
      .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600}
      .paid{background:#f0fdf4;color:#15803d}.partial{background:#fffbeb;color:#b45309}.outstanding{background:#fef2f2;color:#dc2626}
      .footer{padding:20px 40px;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <div class="header"><h1>Supplier Payables Report</h1>
    <p>Hydevest Portal — ${type === 'filtered' ? 'Filtered View' : 'Full Report'} · Generated ${new Date().toLocaleString()}</p></div>
    <div class="summary">
      <div class="card"><div class="label">Total trips</div><div class="value">${data.length}</div></div>
      <div class="card"><div class="label">Total cost (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.total_cost_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Total paid (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.total_paid_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Outstanding (USD)</div><div class="value">$${data.reduce((s,r)=>s+r.outstanding_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    </div>
    <div class="content"><table><thead><tr>
      <th>Trip ID</th><th>Title</th><th>Supplier</th><th>Location</th><th>Containers</th>
      <th>Total Cost (USD)</th><th>Total Paid (USD)</th><th>Outstanding (USD)</th><th>Status</th>
    </tr></thead><tbody>
    ${data.map(r=>`<tr>
      <td><strong style="color:#55249E">${r.trip_id}</strong></td>
      <td>${r.title}</td><td>${r.supplier_name??'—'}</td><td>${r.source_location??'—'}</td>
      <td>${r.container_count}</td>
      <td>$${r.total_cost_usd.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td>$${r.total_paid_usd.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td style="color:${r.outstanding_usd>0?'#dc2626':'#16a34a'}">$${r.outstanding_usd.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td><span class="badge ${r.payment_status}">${PAYMENT_STATUS_CONFIG[r.payment_status].label}</span></td>
    </tr>`).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="4">Totals — ${data.length} trips</td>
      <td>${data.reduce((s,r)=>s+r.container_count,0)}</td>
      <td>$${data.reduce((s,r)=>s+r.total_cost_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td>$${data.reduce((s,r)=>s+r.total_paid_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td>$${data.reduce((s,r)=>s+r.outstanding_usd,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td></td>
    </tr></tfoot>
    </table></div>
    <div class="footer">Hydevest Portal · Supplier Payables Report · Confidential</div>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  function exportCSV() {
    const headers = ['Trip ID','Title','Supplier','Location','Containers','Total Cost (USD)','Total Paid (USD)','Outstanding (USD)','Status']
    const csvRows = filtered.map(r => [
      r.trip_id, r.title, r.supplier_name??'', r.source_location??'',
      r.container_count, r.total_cost_usd, r.total_paid_usd, r.outstanding_usd,
      PAYMENT_STATUS_CONFIG[r.payment_status].label,
    ])
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `supplier-payables-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/reports"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Supplier Payables Report</h1>
          <p className="text-sm text-gray-400 mt-0.5">USD amounts owed to suppliers per trip</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total trips', value: filtered.length.toString(), color: 'text-gray-900' },
          { label: 'Total cost (USD)', value: fmtUSD(totalCost), color: 'text-brand-700' },
          { label: 'Total paid (USD)', value: fmtUSD(totalPaid), color: 'text-green-700' },
          { label: 'Outstanding (USD)', value: fmtUSD(totalOutstanding), color: totalOutstanding > 0 ? 'text-red-600' : 'text-green-600' },
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
              placeholder="Search by trip ID, title, supplier or location..."
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All statuses</option>
                <option value="outstanding">Outstanding</option>
                <option value="partial">Partial</option>
                <option value="paid">Fully paid</option>
              </select>
            </div>
            {activeFilters > 0 && (
              <div className="flex items-end pb-0.5">
                <button onClick={() => setStatusFilter('')}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">Clear filters</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Trip ID','Title','Supplier','Location','Containers','Total Cost (USD)','Total Paid (USD)','Outstanding (USD)','Status','Progress',''].map(h => (
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
                    <div className="flex flex-col items-center gap-3">
                      <Truck size={24} className="text-gray-200" />
                      <p className="text-sm text-gray-400">No supplier payable records found.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(row => {
                const statusCfg = PAYMENT_STATUS_CONFIG[row.payment_status]
                const pct = row.total_cost_usd > 0 ? Math.min((row.total_paid_usd / row.total_cost_usd) * 100, 100) : 0
                return (
                  <tr key={row.trip_db_id}
                    onClick={() => router.push(`/portal/reports/supplier-payables/${row.trip_db_id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors cursor-pointer group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{row.trip_id}</span>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900 group-hover:text-brand-700 whitespace-nowrap">{row.title}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{row.supplier_name ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap text-xs">{row.source_location ?? '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{row.container_count}</span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmtUSD(row.total_cost_usd)}</td>
                    <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap">{row.total_paid_usd > 0 ? fmtUSD(row.total_paid_usd) : '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`font-bold ${row.outstanding_usd > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {row.outstanding_usd > 0 ? fmtUSD(row.outstanding_usd) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3" />
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
