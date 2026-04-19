'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Eye, Package, ChevronDown, ChevronUp,
  TrendingUp, Clock, CheckCircle2,
} from 'lucide-react'

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
  payment_status: string
  approval_status: string
  needs_approval: boolean
  status: string
  created_at: string
  container_id: string | null
  container: { id: string; container_id: string; tracking_number: string | null; hide_type: string | null } | null
  presale: { presale_id: string; sale_type: string } | null
  customer: { name: string; customer_id: string } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

interface ContainerGroup {
  container_id: string
  container_db_id: string
  tracking_number: string | null
  hide_type: string | null
  orders: SalesOrder[]
  total_revenue: number
  total_outstanding: number
  total_collected: number
  order_count: number
}

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  paid:        { label: 'Fully paid',   color: 'bg-green-50 text-green-700' },
  partial:     { label: 'Partial',      color: 'bg-amber-50 text-amber-700' },
  outstanding: { label: 'Outstanding',  color: 'bg-red-50 text-red-600'    },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SalesOrdersPage() {
  const router = useRouter()
  const [groups, setGroups]     = useState<ContainerGroup[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('sales_orders')
      .select(`
        id, order_id, sale_type, sale_amount, discount, overages,
        customer_payable, amount_paid, outstanding_balance,
        payment_method, payment_status, approval_status,
        needs_approval, status, created_at, container_id,
        container:containers!sales_orders_container_id_fkey(
          id, container_id, tracking_number, hide_type
        ),
        presale:presales!sales_orders_presale_id_fkey(presale_id, sale_type),
        customer:customers!sales_orders_customer_id_fkey(name, customer_id),
        created_by_profile:profiles!sales_orders_created_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    // Group by container
    const groupMap: Record<string, ContainerGroup> = {}

    for (const order of (data ?? [])) {
      const cId  = (order.container as { container_id?: string } | null)?.container_id ?? 'unknown'
      const cDbId = (order.container as { id?: string } | null)?.id ?? order.container_id ?? 'unknown'
      if (!groupMap[cId]) {
        groupMap[cId] = {
          container_id:    cId,
          container_db_id: String(cDbId),
          tracking_number: (order.container as { tracking_number?: string | null } | null)?.tracking_number ?? null,
          hide_type:       (order.container as { hide_type?: string | null } | null)?.hide_type ?? null,
          orders:          [],
          total_revenue:    0,
          total_outstanding: 0,
          total_collected:  0,
          order_count:      0,
        }
      }
      groupMap[cId].orders.push(order as SalesOrder)
      groupMap[cId].total_revenue     += Number(order.customer_payable)
      groupMap[cId].total_outstanding += Number(order.outstanding_balance)
      groupMap[cId].total_collected   += Number(order.amount_paid)
      groupMap[cId].order_count++
    }

    setGroups(Object.values(groupMap).sort((a, b) =>
      (b.orders[0]?.created_at ?? '').localeCompare(a.orders[0]?.created_at ?? ''),
    ))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function toggleGroup(containerId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(containerId)) next.delete(containerId)
      else next.add(containerId)
      return next
    })
  }

  const filteredGroups = groups.filter(g => {
    if (search === '') return true
    const s = search.toLowerCase()
    return (
      g.container_id.toLowerCase().includes(s) ||
      (g.tracking_number ?? '').toLowerCase().includes(s) ||
      g.orders.some(o =>
        o.order_id.toLowerCase().includes(s) ||
        (o.customer?.name ?? '').toLowerCase().includes(s),
      )
    )
  })

  const totalRevenue     = groups.reduce((s, g) => s + g.total_revenue, 0)
  const totalOutstanding = groups.reduce((s, g) => s + g.total_outstanding, 0)
  const totalCollected   = groups.reduce((s, g) => s + g.total_collected, 0)
  const totalOrders      = groups.reduce((s, g) => s + g.order_count, 0)

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales orders</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {groups.length} containers · {totalOrders} orders
          </p>
        </div>
        <button type="button" onClick={() => router.push('/portal/sales/orders/create')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700">
          <Plus size={15} /> New sales order
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total revenue',     value: fmt(totalRevenue),     color: 'text-green-700',  bg: 'bg-green-50',  icon: <TrendingUp size={15} className="text-green-600" /> },
          { label: 'Total collected',   value: fmt(totalCollected),   color: 'text-brand-700',  bg: 'bg-brand-50',  icon: <CheckCircle2 size={15} className="text-brand-600" /> },
          { label: 'Total outstanding', value: fmt(totalOutstanding), color: 'text-amber-700',  bg: 'bg-amber-50',  icon: <Clock size={15} className="text-amber-600" /> },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search container, tracking, customer..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* Grouped containers */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))
        ) : filteredGroups.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 flex flex-col items-center gap-2">
            <Package size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No sales orders found</p>
          </div>
        ) : filteredGroups.map(group => {
          const isOpen = expanded.has(group.container_id)
          const recoveryPct = group.total_revenue > 0
            ? (group.total_collected / group.total_revenue) * 100
            : 0

          return (
            <div key={group.container_id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Container header row */}
              <div
                className="px-5 py-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => toggleGroup(group.container_id)}>

                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                    <Package size={15} className="text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-brand-700">
                        {group.container_id}
                      </span>
                      {group.tracking_number && (
                        <span className="text-xs text-gray-400">{group.tracking_number}</span>
                      )}
                      {group.hide_type && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">
                          {group.hide_type}
                        </span>
                      )}
                      <span className="text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">
                        {group.order_count} order{group.order_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {/* Recovery progress bar */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="h-1.5 w-32 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${recoveryPct >= 100 ? 'bg-green-500' : recoveryPct >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(recoveryPct, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{recoveryPct.toFixed(0)}% collected</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-gray-400">Revenue</p>
                    <p className="text-sm font-bold text-green-700">{fmt(group.total_revenue)}</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-gray-400">Outstanding</p>
                    <p className={`text-sm font-bold ${group.total_outstanding > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {fmt(group.total_outstanding)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        router.push(`/portal/sales/orders/create?container_id=${group.container_db_id}`)
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                      <Plus size={12} /> Add order
                    </button>
                    {isOpen
                      ? <ChevronUp size={16} className="text-gray-400" />
                      : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </div>
              </div>

              {/* Orders within this container */}
              {isOpen && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-50 bg-gray-50/50">
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Order ID</th>
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Customer</th>
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Sale type</th>
                        <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-400">Payable</th>
                        <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-400">Paid</th>
                        <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-400">Outstanding</th>
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Status</th>
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Date</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.orders.map(order => {
                        const paymentCfg = PAYMENT_STATUS_CONFIG[order.payment_status] ?? PAYMENT_STATUS_CONFIG.outstanding
                        return (
                          <tr key={order.id}
                            className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                            onClick={() => router.push(`/portal/sales/orders/${order.id}`)}>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">
                                {order.order_id}
                              </span>
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <p className="text-xs font-medium text-gray-800">{order.customer?.name ?? '—'}</p>
                              <p className="text-xs text-gray-400">{order.customer?.customer_id ?? ''}</p>
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <span className="text-xs text-gray-500 capitalize">
                                {order.sale_type?.replace('_', ' ') ?? '—'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right whitespace-nowrap">
                              <span className="text-xs font-semibold text-gray-800">{fmt(order.customer_payable)}</span>
                            </td>
                            <td className="px-5 py-3 text-right whitespace-nowrap">
                              <span className="text-xs font-medium text-green-700">{fmt(order.amount_paid)}</span>
                            </td>
                            <td className="px-5 py-3 text-right whitespace-nowrap">
                              <span className={`text-xs font-bold ${order.outstanding_balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                                {fmt(order.outstanding_balance)}
                              </span>
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${paymentCfg.color}`}>
                                {paymentCfg.label}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                              {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-5 py-3">
                              <Eye size={14} className="text-gray-300 hover:text-brand-600 transition-colors" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
