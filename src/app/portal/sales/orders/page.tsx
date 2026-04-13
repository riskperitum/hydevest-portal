'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Search, Eye, Filter, Download, Package } from 'lucide-react'
import Link from 'next/link'

interface SalesOrder {
  id: string
  order_id: string
  sale_type: string
  sale_amount: number
  discount: number
  overages: number
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  payment_method: string
  status: string
  created_at: string
  container: { container_id: string; tracking_number: string | null } | null
  presale: { presale_id: string } | null
  customer: { name: string; customer_id: string } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
  completed: 'bg-brand-50 text-brand-700',
}

export default function SalesOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('sales_orders')
      .select(`*,
        container:containers(container_id, tracking_number),
        presale:presales(presale_id),
        customer:customers(name, customer_id),
        created_by_profile:profiles!sales_orders_created_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filteredOrders = orders.filter(o => {
    const matchSearch = search === '' ||
      o.order_id.toLowerCase().includes(search.toLowerCase()) ||
      (o.container?.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.customer?.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || o.status === statusFilter
    const matchType = saleTypeFilter === '' || o.sale_type === saleTypeFilter
    const matchFrom = dateFrom === '' || new Date(o.created_at) >= new Date(dateFrom)
    const matchTo = dateTo === '' || new Date(o.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchType && matchFrom && matchTo
  })

  const activeFilters = [statusFilter, saleTypeFilter, dateFrom, dateTo].filter(Boolean).length
  const totalRevenue = filteredOrders.reduce((s, o) => s + Number(o.customer_payable), 0)
  const totalOutstanding = filteredOrders.reduce((s, o) => s + Number(o.outstanding_balance), 0)
  const totalCollected = filteredOrders.reduce((s, o) => s + Number(o.amount_paid), 0)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Orders</h1>
          <p className="text-sm text-gray-400 mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''} recorded</p>
        </div>
        <Link href="/portal/sales/orders/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Record sale</span>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total orders', value: filteredOrders.length.toString(), color: 'text-brand-600' },
          { label: 'Total revenue (₦)', value: totalRevenue > 0 ? fmt(totalRevenue) : '—', color: 'text-green-600' },
          { label: 'Total collected (₦)', value: totalCollected > 0 ? fmt(totalCollected) : '—', color: 'text-blue-600' },
          { label: 'Outstanding (₦)', value: totalOutstanding > 0 ? fmt(totalOutstanding) : '—', color: totalOutstanding > 0 ? 'text-red-500' : 'text-gray-400' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
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
              placeholder="Search by order ID, tracking number or customer..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
                ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={15} /> Filters
              {activeFilters > 0 && <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>}
            </button>
            <button onClick={() => {
              const headers = ['Order ID', 'Sale Type', 'Container', 'Tracking No.', 'Customer', 'Sale Amount', 'Discount', 'Overages', 'Customer Payable', 'Amount Paid', 'Outstanding', 'Payment Method', 'Status', 'Date']
              const rows = filteredOrders.map(o => [o.order_id, o.sale_type, o.container?.container_id ?? '', o.container?.tracking_number ?? '', o.customer?.name ?? '', o.sale_amount, o.discount, o.overages, o.customer_payable, o.amount_paid, o.outstanding_balance, o.payment_method, o.status, new Date(o.created_at).toLocaleDateString()])
              const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sales-orders.csv'; a.click()
            }} className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
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
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
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
              <div className="col-span-2 md:col-span-4 flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">{filteredOrders.length} result{filteredOrders.length !== 1 ? 's' : ''}</p>
                <button onClick={() => { setStatusFilter(''); setSaleTypeFilter(''); setDateFrom(''); setDateTo('') }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Order ID', 'Sale Type', 'Tracking No.', 'Customer', 'Sale Amount', 'Discount', 'Overages', 'Payable', 'Paid', 'Outstanding', 'Method', 'Status', 'Date', ''].map(h => (
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
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Package size={20} className="text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400">No sales orders yet. Record your first sale.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.map(order => (
                <tr key={order.id}
                  onClick={() => router.push(`/portal/sales/orders/${order.id}`)}
                  className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors cursor-pointer group">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{order.order_id}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${order.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {order.sale_type === 'box_sale' ? 'Box' : 'Split'}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{order.container?.tracking_number ?? '—'}</td>
                  <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap group-hover:text-brand-700">{order.customer?.name ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{fmt(order.sale_amount)}</td>
                  <td className="px-3 py-3 text-red-500 whitespace-nowrap">{order.discount > 0 ? `-${fmt(order.discount)}` : '—'}</td>
                  <td className="px-3 py-3 text-green-600 whitespace-nowrap">{order.overages > 0 ? `+${fmt(order.overages)}` : '—'}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(order.customer_payable)}</td>
                  <td className="px-3 py-3 text-green-600 whitespace-nowrap">{fmt(order.amount_paid)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={order.outstanding_balance > 0 ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>
                      {fmt(order.outstanding_balance)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap capitalize">{order.payment_method}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-400 whitespace-nowrap text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => router.push(`/portal/sales/orders/${order.id}`)}
                      className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filteredOrders.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-brand-100">
                  <td colSpan={4} className="px-3 py-3 text-xs font-bold text-gray-500 uppercase">Totals</td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">{fmt(filteredOrders.reduce((s, o) => s + Number(o.sale_amount), 0))}</td>
                  <td className="px-3 py-3 text-xs font-bold text-red-500 whitespace-nowrap">-{fmt(filteredOrders.reduce((s, o) => s + Number(o.discount), 0))}</td>
                  <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">+{fmt(filteredOrders.reduce((s, o) => s + Number(o.overages), 0))}</td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-900 whitespace-nowrap">{fmt(totalRevenue)}</td>
                  <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(totalCollected)}</td>
                  <td className="px-3 py-3 text-xs font-bold text-red-500 whitespace-nowrap">{fmt(totalOutstanding)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
