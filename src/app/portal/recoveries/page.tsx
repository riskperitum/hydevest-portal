'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Filter, Download, FileText,
  Eye, Loader2, TrendingUp, AlertCircle, CheckCircle2
} from 'lucide-react'
import Link from 'next/link'

interface RecoverySummary {
  sales_order_id: string
  order_id: string
  sale_type: string
  customer_payable: number
  initial_payment: number
  amount_paid: number
  outstanding_balance: number
  payment_status: string
  payment_method: string
  created_at: string
  customer: { id: string; name: string; customer_id: string; phone: string | null } | null
  container: { tracking_number: string | null; container_id: string } | null
  total_recovered: number
}

const PAYMENT_STATUS = {
  paid:        { label: 'Fully paid',   color: 'bg-green-50 text-green-700' },
  partial:     { label: 'Partial',      color: 'bg-amber-50 text-amber-700' },
  outstanding: { label: 'Outstanding',  color: 'bg-red-50 text-red-600' },
}

export default function RecoveriesPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<RecoverySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')

  const load = useCallback(async () => {
    const supabase = createClient()

    // Load all sales orders with outstanding or partial payment
    const { data: salesOrders } = await supabase
      .from('sales_orders')
      .select(`
        id, order_id, sale_type, customer_payable, initial_payment,
        amount_paid, outstanding_balance, payment_status, payment_method, created_at,
        customer:customers(id, name, customer_id, phone),
        container:containers(tracking_number, container_id)
      `)
      .order('created_at', { ascending: false })

    // Get total recovered per order from recoveries table
    const { data: recoveryTotals } = await supabase
      .from('recoveries')
      .select('sales_order_id, amount_paid')

    const totalsByOrder = (recoveryTotals ?? []).reduce((acc, r) => {
      acc[r.sales_order_id] = (acc[r.sales_order_id] ?? 0) + Number(r.amount_paid)
      return acc
    }, {} as Record<string, number>)

    const one = <T,>(v: T | T[] | null | undefined): T | null => {
      if (v == null) return null
      return Array.isArray(v) ? (v[0] ?? null) : v
    }
    setOrders(
      (salesOrders ?? []).map(o => ({
        ...o,
        sales_order_id: o.id,
        total_recovered: totalsByOrder[o.id] ?? 0,
        customer: one(o.customer),
        container: one(o.container),
      })) as RecoverySummary[],
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filtered = orders.filter(o => {
    const matchSearch = search === '' ||
      (o.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.order_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.container?.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.customer?.customer_id ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || o.payment_status === statusFilter
    const matchFrom = dateFrom === '' || new Date(o.created_at) >= new Date(dateFrom)
    const matchTo = dateTo === '' || new Date(o.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchFrom && matchTo
  })

  const activeFilters = [statusFilter, dateFrom, dateTo].filter(Boolean).length
  const totalOutstanding = filtered.reduce((s, o) => s + Number(o.outstanding_balance), 0)
  const totalRecovered = filtered.reduce((s, o) => s + Number(o.total_recovered), 0)
  const totalPayable = filtered.reduce((s, o) => s + Number(o.customer_payable), 0)
  const fullyPaid = filtered.filter(o => o.payment_status === 'paid').length

  function generateReport(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filtered : orders
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Recoveries Report — Hydevest</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1a1a2e}
    .header{background:#55249E;color:white;padding:32px 40px}.header h1{font-size:24px;font-weight:700}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:24px 40px;background:#f8f7ff}
    .card{background:white;border-radius:8px;padding:16px;border:1px solid #ede9f7}
    .card .label{font-size:11px;color:#6b7280;text-transform:uppercase;margin-bottom:6px}
    .card .value{font-size:18px;font-weight:700;color:#55249E}
    .content{padding:24px 40px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead tr{background:#55249E;color:white}
    thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap}
    tbody tr{border-bottom:1px solid #f0ebff}tbody tr:nth-child(even){background:#faf8ff}
    tbody td{padding:9px 12px;color:#374151;white-space:nowrap}
    .footer{padding:20px 40px;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
    <div class="header"><h1>Recoveries Report</h1>
    <p style="font-size:13px;opacity:.8;margin-top:4px">Generated ${new Date().toLocaleString()} · ${data.length} records</p></div>
    <div class="summary">
    <div class="card"><div class="label">Total payable</div><div class="value">₦${data.reduce((s,o)=>s+Number(o.customer_payable),0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    <div class="card"><div class="label">Total recovered</div><div class="value">₦${data.reduce((s,o)=>s+Number(o.total_recovered),0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    <div class="card"><div class="label">Outstanding</div><div class="value">₦${data.reduce((s,o)=>s+Number(o.outstanding_balance),0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    <div class="card"><div class="label">Fully paid</div><div class="value">${data.filter(o=>o.payment_status==='paid').length}</div></div>
    </div>
    <div class="content"><table><thead><tr>
    <th>Order ID</th><th>Customer</th><th>Tracking No.</th>
    <th>Total Payable</th><th>Recovered</th><th>Outstanding</th><th>Status</th><th>Date</th>
    </tr></thead><tbody>
    ${data.map(o=>`<tr>
    <td><strong style="color:#55249E">${o.order_id}</strong></td>
    <td>${o.customer?.name??'—'}</td>
    <td>${o.container?.tracking_number??'—'}</td>
    <td>₦${Number(o.customer_payable).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
    <td>₦${Number(o.total_recovered).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
    <td style="color:${o.outstanding_balance>0?'#ef4444':'#16a34a'}">₦${Number(o.outstanding_balance).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
    <td>${o.payment_status}</td>
    <td>${new Date(o.created_at).toLocaleDateString()}</td>
    </tr>`).join('')}
    </tbody></table></div>
    <div class="footer">Hydevest Portal · Confidential</div></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Recoveries</h1>
          <p className="text-sm text-gray-400 mt-0.5">{orders.length} sale{orders.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <Link href="/portal/recoveries/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Record recovery</span>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total payable', value: fmt(totalPayable), color: 'text-gray-900', icon: <TrendingUp size={15} className="text-brand-600" /> },
          { label: 'Total recovered', value: fmt(totalRecovered), color: 'text-green-600', icon: <CheckCircle2 size={15} className="text-green-600" /> },
          { label: 'Outstanding', value: fmt(totalOutstanding), color: totalOutstanding > 0 ? 'text-red-500' : 'text-green-600', icon: <AlertCircle size={15} className={totalOutstanding > 0 ? 'text-red-500' : 'text-green-600'} /> },
          { label: 'Fully paid', value: `${fullyPaid} of ${filtered.length}`, color: 'text-brand-600', icon: <CheckCircle2 size={15} className="text-brand-600" /> },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              {m.icon}
              <p className="text-xs text-gray-400">{m.label}</p>
            </div>
            <p className={`text-lg font-semibold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by customer, order ID or tracking number..."
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
            <button onClick={() => {
              const headers = ['Order ID','Customer','Tracking No.','Total Payable','Recovered','Outstanding','Status','Date']
              const rows = filtered.map(o => [o.order_id, o.customer?.name??'', o.container?.tracking_number??'', o.customer_payable, o.total_recovered, o.outstanding_balance, o.payment_status, new Date(o.created_at).toLocaleDateString()])
              const csv = [headers,...rows].map(r=>r.join(',')).join('\n')
              const blob = new Blob([csv],{type:'text/csv'})
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href=url; a.download='recoveries.csv'; a.click()
            }} className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
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
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Date from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Date to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {activeFilters > 0 && (
              <div className="col-span-2 md:col-span-3 flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
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
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Order ID','Customer','Tracking No.','Sale Type','Total Payable','Initial Payment','Total Recovered','Outstanding','Status','Date',''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
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
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                        <TrendingUp size={20} className="text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400">No recovery records found.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(o => {
                const statusCfg = PAYMENT_STATUS[o.payment_status as keyof typeof PAYMENT_STATUS] ?? PAYMENT_STATUS.outstanding
                return (
                  <tr key={o.sales_order_id}
                    onClick={() => router.push(`/portal/recoveries/${o.sales_order_id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors cursor-pointer group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{o.order_id}</span>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900 group-hover:text-brand-700 whitespace-nowrap">
                      {o.customer?.name ?? '—'}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {o.container?.tracking_number ?? '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {o.sale_type === 'box_sale' ? 'Box' : 'Split'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(o.customer_payable)}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{fmt(o.initial_payment)}</td>
                    <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap">{fmt(o.total_recovered)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${o.outstanding_balance > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {fmt(o.outstanding_balance)}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => router.push(`/portal/recoveries/${o.sales_order_id}`)}
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-brand-100">
                  <td colSpan={4} className="px-3 py-3 text-xs font-bold text-gray-500 uppercase">Totals</td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-900 whitespace-nowrap">{fmt(totalPayable)}</td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">{fmt(filtered.reduce((s,o)=>s+Number(o.initial_payment),0))}</td>
                  <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(totalRecovered)}</td>
                  <td className="px-3 py-3 text-xs font-bold text-red-500 whitespace-nowrap">{fmt(totalOutstanding)}</td>
                  <td colSpan={3} />
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
              {(['filtered','full'] as const).map(t => (
                <button key={t} onClick={() => setReportType(t)}
                  className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType===t?'border-brand-400 bg-brand-50':'border-gray-100 hover:border-gray-200'}`}>
                  <p className={`text-sm font-semibold ${reportType===t?'text-brand-700':'text-gray-700'}`}>{t==='filtered'?'Filtered view':'Full report'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t==='filtered'?`${filtered.length} records`:`${orders.length} total records`}</p>
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
