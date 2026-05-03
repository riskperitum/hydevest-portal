'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, TrendingUp, Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

interface ContainerDetail {
  container_id: string
  tracking_number: string | null
  pieces_purchased: number
  status: string
  trip: { trip_id: string; title: string; source_location: string | null } | null
  presale_id: string
  presale_db_id: string
  sale_type: string
  presale_status: string
  warehouse_confirmed_pieces: number | null
  total_number_of_pallets: number | null
  price_per_piece: number | null
  price_per_kilo: number | null
  expected_revenue: number
  effective_landing_cost: number | null
}

interface SalesOrderRow {
  id: string
  order_id: string
  sale_type: string
  customer_name: string
  customer_id: string
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  payment_status: string
  approval_status: string
  payment_method: string
  created_at: string
  pallets_summary: string
}

interface RecoveryRow {
  id: string
  recovery_id: string
  order_id: string
  customer_name: string
  payment_type: string
  amount_paid: number
  payment_date: string
  payment_method: string
  comments: string | null
  approval_status: string
}

const PAYMENT_STATUS = {
  paid:        { label: 'Fully paid',  color: 'bg-green-50 text-green-700' },
  partial:     { label: 'Partial',     color: 'bg-amber-50 text-amber-700' },
  outstanding: { label: 'Outstanding', color: 'bg-red-50 text-red-600' },
}

export default function ContainerSalesDrilldownPage() {
  const params = useParams()
  const containerId = params.id as string

  const [container, setContainer] = useState<ContainerDetail | null>(null)
  const [salesOrders, setSalesOrders] = useState<SalesOrderRow[]>([])
  const [recoveries, setRecoveries] = useState<RecoveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'orders' | 'recoveries'>('orders')

  const load = useCallback(async () => {
    const supabase = createClient()

    // Load container + presale
    const { data: cont } = await supabase
      .from('containers')
      .select('id, container_id, tracking_number, pieces_purchased, status, trip_id, estimated_landing_cost, effective_landing_cost')
      .eq('id', containerId)
      .single()

    if (!cont) { setLoading(false); return }

    const [{ data: trip }, { data: presale }] = await Promise.all([
      supabase.from('trips').select('trip_id, title, source_location').eq('id', cont.trip_id).single(),
      supabase.from('presales')
        .select('id, presale_id, sale_type, status, expected_sale_revenue, price_per_piece, price_per_kilo, warehouse_confirmed_pieces, total_number_of_pallets')
        .eq('container_id', containerId)
        .single(),
    ])

    setContainer({
      container_id: cont.container_id,
      tracking_number: cont.tracking_number,
      pieces_purchased: cont.pieces_purchased ?? 0,
      status: cont.status,
      trip: trip ?? null,
      effective_landing_cost: (cont as any).effective_landing_cost ?? (cont as any).estimated_landing_cost ?? null,
      presale_id: presale?.presale_id ?? '—',
      presale_db_id: presale?.id ?? '',
      sale_type: presale?.sale_type ?? '—',
      presale_status: presale?.status ?? '—',
      warehouse_confirmed_pieces: presale?.warehouse_confirmed_pieces ?? null,
      total_number_of_pallets: presale?.total_number_of_pallets ?? null,
      price_per_piece: presale?.price_per_piece ? Number(presale.price_per_piece) : null,
      price_per_kilo: presale?.price_per_kilo ? Number(presale.price_per_kilo) : null,
      expected_revenue: Number(presale?.expected_sale_revenue ?? 0),
    })

    // Load sales orders for this container
    const { data: orders } = await supabase
      .from('sales_orders')
      .select(`
        id, order_id, sale_type, customer_payable, amount_paid,
        outstanding_balance, payment_status, approval_status, payment_method, created_at,
        customer:customers(name, customer_id)
      `)
      .eq('container_id', containerId)
      .order('created_at', { ascending: true })

    // Load pallet lines per order
    const orderIds = (orders ?? []).map(o => o.id)
    const { data: palletLines } = orderIds.length > 0
      ? await supabase.from('sales_order_pallets')
          .select('order_id, pallets_sold, pieces_per_pallet, total_pieces, line_total')
          .in('order_id', orderIds)
      : { data: [] }

    const palletsByOrder = (palletLines ?? []).reduce((acc, pl) => {
      if (!acc[pl.order_id]) acc[pl.order_id] = []
      acc[pl.order_id].push(pl)
      return acc
    }, {} as Record<string, any[]>)

    setSalesOrders((orders ?? []).map(o => {
      const lines = palletsByOrder[o.id] ?? []
      const palletsSummary = lines.length > 0
        ? lines.map(l => `${l.pallets_sold} × ${l.pieces_per_pallet}pcs`).join(', ')
        : '—'
      return {
        id: o.id,
        order_id: o.order_id,
        sale_type: o.sale_type,
        customer_name: (o.customer as any)?.name ?? '—',
        customer_id: (o.customer as any)?.customer_id ?? '—',
        customer_payable: Number(o.customer_payable),
        amount_paid: Number(o.amount_paid),
        outstanding_balance: Number(o.outstanding_balance),
        payment_status: o.payment_status,
        approval_status: o.approval_status,
        payment_method: o.payment_method,
        created_at: o.created_at,
        pallets_summary: palletsSummary,
      }
    }))

    // Load recoveries for all orders of this container
    if (orderIds.length > 0) {
      const { data: recs } = await supabase
        .from('recoveries')
        .select(`
          id, recovery_id, sales_order_id, payment_type,
          amount_paid, payment_date, payment_method, comments, approval_status,
          sales_order:sales_orders(order_id, customer:customers(name, customer_id))
        `)
        .in('sales_order_id', orderIds)
        .order('created_at', { ascending: true })

      setRecoveries((recs ?? []).map(r => ({
        id: r.id,
        recovery_id: r.recovery_id,
        order_id: (r.sales_order as any)?.order_id ?? '—',
        customer_name: (r.sales_order as any)?.customer?.name ?? '—',
        payment_type: r.payment_type,
        amount_paid: Number(r.amount_paid),
        payment_date: r.payment_date,
        payment_method: r.payment_method,
        comments: r.comments,
        approval_status: r.approval_status,
      })))
    }

    setLoading(false)
  }, [containerId])

  useEffect(() => { load() }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Computed metrics
  const totalSales = salesOrders.reduce((s, o) => s + o.customer_payable, 0)
  const totalRecovery = recoveries.reduce((s, r) => s + r.amount_paid, 0)
  const totalReceivables = Math.max(totalSales - totalRecovery, 0)
  const effectiveLandingCost = container?.effective_landing_cost ?? null
  const netDifference = effectiveLandingCost !== null ? totalRecovery - Number(effectiveLandingCost) : null
  const isInProfit = netDifference !== null && netDifference >= 0
  const progressPct = container?.expected_revenue
    ? Math.min((totalRecovery / container.expected_revenue) * 100, 100)
    : 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!container) return <div className="text-center py-16 text-gray-400">Container not found.</div>

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/reports/container-sales"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{container.container_id}</span>
            <span className="font-mono text-xs text-gray-500">{container.tracking_number ?? '—'}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${container.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
              {container.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}
            </span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mt-0.5">{container.trip?.title ?? 'Container Sales Drilldown'}</h1>
          <p className="text-xs text-gray-400">{container.trip?.trip_id} · {container.trip?.source_location ?? '—'}</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Effective landing cost', value: effectiveLandingCost !== null ? fmt(Number(effectiveLandingCost)) : '—', icon: <Wallet size={14} className="text-gray-600" />, color: 'text-gray-800', bg: 'bg-gray-50' },
          { label: 'Expected revenue', value: fmt(container.expected_revenue), icon: <Wallet size={14} className="text-brand-600" />, color: 'text-brand-700', bg: 'bg-brand-50' },
          { label: 'Sales to date', value: totalSales > 0 ? fmt(totalSales) : '—', icon: <TrendingUp size={14} className="text-blue-600" />, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Recovery to date', value: totalRecovery > 0 ? fmt(totalRecovery) : '—', icon: <CheckCircle2 size={14} className="text-green-600" />, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Net difference', value: netDifference !== null ? `${netDifference >= 0 ? '+' : ''}${fmt(netDifference)}` : '—', icon: <TrendingUp size={14} className={isInProfit ? 'text-green-600' : 'text-red-500'} />, color: isInProfit ? 'text-green-700' : 'text-red-600', bg: isInProfit ? 'bg-green-50' : 'bg-red-50' },
          { label: 'Profit status', value: effectiveLandingCost !== null ? (isInProfit ? 'In profit' : 'Not yet in profit') : '—', icon: <CheckCircle2 size={14} className={isInProfit ? 'text-green-600' : 'text-amber-500'} />, color: isInProfit ? 'text-green-700' : 'text-amber-700', bg: isInProfit ? 'bg-green-50' : 'bg-amber-50' },
          { label: 'Receivables', value: totalReceivables > 0 ? fmt(totalReceivables) : '—', icon: <AlertTriangle size={14} className={totalReceivables > 0 ? 'text-red-500' : 'text-green-500'} />, color: totalReceivables > 0 ? 'text-red-600' : 'text-green-600', bg: totalReceivables > 0 ? 'bg-red-50' : 'bg-green-50' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
            <div className="flex items-center gap-2 mb-1.5">
              {m.icon}
              <p className="text-xs text-gray-500">{m.label}</p>
            </div>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Recovery progress bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Recovery progress</p>
          <p className="text-sm font-bold text-brand-600">{progressPct.toFixed(1)}%</p>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : progressPct >= 60 ? 'bg-brand-500' : progressPct >= 30 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Recovered: <span className="font-semibold text-gray-700">{fmt(totalRecovery)}</span></span>
          <span>Goal: <span className="font-semibold text-gray-700">{fmt(container.expected_revenue)}</span></span>
        </div>
      </div>

      {/* Container info */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-700">Container information</h2>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Container ID', value: container.container_id },
            { label: 'Tracking No.', value: container.tracking_number ?? '—' },
            { label: 'Presale ID', value: container.presale_id },
            { label: 'Sale type', value: container.sale_type === 'box_sale' ? 'Box sale' : 'Split sale' },
            { label: 'Trip', value: container.trip?.trip_id ?? '—' },
            { label: 'Trip location', value: container.trip?.source_location ?? '—' },
            { label: 'Pieces purchased', value: container.pieces_purchased.toLocaleString() },
            { label: 'W/H confirmed pieces', value: container.warehouse_confirmed_pieces?.toLocaleString() ?? '—' },
            { label: 'Total pallets', value: container.total_number_of_pallets?.toString() ?? '—' },
            { label: 'Price per piece', value: container.price_per_piece ? fmt(container.price_per_piece) : '—' },
            { label: 'Price per kilo', value: container.price_per_kilo ? fmt(container.price_per_kilo) : '—' },
            { label: 'Expected revenue', value: fmt(container.expected_revenue) },
          ].map(item => (
            <div key={item.label}>
              <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
              <p className="text-sm font-medium text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs — Sales orders + Recoveries */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'orders', label: 'Sales orders', count: salesOrders.length },
            { key: 'recoveries', label: 'Recoveries', count: recoveries.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as 'orders' | 'recoveries')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Sales orders tab */}
        {activeTab === 'orders' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Order ID', 'Customer', 'Pallets / Type', 'Payable', 'Paid', 'Outstanding', 'Payment', 'Approval', 'Date'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salesOrders.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No sales orders yet.</td></tr>
                ) : salesOrders.map(order => {
                  const psCfg = PAYMENT_STATUS[order.payment_status as keyof typeof PAYMENT_STATUS] ?? PAYMENT_STATUS.outstanding
                  return (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{order.order_id}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="text-sm font-medium text-gray-900">{order.customer_name}</p>
                        <p className="text-xs text-gray-400">{order.customer_id}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {order.sale_type === 'split_sale' ? (
                          <span className="text-xs text-gray-600">{order.pallets_summary}</span>
                        ) : (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Box sale</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(order.customer_payable)}</td>
                      <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap">{fmt(order.amount_paid)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-semibold ${order.outstanding_balance > 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {order.outstanding_balance > 0 ? fmt(order.outstanding_balance) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${psCfg.color}`}>{psCfg.label}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${order.approval_status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                          {order.approval_status === 'approved' ? 'Approved' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {salesOrders.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-brand-100">
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Totals</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-brand-700 whitespace-nowrap">{fmt(totalSales)}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(salesOrders.reduce((s,o)=>s+o.amount_paid,0))}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-red-500 whitespace-nowrap">{fmt(salesOrders.reduce((s,o)=>s+o.outstanding_balance,0))}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Recoveries tab */}
        {activeTab === 'recoveries' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Recovery ID', 'Order', 'Customer', 'Type', 'Amount', 'Date', 'Method', 'Comments', 'Status'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recoveries.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No recoveries yet.</td></tr>
                ) : recoveries.map((rec, idx) => (
                  <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{rec.recovery_id}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-500">{rec.order_id}</span>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{rec.customer_name}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                        ${rec.payment_type === 'initial' ? 'bg-blue-50 text-blue-700' : 'bg-brand-50 text-brand-700'}`}>
                        {rec.payment_type === 'initial' ? 'Initial payment' : `Recovery #${recoveries.filter((r, i) => r.payment_type !== 'initial' && i <= idx).length}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{fmt(rec.amount_paid)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(rec.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 capitalize whitespace-nowrap">
                      {rec.payment_method === 'transfer' ? 'Bank transfer' : 'Cash'}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[150px] truncate">{rec.comments ?? '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                        ${rec.approval_status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {rec.approval_status === 'approved' ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {recoveries.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-brand-100">
                    <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Total recovered</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(totalRecovery)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
