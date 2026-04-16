'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Package, TrendingUp, AlertCircle, Clock,
  CheckCircle2, RefreshCw, ChevronRight,
  ShoppingCart, FileText, DollarSign, Users,
  BarChart3, PlusCircle, Wallet
} from 'lucide-react'
import { usePermissions, can } from '@/lib/permissions/hooks'
import MonthlyBarChart  from './MonthlyBarChart'
import MonthlyLineChart from './MonthlyLineChart'

const fmt     = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtPct  = (n: number) => `${Number(n).toFixed(1)}%`

function timeAgo(date: string): string {
  const diff = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'bg-red-50 text-red-600',
  high:   'bg-amber-50 text-amber-700',
  normal: 'bg-blue-50 text-blue-600',
  low:    'bg-gray-100 text-gray-500',
}

const MODULE_LABEL: Record<string, string> = {
  trips:                'Trip',
  containers:           'Container',
  presales:             'Presale',
  sales_orders:         'Sales',
  recoveries:           'Recovery',
  expenses:             'Expense',
  supplier_receivables: 'Supplier rec.',
  partner_payouts:      'Partner payout',
}

const RANGE_OPTIONS = [
  { key: '7d',  label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
]

const QUICK_ACTIONS = [
  { label: 'New trip',       icon: Package,      href: '/portal/purchase/trips',    color: 'bg-blue-50 text-blue-700' },
  { label: 'New presale',    icon: ShoppingCart, href: '/portal/sales/presales/create', color: 'bg-brand-50 text-brand-700' },
  { label: 'New sales order',icon: FileText,     href: '/portal/sales/orders/create',   color: 'bg-green-50 text-green-700' },
  { label: 'Add expense',    icon: DollarSign,   href: '/portal/expensify',         color: 'bg-amber-50 text-amber-700' },
  { label: 'View tasks',     icon: CheckCircle2, href: '/portal/tasks',             color: 'bg-red-50 text-red-600' },
  { label: 'Partnership',    icon: Users,        href: '/portal/partnership',       color: 'bg-purple-50 text-purple-700' },
  { label: 'Reports',        icon: BarChart3,    href: '/portal/reports',           color: 'bg-gray-100 text-gray-700' },
  { label: 'Request box',    icon: Wallet,       href: '/portal/requestbox',        color: 'bg-teal-50 text-teal-700' },
]

export default function OverviewPage() {
  const router   = useRouter()
  const { permissions, isSuperAdmin, loading: permLoading } = usePermissions()
  const canViewCosts = can(permissions, isSuperAdmin, 'view_costs')

  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const [loading, setLoading]       = useState(true)
  const [userName, setUserName]     = useState('')
  const [range, setRange]           = useState('30d')

  // KPIs
  const [activeContainers, setActiveContainers]     = useState(0)
  const [inventoryValue, setInventoryValue]         = useState(0)
  const [totalRevenue, setTotalRevenue]             = useState(0)
  const [totalOutstanding, setTotalOutstanding]     = useState(0)
  const [totalRecovered, setTotalRecovered]         = useState(0)
  const [pendingTasks, setPendingTasks]             = useState(0)
  const [grossMargin, setGrossMargin]               = useState(0)
  const [totalCost, setTotalCost]                   = useState(0)
  const [tripsCount, setTripsCount]                 = useState(0)
  const [approvalQueue, setApprovalQueue]           = useState(0)
  const [totalSalesOrders, setTotalSalesOrders]     = useState(0)
  const [completedContainers, setCompletedContainers] = useState(0)

  // Activity
  const [recentSales, setRecentSales]           = useState<any[]>([])
  const [recentRecoveries, setRecentRecoveries] = useState<any[]>([])
  const [pendingTaskList, setPendingTaskList]   = useState<any[]>([])
  const [topDebtors, setTopDebtors]             = useState<any[]>([])
  const [containerData, setContainerData]       = useState<any[]>([])
  const [monthlyChartData, setMonthlyChartData] = useState<{
    labels: string[]
    revenue: number[]
    collected: number[]
    expenses: number[]
    orderCount: number[]
  }>({ labels: [], revenue: [], collected: [], expenses: [], orderCount: [] })

  function getRangeStart(r: string): string | null {
    const now = new Date()
    if (r === '7d')  { now.setDate(now.getDate() - 7);   return now.toISOString() }
    if (r === '30d') { now.setDate(now.getDate() - 30);  return now.toISOString() }
    if (r === '90d') { now.setDate(now.getDate() - 90);  return now.toISOString() }
    if (r === 'ytd') { return new Date(new Date().getFullYear(), 0, 1).toISOString() }
    return null
  }

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).single()
    setUserName(profile?.full_name?.split(' ')[0] ?? 'there')

    const rangeStart = getRangeStart(range)

    // Build date filter
    const dateFilter = (q: any) => rangeStart ? q.gte('created_at', rangeStart) : q

    const [
      { data: containers },
      { data: allSalesOrders },
      { data: recoveries },
      { data: tasks },
      { data: tripExpenses },
      { data: trips },
      { data: recentSalesData },
      { data: recentRecovData },
      { data: pendingTaskData },
      { data: monthlySales },
      { data: monthlyRecoveries },
      { data: monthlyExpenses },
    ] = await Promise.all([
      supabase.from('containers').select('id, status, estimated_landing_cost, container_id, unit_price_usd, quoted_price_usd'),
      dateFilter(supabase.from('sales_orders').select(`
        id, customer_payable, outstanding_balance, created_at,
        customer:customers!sales_orders_customer_id_fkey(name),
        container:containers!sales_orders_container_id_fkey(container_id)
      `)),
      dateFilter(supabase.from('recoveries').select('amount_paid, created_at')),
      supabase.from('tasks').select('id, status').eq('status', 'pending'),
      supabase.from('trip_expenses').select('amount_ngn, category'),
      dateFilter(supabase.from('trips').select('id, created_at')),
      dateFilter(supabase.from('sales_orders').select(`
        id, customer_payable, created_at,
        customer:customers!sales_orders_customer_id_fkey(name),
        container:containers!sales_orders_container_id_fkey(container_id)
      `)).order('created_at', { ascending: false }).limit(5),
      dateFilter(supabase.from('recoveries').select(`
        id, amount_paid, payment_date, created_at,
        sales_order:sales_orders!recoveries_sales_order_id_fkey(
          customer:customers!sales_orders_customer_id_fkey(name)
        )
      `)).order('created_at', { ascending: false }).limit(5),
      supabase.from('tasks').select(`
        id, task_id, title, module, priority, created_at,
        requested_by_profile:profiles!tasks_requested_by_fkey(full_name)
      `).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      supabase.from('sales_orders')
        .select('created_at, customer_payable')
        .order('created_at', { ascending: true }),
      supabase.from('recoveries')
        .select('created_at, amount_paid')
        .order('created_at', { ascending: true }),
      supabase.from('trip_expenses')
        .select('created_at, amount_ngn')
        .order('created_at', { ascending: true }),
    ])

    // KPI calculations
    const active    = (containers ?? []).filter(c => c.status !== 'completed').length
    const completed = (containers ?? []).filter(c => c.status === 'completed').length
    const invVal    = (containers ?? []).filter(c => c.status !== 'completed')
      .reduce((s, c) => s + Number(c.estimated_landing_cost ?? 0), 0)

    const revenue     = (allSalesOrders ?? []).reduce((s, so) => s + Number(so.customer_payable), 0)
    const outstanding = (allSalesOrders ?? []).reduce((s, so) => s + Number(so.outstanding_balance ?? 0), 0)
    const recovered   = (recoveries ?? []).reduce((s, r) => s + Number(r.amount_paid), 0)
    const cost        = (tripExpenses ?? []).filter(te => te.category === 'container')
      .reduce((s, te) => s + Number(te.amount_ngn ?? 0), 0)
    const margin      = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0

    // Top debtors
    const debtorMap: Record<string, { name: string; billed: number; outstanding: number; collected: number }> = {}
    for (const so of (allSalesOrders ?? [])) {
      const name = (so.customer as any)?.name ?? 'Unknown'
      if (!debtorMap[name]) debtorMap[name] = { name, billed: 0, outstanding: 0, collected: 0 }
      debtorMap[name].billed      += Number(so.customer_payable)
      debtorMap[name].outstanding += Number(so.outstanding_balance ?? 0)
      debtorMap[name].collected   += Number(so.customer_payable) - Number(so.outstanding_balance ?? 0)
    }
    const debtors = Object.values(debtorMap)
      .filter(d => d.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)

    // Container data for chart
    const contData = (containers ?? []).map(c => {
      const soForContainer = (allSalesOrders ?? []).filter(so => (so.container as any)?.container_id === c.container_id)
      const rev = soForContainer.reduce((s, so) => s + Number(so.customer_payable), 0)
      return {
        id:       c.container_id,
        revenue:  rev,
        cost:     Number(c.estimated_landing_cost ?? 0),
        profit:   rev - Number(c.estimated_landing_cost ?? 0),
        status:   c.status,
      }
    })

    // Build monthly chart data
    const monthMap: Record<string, { revenue: number; collected: number; expenses: number; orderCount: number }> = {}

    const getMonthKey = (dateStr: string) => {
      const d = new Date(dateStr)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const getMonthLabel = (key: string) => {
      const [y, m] = key.split('-')
      return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    }

    for (const so of (monthlySales ?? [])) {
      const k = getMonthKey(so.created_at)
      if (!monthMap[k]) monthMap[k] = { revenue: 0, collected: 0, expenses: 0, orderCount: 0 }
      monthMap[k].revenue += Number(so.customer_payable)
      monthMap[k].orderCount += 1
    }
    for (const r of (monthlyRecoveries ?? [])) {
      const k = getMonthKey(r.created_at)
      if (!monthMap[k]) monthMap[k] = { revenue: 0, collected: 0, expenses: 0, orderCount: 0 }
      monthMap[k].collected += Number(r.amount_paid)
    }
    for (const e of (monthlyExpenses ?? [])) {
      const k = getMonthKey(e.created_at)
      if (!monthMap[k]) monthMap[k] = { revenue: 0, collected: 0, expenses: 0, orderCount: 0 }
      monthMap[k].expenses += Number(e.amount_ngn)
    }

    // Fill in missing months between first and last
    const keys = Object.keys(monthMap).sort()
    if (keys.length > 0) {
      const first = new Date(keys[0] + '-01')
      const last  = new Date(keys[keys.length - 1] + '-01')
      const cursor = new Date(first)
      while (cursor <= last) {
        const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
        if (!monthMap[k]) monthMap[k] = { revenue: 0, collected: 0, expenses: 0, orderCount: 0 }
        cursor.setMonth(cursor.getMonth() + 1)
      }
    }

    const sortedKeys = Object.keys(monthMap).sort()

    // Pad to at least 6 months for better chart appearance
    while (sortedKeys.length < 6) {
      const first = sortedKeys[0]
      if (first) {
        const [y, m] = first.split('-').map(Number)
        const prev = new Date(y, m - 2, 1)
        const k = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
        sortedKeys.unshift(k)
        monthMap[k] = { revenue: 0, collected: 0, expenses: 0, orderCount: 0 }
      } else {
        break
      }
    }

    if (!isMountedRef.current) return
    setActiveContainers(active)
    setCompletedContainers(completed)
    setInventoryValue(invVal)
    setTotalRevenue(revenue)
    setTotalOutstanding(outstanding)
    setTotalRecovered(recovered)
    setPendingTasks((tasks ?? []).length)
    setGrossMargin(margin)
    setTotalCost(cost)
    setTripsCount((trips ?? []).length)
    setApprovalQueue((pendingTaskData ?? []).filter((t: any) => ['urgent','high'].includes(t.priority)).length)
    setTotalSalesOrders((allSalesOrders ?? []).length)
    setRecentSales(recentSalesData ?? [])
    setRecentRecoveries(recentRecovData ?? [])
    setPendingTaskList(pendingTaskData ?? [])
    setTopDebtors(debtors)
    setContainerData(contData)
    setMonthlyChartData({
      labels:     sortedKeys.map(getMonthLabel),
      revenue:    sortedKeys.map(k => Math.round(monthMap[k].revenue)),
      collected:  sortedKeys.map(k => Math.round(monthMap[k].collected)),
      expenses:   sortedKeys.map(k => Math.round(monthMap[k].expenses)),
      orderCount: sortedKeys.map(k => monthMap[k].orderCount),
    })
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const recoveryRate = totalRevenue > 0 ? (totalRecovered / totalRevenue) * 100 : 0
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // KPI tiles config
  const kpiRow1 = [
    {
      label: 'Total revenue',
      value: fmt(totalRevenue),
      sub: `${totalSalesOrders} sales orders`,
      icon: <TrendingUp size={16} className="text-green-600" />,
      color: 'text-green-700', bg: 'bg-green-50',
      href: '/portal/sales/orders',
    },
    {
      label: 'Outstanding receivables',
      value: fmt(totalOutstanding),
      sub: `${fmtPct(100 - recoveryRate)} remaining`,
      icon: <Clock size={16} className={totalOutstanding > 0 ? 'text-amber-600' : 'text-green-600'} />,
      color: totalOutstanding > 0 ? 'text-amber-700' : 'text-green-700',
      bg: totalOutstanding > 0 ? 'bg-amber-50' : 'bg-green-50',
      href: '/portal/reports/customer-debt',
    },
    {
      label: 'Active containers',
      value: activeContainers.toString(),
      sub: `${completedContainers} completed`,
      icon: <Package size={16} className="text-blue-600" />,
      color: 'text-blue-700', bg: 'bg-blue-50',
      href: '/portal/purchase/containers',
    },
    {
      label: 'Pending tasks',
      value: pendingTasks.toString(),
      sub: `${approvalQueue} urgent or high`,
      icon: <AlertCircle size={16} className={pendingTasks > 0 ? 'text-red-500' : 'text-green-600'} />,
      color: pendingTasks > 0 ? 'text-red-600' : 'text-green-700',
      bg: pendingTasks > 0 ? 'bg-red-50' : 'bg-green-50',
      href: '/portal/tasks',
    },
  ]

  const kpiRow2 = [
    {
      label: 'Recovery rate',
      value: fmtPct(recoveryRate),
      sub: `${fmt(totalRecovered)} collected`,
      icon: <CheckCircle2 size={16} className={recoveryRate >= 80 ? 'text-green-600' : 'text-amber-600'} />,
      color: recoveryRate >= 80 ? 'text-green-700' : 'text-amber-700',
      bg: recoveryRate >= 80 ? 'bg-green-50' : 'bg-amber-50',
      href: '/portal/recoveries',
      show: true,
    },
    {
      label: 'Gross margin',
      value: fmtPct(grossMargin),
      sub: `${fmt(totalRevenue - totalCost)} gross profit`,
      icon: <BarChart3 size={16} className={grossMargin >= 20 ? 'text-green-600' : 'text-amber-600'} />,
      color: grossMargin >= 20 ? 'text-green-700' : 'text-amber-700',
      bg: grossMargin >= 20 ? 'bg-green-50' : 'bg-amber-50',
      href: '/portal/reports/container-profit',
      show: canViewCosts,
    },
    {
      label: 'Trips this period',
      value: tripsCount.toString(),
      sub: `${activeContainers} containers active`,
      icon: <Package size={16} className="text-brand-600" />,
      color: 'text-brand-700', bg: 'bg-brand-50',
      href: '/portal/purchase/trips',
      show: true,
    },
    {
      label: 'Inventory value',
      value: fmt(inventoryValue),
      sub: `${activeContainers} containers`,
      icon: <Package size={16} className="text-blue-600" />,
      color: 'text-blue-700', bg: 'bg-blue-50',
      href: '/portal/inventory',
      show: canViewCosts,
    },
  ].filter(k => k.show)

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Header row — greeting + date range + quick actions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{greeting}, {userName} 👋</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Date range */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {RANGE_OPTIONS.map(r => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                    ${range === r.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={load}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Quick actions strip */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon
            return (
              <button key={action.label}
                onClick={() => router.push(action.href)}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-white shadow-sm text-xs font-medium transition-all hover:shadow-md hover:-translate-y-0.5 ${action.color}`}>
                <Icon size={16} />
                <span className="leading-tight text-center">{action.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiRow1.map(kpi => (
          <button key={kpi.label}
            onClick={() => router.push(kpi.href)}
            className={`${kpi.bg} rounded-xl border border-white shadow-sm p-4 text-left hover:shadow-md transition-all group`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
                {kpi.icon}
              </div>
              <ChevronRight size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
            </div>
            <p className={`text-xl font-bold truncate ${kpi.color}`}>
              {loading ? '—' : kpi.value}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{loading ? '...' : kpi.sub}</p>
          </button>
        ))}
      </div>

      {/* KPI Row 2 — conditional on permissions */}
      {kpiRow2.length > 0 && (
        <div className={`grid grid-cols-2 gap-3 ${kpiRow2.length === 4 ? 'md:grid-cols-4' : kpiRow2.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {kpiRow2.map(kpi => (
            <button key={kpi.label}
              onClick={() => router.push(kpi.href)}
              className={`${kpi.bg} rounded-xl border border-white shadow-sm p-4 text-left hover:shadow-md transition-all group`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
                  {kpi.icon}
                </div>
                <ChevronRight size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
              </div>
              <p className={`text-xl font-bold truncate ${kpi.color}`}>
                {loading ? '—' : kpi.value}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
              <p className="text-xs text-gray-400 mt-1 truncate">{loading ? '...' : kpi.sub}</p>
            </button>
          ))}
        </div>
      )}

      {/* Recovery progress bar */}
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
            <div className={`h-full rounded-full transition-all duration-700 ${recoveryRate >= 80 ? 'bg-green-500' : recoveryRate >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(recoveryRate, 100)}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{fmtPct(recoveryRate)} of total revenue collected</p>
            {recoveryRate >= 90 && <span className="text-xs font-medium text-green-600">Excellent</span>}
            {recoveryRate >= 70 && recoveryRate < 90 && <span className="text-xs font-medium text-brand-600">On track</span>}
            {recoveryRate < 70 && recoveryRate > 0 && <span className="text-xs font-medium text-amber-600">Needs attention</span>}
          </div>
        </div>
      </div>

      {/* Three column activity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Top debtors */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Top debtors</h3>
            <button onClick={() => router.push('/portal/reports/customer-debt')}
              className="text-xs text-brand-600 hover:underline">All →</button>
          </div>
          <div className="p-4 space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                </div>
              ))
            ) : topDebtors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 gap-2">
                <CheckCircle2 size={20} className="text-green-300" />
                <p className="text-xs text-gray-400">No outstanding debts</p>
              </div>
            ) : topDebtors.map(d => {
              const pct = d.billed > 0 ? (d.collected / d.billed) * 100 : 0
              return (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-800 truncate max-w-[130px]">{d.name}</span>
                    <span className={`font-semibold ${d.outstanding > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {fmt(d.outstanding)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtPct(pct)} collected</p>
                </div>
              )
            })}
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
                  <div className="h-3 bg-gray-100 rounded w-16" />
                </div>
              ))
            ) : pendingTaskList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle2 size={20} className="text-green-300" />
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
      </div>
    </div>
  )
}

