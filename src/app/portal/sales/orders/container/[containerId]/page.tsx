'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Eye, Package, TrendingUp, Clock, CheckCircle2 } from 'lucide-react'

interface SalesOrder {
  id: string
  order_id: string
  sale_type: string
  sale_amount: number
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  payment_status: string
  approval_status: string
  status: string
  created_at: string
  customer: { name: string; customer_id: string } | null
  presale: { presale_id: string; sale_type: string } | null
}

interface ContainerInfo {
  id: string
  container_id: string
  tracking_number: string | null
  hide_type: string | null
  trip: { trip_id: string; title: string } | null
}

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  paid:        { label: 'Fully paid',  color: 'bg-green-50 text-green-700' },
  partial:     { label: 'Partial',     color: 'bg-amber-50 text-amber-700' },
  outstanding: { label: 'Outstanding', color: 'bg-red-50 text-red-600'    },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ContainerOrdersPage() {
  const params      = useParams()
  const router      = useRouter()
  const containerId = params.containerId as string

  const [container, setContainer] = useState<ContainerInfo | null>(null)
  const [orders, setOrders]       = useState<SalesOrder[]>([])
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: containerData }, { data: ordersData }] = await Promise.all([
      supabase.from('containers')
        .select('id, container_id, tracking_number, hide_type, trip:trips!containers_trip_id_fkey(trip_id, title)')
        .eq('id', containerId)
        .single(),
      supabase.from('sales_orders')
        .select(`
          id, order_id, sale_type, sale_amount, customer_payable,
          amount_paid, outstanding_balance, payment_status,
          approval_status, status, created_at,
          customer:customers!sales_orders_customer_id_fkey(name, customer_id),
          presale:presales!sales_orders_presale_id_fkey(presale_id, sale_type)
        `)
        .eq('container_id', containerId)
        .order('created_at', { ascending: false }),
    ])

    setContainer(containerData as any)
    setOrders(ordersData ?? [])
    setLoading(false)
  }, [containerId])

  useEffect(() => { load() }, [load])

  const totalRevenue     = orders.reduce((s, o) => s + Number(o.customer_payable), 0)
  const totalCollected   = orders.reduce((s, o) => s + Number(o.amount_paid), 0)
  const totalOutstanding = orders.reduce((s, o) => s + Number(o.outstanding_balance), 0)
  const recoveryPct      = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">
                {container?.tracking_number ?? container?.container_id ?? '—'}
              </h1>
              {container?.tracking_number && (
                <span className="text-sm text-gray-400 font-mono">{container.container_id}</span>
              )}
              {container?.hide_type && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded capitalize">
                  {container.hide_type}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">
              {(container?.trip as any)?.trip_id} — {(container?.trip as any)?.title}
            </p>
          </div>
        </div>
        <button onClick={() => router.push(`/portal/sales/orders/create?container_id=${containerId}`)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700">
          <Plus size={15} /> New sales order
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total orders',    value: orders.length.toString(), color: 'text-blue-700',   bg: 'bg-blue-50',   icon: <Package size={15} className="text-blue-600" /> },
          { label: 'Total revenue',   value: fmt(totalRevenue),        color: 'text-green-700',  bg: 'bg-green-50',  icon: <TrendingUp size={15} className="text-green-600" /> },
          { label: 'Total collected', value: fmt(totalCollected),      color: 'text-brand-700',  bg: 'bg-brand-50',  icon: <CheckCircle2 size={15} className="text-brand-600" /> },
          { label: 'Outstanding',     value: fmt(totalOutstanding),    color: 'text-amber-700',  bg: 'bg-amber-50',  icon: <Clock size={15} className="text-amber-600" /> },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Recovery progress */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>Recovery progress</span>
          <span className={`font-semibold ${recoveryPct >= 100 ? 'text-green-600' : recoveryPct >= 50 ? 'text-brand-600' : 'text-amber-600'}`}>
            {recoveryPct.toFixed(1)}% collected
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${recoveryPct >= 100 ? 'bg-green-500' : recoveryPct >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
            style={{ width: `${Math.min(recoveryPct, 100)}%` }} />
        </div>
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            Sales orders — {orders.length} order{orders.length !== 1 ? 's' : ''}
          </h3>
        </div>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 border-b animate-pulse flex gap-4">
              <div className="h-4 bg-gray-100 rounded w-24" />
              <div className="h-4 bg-gray-100 rounded flex-1" />
            </div>
          ))
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Package size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No sales orders yet for this container</p>
            <button onClick={() => router.push(`/portal/sales/orders/create?container_id=${containerId}`)}
              className="text-xs font-medium text-brand-600 hover:underline">
              Create first order
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Order ID</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Customer</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Type</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-400">Payable</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-400">Paid</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-400">Outstanding</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Status</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Date</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(order => {
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
                    <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-500 capitalize">
                      {order.sale_type?.replace('_', ' ') ?? '—'}
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
        )}
      </div>
    </div>
  )
}
