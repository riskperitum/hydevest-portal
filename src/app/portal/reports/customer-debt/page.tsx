'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Filter, Download, FileText, Loader2, Users } from 'lucide-react'
import Link from 'next/link'

interface CustomerDebtRow {
  customer_db_id: string
  customer_id: string
  customer_name: string
  phone: string | null
  total_orders: number
  total_payable: number
  total_recovered: number
  total_outstanding: number
  payment_status: 'paid' | 'partial' | 'outstanding'
  last_payment_date: string | null
  last_payment_amount: number | null
  days_since_first_sale: number
  days_since_last_payment: number
  needs_urgent_call: boolean
}

const PAYMENT_STATUS_CONFIG = {
  paid:        { label: 'Fully paid',   color: 'bg-green-50 text-green-700' },
  partial:     { label: 'Partial',      color: 'bg-amber-50 text-amber-700' },
  outstanding: { label: 'Outstanding',  color: 'bg-red-50 text-red-600' },
}

function timeAgo(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return '1 month ago'
  return `${Math.floor(diffDays / 30)} months ago`
}

export default function CustomerDebtReportPage() {
  const router = useRouter()
  const [rows, setRows] = useState<CustomerDebtRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: orders }, { data: recoveries }, { data: customers }] = await Promise.all([
      supabase.from('sales_orders')
        .select('id, customer_id, customer_payable, outstanding_balance, payment_status, created_at')
        .gt('outstanding_balance', 0)
        .neq('payment_status', 'paid')
        .or('write_off_status.is.null,write_off_status.neq.approved'),
      supabase.from('recoveries').select('sales_order_id, amount_paid, payment_date, payment_type'),
      supabase.from('customers').select('id, customer_id, name, phone, is_active').eq('is_active', true),
    ])

    // Group orders by customer
    const ordersByCustomer = (orders ?? []).reduce((acc, o) => {
      if (!acc[o.customer_id]) acc[o.customer_id] = []
      acc[o.customer_id].push(o)
      return acc
    }, {} as Record<string, typeof orders[0][]>)

    // Group recoveries by order
    const recsByOrder = (recoveries ?? []).reduce((acc, r) => {
      if (!acc[r.sales_order_id]) acc[r.sales_order_id] = []
      acc[r.sales_order_id].push(r)
      return acc
    }, {} as Record<string, typeof recoveries[0][]>)

    const result: CustomerDebtRow[] = (customers ?? [])
      .map(customer => {
        const custOrders = ordersByCustomer[customer.id] ?? []
        if (custOrders.length === 0) return null

        const totalPayable = custOrders.reduce((s, o) => s + Number(o.customer_payable), 0)
        const totalOutstanding = custOrders.reduce((s, o) => s + Number(o.outstanding_balance), 0)
        const totalRecovered = totalPayable - totalOutstanding

        // All recoveries for this customer's orders
        const allRecs = custOrders.flatMap(o => recsByOrder[o.id] ?? [])
        const sortedRecs = allRecs.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
        const lastPayment = sortedRecs[0] ?? null

        let paymentStatus: CustomerDebtRow['payment_status'] = 'outstanding'
        if (totalOutstanding <= 0) paymentStatus = 'paid'
        else if (totalRecovered > 0) paymentStatus = 'partial'

        const now = new Date()
        const firstSaleDate = custOrders.length > 0
          ? new Date(Math.min(...custOrders.map(o => new Date(o.created_at ?? Date.now()).getTime())))
          : null
        const daysSinceFirstSale = firstSaleDate
          ? Math.floor((now.getTime() - firstSaleDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0
        const daysSinceLastPayment = lastPayment
          ? Math.floor((now.getTime() - new Date(lastPayment.payment_date).getTime()) / (1000 * 60 * 60 * 24))
          : 999
        const needsUrgentCall = Math.max(totalOutstanding, 0) > 0 && daysSinceFirstSale > 15 && daysSinceLastPayment > 5

        return {
          customer_db_id: customer.id,
          customer_id: customer.customer_id,
          customer_name: customer.name,
          phone: customer.phone,
          total_orders: custOrders.length,
          total_payable: totalPayable,
          total_recovered: totalRecovered,
          total_outstanding: Math.max(totalOutstanding, 0),
          payment_status: paymentStatus,
          last_payment_date: lastPayment?.payment_date ?? null,
          last_payment_amount: lastPayment ? Number(lastPayment.amount_paid) : null,
          days_since_first_sale: daysSinceFirstSale,
          days_since_last_payment: daysSinceLastPayment,
          needs_urgent_call: needsUrgentCall,
        }
      })
      .filter(Boolean) as CustomerDebtRow[]

    // Sort by outstanding descending
    result.sort((a, b) => b.total_outstanding - a.total_outstanding)
    setRows(result)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filtered = rows.filter(r => {
    const matchSearch = search === '' ||
      r.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      r.customer_id.toLowerCase().includes(search.toLowerCase()) ||
      (r.phone ?? '').includes(search)
    const matchStatus = statusFilter === '' || r.payment_status === statusFilter
    return matchSearch && matchStatus
  })

  const activeFilters = [statusFilter].filter(Boolean).length
  const totalPayable = filtered.reduce((s, r) => s + r.total_payable, 0)
  const totalRecovered = filtered.reduce((s, r) => s + r.total_recovered, 0)
  const totalOutstanding = filtered.reduce((s, r) => s + r.total_outstanding, 0)
  const fullPaid = filtered.filter(r => r.payment_status === 'paid').length
  const withDebt = filtered.filter(r => r.total_outstanding > 0).length

  function generateReport(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filtered : rows
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Customer Debt Report — Hydevest</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1a1a2e}
      .header{background:#55249E;color:white;padding:32px 40px}.header h1{font-size:24px;font-weight:700}
      .header p{font-size:13px;opacity:.8;margin-top:4px}
      .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:20px 40px;background:#f8f7ff;border-bottom:1px solid #e8e0ff}
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
    <div class="header"><h1>Customer Debt Report</h1>
    <p>Hydevest Portal — ${type === 'filtered' ? 'Filtered View' : 'Full Report'} · Generated ${new Date().toLocaleString()}</p></div>
    <div class="summary">
      <div class="card"><div class="label">Total customers</div><div class="value">${data.length}</div></div>
      <div class="card"><div class="label">Total payable</div><div class="value">₦${data.reduce((s,r)=>s+r.total_payable,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Total recovered</div><div class="value">₦${data.reduce((s,r)=>s+r.total_recovered,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">Outstanding</div><div class="value">₦${data.reduce((s,r)=>s+r.total_outstanding,0).toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
      <div class="card"><div class="label">With debt</div><div class="value">${data.filter(r=>r.total_outstanding>0).length}</div></div>
    </div>
    <div class="content"><table><thead><tr>
      <th>Customer</th><th>ID</th><th>Phone</th><th>Orders</th>
      <th>Total Payable</th><th>Recovered</th><th>Outstanding</th><th>Status</th><th>Last Payment</th>
    </tr></thead><tbody>
    ${data.map(r=>`<tr>
      <td><strong>${r.customer_name}</strong></td><td>${r.customer_id}</td>
      <td>${r.phone??'—'}</td><td>${r.total_orders}</td>
      <td>₦${r.total_payable.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td>₦${r.total_recovered.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td style="color:${r.total_outstanding>0?'#dc2626':'#16a34a'}">₦${r.total_outstanding.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td><span class="badge ${r.payment_status}">${PAYMENT_STATUS_CONFIG[r.payment_status].label}</span></td>
      <td>${r.last_payment_date?`${new Date(r.last_payment_date).toLocaleDateString()} (${timeAgo(r.last_payment_date)})`:'—'}</td>
    </tr>`).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="4">Totals — ${data.length} customers</td>
      <td>₦${data.reduce((s,r)=>s+r.total_payable,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td>₦${data.reduce((s,r)=>s+r.total_recovered,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td>₦${data.reduce((s,r)=>s+r.total_outstanding,0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
      <td colspan="2"></td>
    </tr></tfoot>
    </table></div>
    <div class="footer">Hydevest Portal · Customer Debt Report · Confidential</div>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  function exportCSV() {
    const headers = ['Customer', 'Customer ID', 'Phone', 'Orders', 'Total Payable', 'Recovered', 'Outstanding', 'Status', 'Last Payment Date']
    const csvRows = filtered.map(r => [
      r.customer_name, r.customer_id, r.phone ?? '', r.total_orders,
      r.total_payable, r.total_recovered, r.total_outstanding,
      PAYMENT_STATUS_CONFIG[r.payment_status].label,
      r.last_payment_date ? new Date(r.last_payment_date).toLocaleDateString() : '',
    ])
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `customer-debt-report-${new Date().toISOString().slice(0,10)}.csv`; a.click()
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/reports"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Customer Debt Report</h1>
          <p className="text-sm text-gray-400 mt-0.5">Outstanding balances across all customers</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total customers', value: filtered.length.toString(), color: 'text-gray-900' },
          { label: 'Total payable', value: fmt(totalPayable), color: 'text-brand-700' },
          { label: 'Total recovered', value: fmt(totalRecovered), color: 'text-green-700' },
          { label: 'Outstanding', value: fmt(totalOutstanding), color: totalOutstanding > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'With debt', value: `${withDebt} of ${filtered.length}`, color: 'text-amber-700' },
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
              placeholder="Search by customer name, ID or phone..."
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
                {['Customer', 'Customer ID', 'Phone', 'Orders', 'Total Payable', 'Recovered', 'Outstanding', 'Status', 'Last Payment', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Users size={24} className="text-gray-200" />
                      <p className="text-sm text-gray-400">No customer debt records found.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(row => {
                const statusCfg = PAYMENT_STATUS_CONFIG[row.payment_status]
                return (
                  <tr key={row.customer_db_id}
                    onClick={() => router.push(`/portal/reports/customer-debt/${row.customer_db_id}`)}
                    className={`border-b border-gray-50 hover:bg-brand-50/30 transition-colors cursor-pointer group
                      ${row.needs_urgent_call ? 'bg-red-50/40 border-l-4 border-l-red-500' : ''}`}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {row.needs_urgent_call && (
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" title="Needs urgent call" />
                        )}
                        <p className={`font-semibold ${row.needs_urgent_call ? 'text-red-700' : 'text-gray-900 group-hover:text-brand-700'}`}>
                          {row.customer_name}
                        </p>
                      </div>
                      {row.needs_urgent_call && (
                        <p className="text-xs text-red-500 font-medium mt-0.5">Needs urgent call</p>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-500">{row.customer_id}</span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap text-xs">{row.phone ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{row.total_orders} order{row.total_orders !== 1 ? 's' : ''}</span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(row.total_payable)}</td>
                    <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap">{fmt(row.total_recovered)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`font-bold ${row.total_outstanding > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {row.total_outstanding > 0 ? fmt(row.total_outstanding) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.last_payment_date ? (
                        <div>
                          <p className="text-xs font-medium text-gray-700">{fmt(row.last_payment_amount ?? 0)}</p>
                          <p className="text-xs text-gray-400">{timeAgo(row.last_payment_date)}</p>
                        </div>
                      ) : <span className="text-gray-300 text-xs">No payments</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${row.total_payable > 0 ? Math.min((row.total_recovered / row.total_payable) * 100, 100) : 0}%` }}
                        />
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
              {(['filtered', 'full'] as const).map(t => (
                <button key={t} onClick={() => setReportType(t)}
                  className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType===t?'border-brand-400 bg-brand-50':'border-gray-100 hover:border-gray-200'}`}>
                  <p className={`text-sm font-semibold ${reportType===t?'text-brand-700':'text-gray-700'}`}>{t==='filtered'?'Filtered view':'Full report'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t==='filtered'?`${filtered.length} customers`:`${rows.length} total customers`}</p>
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
