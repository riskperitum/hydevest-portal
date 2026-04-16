'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Package, TrendingUp, Wallet, AlertCircle,
  ShoppingCart, BarChart3, Users, ArrowUpRight,
  ArrowDownRight, Clock, CheckCircle2, RefreshCw,
  ChevronRight
} from 'lucide-react'

interface KPI {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  color: string
  bg: string
  trend?: 'up' | 'down' | 'neutral'
  href?: string
}

const fmt    = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtUSD = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function timeAgo(date: string): string {
  const diff = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function OverviewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  // KPI data
  const [activeContainers, setActiveContainers] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [totalRecovered, setTotalRecovered] = useState(0)
  const [pendingTasks, setPendingTasks] = useState(0)
  const [partnerWallets, setPartnerWallets] = useState(0)
  const [supplierPayables, setSupplierPayables] = useState(0)
  const [containerInventoryValue, setContainerInventoryValue] = useState(0)
  const [grossMargin, setGrossMargin] = useState(0)

  // Recent activity
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [recentRecoveries, setRecentRecoveries] = useState<any[]>([])
  const [pendingTaskList, setPendingTaskList] = useState<any[]>([])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).single()
    setUserName(profile?.full_name?.split(' ')[0] ?? 'there')

    const [
      { data: containers },
      { data: salesOrders },
      { data: recoveries },
      { data: tasks },
      { data: partners },
      { data: tripExpenses },
      { data: recentSalesData },
      { data: recentRecovData },
      { data: pendingTaskData },
    ] = await Promise.all([
      supabase.from('containers').select('id, status, estimated_landing_cost'),
      supabase.from('sales_orders').select('customer_payable, outstanding_balance'),
      supabase.from('recoveries').select('amount_paid'),
      supabase.from('tasks').select('id').eq('status', 'pending'),
      supabase.from('partners').select('wallet_balance, wallet_allocated'),
      supabase.from('trip_expenses').select('amount_ngn, category').eq('category', 'container'),
      supabase.from('sales_orders')
        .select(`
          id, customer_payable, created_at,
          customer:customers!sales_orders_customer_id_fkey(name),
          container:containers!sales_orders_container_id_fkey(container_id)
        `)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('recoveries')
        .select(`
          id, amount_paid, payment_date,
          sales_order:sales_orders!recoveries_sales_order_id_fkey(
            customer:customers!sales_orders_customer_id_fkey(name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('tasks')
        .select(`
          id, task_id, title, module, priority, created_at,
          requested_by_profile:profiles!tasks_requested_by_fkey(full_name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    // KPIs
    const active = (containers ?? []).filter(c => c.status !== 'completed').length
    const invValue = (containers ?? []).filter(c => c.status !== 'completed')
      .reduce((s, c) => s + Number(c.estimated_landing_cost ?? 0), 0)

    const revenue = (salesOrders ?? []).reduce((s, so) => s + Number(so.customer_payable), 0)
    const outstanding = (salesOrders ?? []).reduce((s, so) => s + Number(so.outstanding_balance ?? 0), 0)
    const recovered = (recoveries ?? []).reduce((s, r) => s + Number(r.amount_paid), 0)
    const wallets = (partners ?? []).reduce((s, p) => s + Number(p.wallet_balance ?? 0) + Number(p.wallet_allocated ?? 0), 0)
    const supplierPaid = (tripExpenses ?? []).reduce((s, te) => s + Number(te.amount_ngn ?? 0), 0)
    const margin = revenue > 0 ? ((revenue - supplierPaid) / revenue) * 100 : 0

    setActiveContainers(active)
    setContainerInventoryValue(invValue)
    setTotalRevenue(revenue)
    setTotalOutstanding(outstanding)
    setTotalRecovered(recovered)
    setPendingTasks((tasks ?? []).length)
    setPartnerWallets(wallets)
    setSupplierPayables(supplierPaid)
    setGrossMargin(margin)
    setRecentSales(recentSalesData ?? [])
    setRecentRecoveries(recentRecovData ?? [])
    setPendingTaskList(pendingTaskData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const recoveryRate = totalRevenue > 0 ? (totalRecovered / totalRevenue) * 100 : 0

  const kpis: KPI[] = [
    {
      label: 'Active containers',
      value: activeContainers.toString(),
      sub: `${fmt(containerInventoryValue)} inventory value`,
      icon: <Package size={18} className="text-blue-600" />,
      color: 'text-blue-700', bg: 'bg-blue-50',
      trend: 'neutral', href: '/portal/purchase/containers',
    },
    {
      label: 'Total sales revenue',
      value: fmt(totalRevenue),
      sub: `${recoveryRate.toFixed(0)}% recovered`,
      icon: <TrendingUp size={18} className="text-green-600" />,
      color: 'text-green-700', bg: 'bg-green-50',
      trend: 'up', href: '/portal/sales/orders',
    },
    {
      label: 'Outstanding receivables',
      value: fmt(totalOutstanding),
      sub: `${fmt(totalRecovered)} collected so far`,
      icon: <Clock size={18} className={totalOutstanding > 0 ? 'text-amber-600' : 'text-green-600'} />,
      color: totalOutstanding > 0 ? 'text-amber-700' : 'text-green-700',
      bg: totalOutstanding > 0 ? 'bg-amber-50' : 'bg-green-50',
      trend: totalOutstanding > 0 ? 'down' : 'neutral',
      href: '/portal/reports/customer-debt',
    },
    {
      label: 'Partner wallets',
      value: fmt(partnerWallets),
      sub: 'Total partner positions',
      icon: <Wallet size={18} className="text-brand-600" />,
      color: 'text-brand-700', bg: 'bg-brand-50',
      trend: 'neutral', href: '/portal/partnership',
    },
    {
      label: 'Pending tasks',
      value: pendingTasks.toString(),
      sub: 'Awaiting your action',
      icon: <AlertCircle size={18} className={pendingTasks > 0 ? 'text-red-500' : 'text-green-600'} />,
      color: pendingTasks > 0 ? 'text-red-600' : 'text-green-700',
      bg: pendingTasks > 0 ? 'bg-red-50' : 'bg-green-50',
      trend: pendingTasks > 0 ? 'down' : 'neutral',
      href: '/portal/tasks',
    },
    {
      label: 'Gross margin',
      value: `${grossMargin.toFixed(1)}%`,
      sub: `${fmt(supplierPayables)} cost of sales`,
      icon: <BarChart3 size={18} className={grossMargin >= 20 ? 'text-green-600' : 'text-amber-600'} />,
      color: grossMargin >= 20 ? 'text-green-700' : 'text-amber-700',
      bg: grossMargin >= 20 ? 'bg-green-50' : 'bg-amber-50',
      trend: grossMargin >= 20 ? 'up' : 'down',
      href: '/portal/reports/container-profit',
    },
  ]

  const PRIORITY_COLOR: Record<string, string> = {
    urgent: 'bg-red-50 text-red-600',
    high:   'bg-amber-50 text-amber-700',
    normal: 'bg-blue-50 text-blue-600',
    low:    'bg-gray-100 text-gray-500',
  }

  const MODULE_LABEL: Record<string, string> = {
    trips: 'Trip', containers: 'Container', presales: 'Presale',
    sales_orders: 'Sales', recoveries: 'Recovery', expenses: 'Expense',
    supplier_receivables: 'Supplier rec.', partner_payouts: 'Partner payout',
  }

  return (
    <div className="space-y-6 max-w-7xl">

      {/* Welcome */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {userName} 👋</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {kpis.map(kpi => (
          <button key={kpi.label}
            onClick={() => kpi.href && router.push(kpi.href)}
            className={`${kpi.bg} rounded-xl border border-white shadow-sm p-5 text-left hover:shadow-md transition-all group ${kpi.href ? 'cursor-pointer' : 'cursor-default'}`}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
                {kpi.icon}
              </div>
              {kpi.href && <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1 shrink-0" />}
            </div>
            <p className={`text-xl font-bold truncate ${kpi.color}`}>{loading ? '—' : kpi.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{loading ? '...' : kpi.sub}</p>
          </button>
        ))}
      </div>

      {/* Recovery progress */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Recovery progress</h2>
          <button onClick={() => router.push('/portal/reports/customer-debt')}
            className="text-xs text-brand-600 hover:underline">View details →</button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Collected: <span className="font-semibold text-green-700">{fmt(totalRecovered)}</span></span>
            <span>Outstanding: <span className="font-semibold text-amber-700">{fmt(totalOutstanding)}</span></span>
            <span>Total billed: <span className="font-semibold text-gray-700">{fmt(totalRevenue)}</span></span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${recoveryRate >= 80 ? 'bg-green-500' : recoveryRate >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(recoveryRate, 100)}%` }} />
          </div>
          <p className="text-xs text-gray-400 text-right">{recoveryRate.toFixed(1)}% of total revenue collected</p>
        </div>
      </div>

      {/* Three column activity section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Recent sales */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Recent sales</h3>
            <button onClick={() => router.push('/portal/sales/orders')} className="text-xs text-brand-600 hover:underline">All →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 animate-pulse flex gap-3">
                  <div className="h-3 bg-gray-100 rounded flex-1" />
                  <div className="h-3 bg-gray-100 rounded w-20" />
                </div>
              ))
            ) : recentSales.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">No sales yet</div>
            ) : recentSales.map(sale => (
              <div key={sale.id} className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {(sale.customer as any)?.name ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(sale.container as any)?.container_id ?? '—'} · {timeAgo(sale.created_at)}
                  </p>
                </div>
                <span className="text-xs font-semibold text-green-700 shrink-0">
                  {fmt(Number(sale.customer_payable))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent recoveries */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Recent recoveries</h3>
            <button onClick={() => router.push('/portal/recoveries')} className="text-xs text-brand-600 hover:underline">All →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 animate-pulse flex gap-3">
                  <div className="h-3 bg-gray-100 rounded flex-1" />
                  <div className="h-3 bg-gray-100 rounded w-20" />
                </div>
              ))
            ) : recentRecoveries.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">No recoveries yet</div>
            ) : recentRecoveries.map(rec => (
              <div key={rec.id} className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {(rec.sales_order as any)?.customer?.name ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rec.payment_date
                      ? new Date(rec.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      : '—'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-brand-700 shrink-0">
                  {fmt(Number(rec.amount_paid))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pending tasks */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Pending tasks</h3>
            <button onClick={() => router.push('/portal/tasks')} className="text-xs text-brand-600 hover:underline">All →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 animate-pulse flex gap-3">
                  <div className="h-3 bg-gray-100 rounded flex-1" />
                  <div className="h-3 bg-gray-100 rounded w-20" />
                </div>
              ))
            ) : pendingTaskList.length === 0 ? (
              <div className="p-6 text-center">
                <CheckCircle2 size={20} className="text-green-300 mx-auto mb-1" />
                <p className="text-xs text-gray-400">All clear!</p>
              </div>
            ) : pendingTaskList.map(task => (
              <button key={task.id}
                onClick={() => router.push('/portal/tasks')}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${PRIORITY_COLOR[task.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                        {task.priority}
                      </span>
                      <span className="text-xs text-gray-400">{MODULE_LABEL[task.module] ?? task.module}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(task.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

