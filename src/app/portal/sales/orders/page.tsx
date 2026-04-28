'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Eye, Package, ChevronDown, ChevronUp,
  TrendingUp, Clock, CheckCircle2,
  Download, AlertTriangle, Shield, Loader2,
  LayoutGrid, List,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { usePermissions, can } from '@/lib/permissions/hooks'

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
  presale: { presale_id: string; sale_type: string; total_number_of_pallets: number | null } | null
  customer: { name: string; customer_id: string } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

interface ContainerGroup {
  container_id: string
  container_db_id: string
  tracking_number: string | null
  hide_type: string | null
  sale_type: string | null
  orders: SalesOrder[]
  total_revenue: number
  total_outstanding: number
  total_collected: number
  order_count: number
  is_fully_sold: boolean
  total_pallets: number
  pallets_sold: number
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
  const [viewMode, setViewMode] = useState<'grouped' | 'transactional'>('grouped')
  const [statusFilter, setStatusFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { permissions, isSuperAdmin } = usePermissions()
  const canApproveOrder = isSuperAdmin || can(permissions, isSuperAdmin, 'sales_orders.approve')
  const canSelfApprove  = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*') || can(permissions, isSuperAdmin, 'sales_orders.approve')

  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowOrder, setWorkflowOrder] = useState<SalesOrder | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [selfApprove, setSelfApprove] = useState(false)
  const [submittingWorkflow, setSubmittingWorkflow] = useState(false)
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  function exportToCSV() {
    const headers = [
      'Order ID', 'Container', 'Tracking Number', 'Customer', 'Customer ID',
      'Sale Type', 'Sale Amount', 'Discount', 'Overages', 'Customer Payable',
      'Amount Paid', 'Outstanding Balance', 'Payment Status', 'Approval Status',
      'Date'
    ]

    const rows = groups.flatMap(group =>
      group.orders.map(o => [
        o.order_id,
        group.container_id,
        group.tracking_number ?? '',
        o.customer?.name ?? '',
        o.customer?.customer_id ?? '',
        o.sale_type?.replace('_', ' ') ?? '',
        Number(o.sale_amount).toFixed(2),
        Number(o.discount ?? 0).toFixed(2),
        Number(o.overages ?? 0).toFixed(2),
        Number(o.customer_payable).toFixed(2),
        Number(o.amount_paid).toFixed(2),
        Number(o.outstanding_balance).toFixed(2),
        o.payment_status,
        o.approval_status,
        new Date(o.created_at).toLocaleDateString('en-GB'),
      ])
    )

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href     = url
    link.download = `sales-orders-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

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
        presale:presales!sales_orders_presale_id_fkey(presale_id, sale_type, total_number_of_pallets),
        customer:customers!sales_orders_customer_id_fkey(name, customer_id),
        created_by_profile:profiles!sales_orders_created_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    const orders = data ?? []
    const orderIds = orders.map(o => o.id)
    let palletRows: { pallets_sold: number; order_id: string }[] = []
    if (orderIds.length) {
      const { data: pr } = await supabase
        .from('sales_order_pallets')
        .select('pallets_sold, order_id')
        .in('order_id', orderIds)
      palletRows = pr ?? []
    }

    const orderToContainerDb = new Map<string, string>()
    for (const o of orders) {
      const cdb = String((o.container as { id?: string } | null)?.id ?? o.container_id ?? '')
      orderToContainerDb.set(o.id, cdb)
    }
    const splitPalletsSoldByContainer = new Map<string, number>()
    for (const row of palletRows) {
      const cid = orderToContainerDb.get(row.order_id)
      if (cid) {
        splitPalletsSoldByContainer.set(cid, (splitPalletsSoldByContainer.get(cid) ?? 0) + Number(row.pallets_sold))
      }
    }

    // Fetch presale totals for each container to determine if fully sold
    const containerIdsForPresales = Array.from(new Set(orders.map(o => String((o.container as { id?: string } | null)?.id ?? o.container_id ?? '')).filter(Boolean)))
    let presaleTotals: Array<{ container_id: string; total_number_of_pallets: number | null; sale_type: string }> = []
    if (containerIdsForPresales.length) {
      const { data: pts } = await supabase
        .from('presales')
        .select('container_id, total_number_of_pallets, sale_type')
        .in('container_id', containerIdsForPresales)
      presaleTotals = pts ?? []
    }
    const presaleByContainer = new Map<string, { total_pallets: number; sale_type: string }>()
    for (const p of presaleTotals) {
      presaleByContainer.set(p.container_id, {
        total_pallets: Number(p.total_number_of_pallets ?? 0),
        sale_type: p.sale_type,
      })
    }

    const groupMap: Record<string, ContainerGroup> = {}

    for (const order of orders) {
      const cId  = (order.container as { container_id?: string } | null)?.container_id ?? 'unknown'
      const cDbId = String((order.container as { id?: string } | null)?.id ?? order.container_id ?? 'unknown')
      if (!groupMap[cId]) {
        const presaleInfo = presaleByContainer.get(String(cDbId))
        const totalPallets = presaleInfo?.total_pallets ?? 0
        const palletsSold  = splitPalletsSoldByContainer.get(String(cDbId)) ?? 0
        const saleTypeResolved = presaleInfo?.sale_type ?? (order.presale as { sale_type?: string } | null)?.sale_type ?? null

        const isFullySold = saleTypeResolved === 'box_sale'
          ? true  // Box sale: one order per container = fully sold
          : totalPallets > 0 && palletsSold >= totalPallets

        groupMap[cId] = {
          container_id:    cId,
          container_db_id: String(cDbId),
          tracking_number: (order.container as { tracking_number?: string | null } | null)?.tracking_number ?? null,
          hide_type:       (order.container as { hide_type?: string | null } | null)?.hide_type ?? null,
          sale_type:       saleTypeResolved,
          orders:          [],
          total_revenue:    0,
          total_outstanding: 0,
          total_collected:  0,
          order_count:      0,
          is_fully_sold:   isFullySold,
          total_pallets:   totalPallets,
          pallets_sold:    palletsSold,
        }
      }
      groupMap[cId].orders.push(order as unknown as SalesOrder)
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

  useEffect(() => {
    void load()
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
      const emps = await getAdminProfiles()
      setEmployees(emps)
    }
    void init()
  }, [load])

  async function submitWorkflow() {
    if (!workflowOrder) return
    if (!selfApprove && !assignee) return
    setSubmittingWorkflow(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (selfApprove && canSelfApprove) {
      await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `Approval request: ${workflowOrder.order_id} (self-approved)`,
        description: workflowNote || `Approval request for sales order ${workflowOrder.order_id}`,
        module: 'sales_orders',
        record_id: workflowOrder.id,
        record_ref: workflowOrder.order_id,
        requested_by: user?.id,
        assigned_to: user?.id,
        status: 'approved',
        priority: 'normal',
        review_note: 'Self-approved by ' + (user?.email ?? 'admin'),
      })

      await supabase.from('sales_orders').update({
        approval_status: 'approved',
        needs_approval: false,
        last_approved_at: new Date().toISOString(),
        last_approved_by: user?.id,
      }).eq('id', workflowOrder.id)

      setSubmittingWorkflow(false)
      setWorkflowOpen(false)
      setWorkflowOrder(null)
      setWorkflowNote('')
      setAssignee('')
      setSelfApprove(false)
      load()
      return
    }

    const { data: task } = await supabase.from('tasks').insert({
      type: 'approval_request',
      title: `Approval request: ${workflowOrder.order_id}`,
      description: workflowNote || `Approval request for sales order ${workflowOrder.order_id}`,
      module: 'sales_orders',
      record_id: workflowOrder.id,
      record_ref: workflowOrder.order_id,
      requested_by: user?.id,
      assigned_to: assignee,
      priority: 'normal',
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: assignee,
      type: 'task_approval_request',
      title: 'New task: Approval request',
      message: `${workflowOrder.order_id} — ${workflowOrder.customer?.name ?? ''}`,
      task_id: task?.id,
      record_id: workflowOrder.id,
      record_ref: workflowOrder.order_id,
      module: 'sales_orders',
    })

    setSubmittingWorkflow(false)
    setWorkflowOpen(false)
    setWorkflowOrder(null)
    setWorkflowNote('')
    setAssignee('')
    setSelfApprove(false)
    load()
  }

  function toggleGroup(containerId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(containerId)) next.delete(containerId)
      else next.add(containerId)
      return next
    })
  }

  const matchesOrderFilters = (o: SalesOrder, container: { container_id: string; tracking_number: string | null }) => {
    if (search) {
      const s = search.toLowerCase()
      const matchSearch = container.container_id.toLowerCase().includes(s) ||
        (container.tracking_number ?? '').toLowerCase().includes(s) ||
        o.order_id.toLowerCase().includes(s) ||
        (o.customer?.name ?? '').toLowerCase().includes(s) ||
        (o.customer?.customer_id ?? '').toLowerCase().includes(s)
      if (!matchSearch) return false
    }
    if (statusFilter && o.approval_status !== statusFilter) return false
    if (paymentFilter && o.payment_status !== paymentFilter) return false
    if (dateFrom && new Date(o.created_at) < new Date(dateFrom)) return false
    if (dateTo && new Date(o.created_at) > new Date(dateTo + 'T23:59:59')) return false
    return true
  }

  const filteredGroups = groups
    .map(g => ({
      ...g,
      orders: g.orders.filter(o => matchesOrderFilters(o, { container_id: g.container_id, tracking_number: g.tracking_number })),
    }))
    .filter(g => g.orders.length > 0)

  // Flat list for transactional view
  const flatOrders = groups.flatMap(g =>
    g.orders
      .filter(o => matchesOrderFilters(o, { container_id: g.container_id, tracking_number: g.tracking_number }))
      .map(o => ({ ...o, _container: { container_id: g.container_id, tracking_number: g.tracking_number } }))
  )

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total sales orders', value: totalOrders.toString(), color: 'text-blue-700',   bg: 'bg-blue-50',   icon: <Package size={15} className="text-blue-600" /> },
          { label: 'Total revenue',      value: fmt(totalRevenue),       color: 'text-green-700',  bg: 'bg-green-50',  icon: <TrendingUp size={15} className="text-green-600" /> },
          { label: 'Total collected',    value: fmt(totalCollected),     color: 'text-brand-700',  bg: 'bg-brand-50',  icon: <CheckCircle2 size={15} className="text-brand-600" /> },
          { label: 'Total outstanding',  value: fmt(totalOutstanding),   color: 'text-amber-700',  bg: 'bg-amber-50',  icon: <Clock size={15} className="text-amber-600" /> },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + view + Export */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search container, tracking, customer..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
            <option value="">All approvals</option>
            <option value="approved">Approved</option>
            <option value="pending_approval">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="modified_pending">Modified pending</option>
          </select>
          <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
            <option value="">All payments</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="outstanding">Outstanding</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg" />
          <button onClick={exportToCSV} disabled={groups.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
            style={{ background: '#55249E' }}>
            <Download size={14} /> Export CSV
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">View:</span>
          <button type="button" onClick={() => setViewMode('grouped')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${viewMode === 'grouped' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <LayoutGrid size={12} /> By container
          </button>
          <button type="button" onClick={() => setViewMode('transactional')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${viewMode === 'transactional' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <List size={12} /> Transactional
          </button>
        </div>
      </div>

      {/* Grouped containers */}
      {viewMode === 'grouped' && (
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
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {group.tracking_number ?? group.container_id}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        {group.tracking_number ? group.container_id : ''}
                      </span>
                      {group.hide_type && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">
                          {group.hide_type}
                        </span>
                      )}
                      {group.sale_type && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize
                          ${group.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                          {group.sale_type.replace('_', ' ')}
                        </span>
                      )}
                      <span className="text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">
                        {group.order_count} order{group.order_count !== 1 ? 's' : ''}
                      </span>
                      {group.is_fully_sold && (
                        <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1">
                          <CheckCircle2 size={10} /> Sold out
                        </span>
                      )}
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
                        router.push(`/portal/sales/orders/container/${group.container_db_id}`)
                      }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
                      title="View all orders for this container">
                      <Eye size={15} />
                    </button>
                    {group.is_fully_sold ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed" title="This container is fully sold">
                        <CheckCircle2 size={12} /> Sold out
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          router.push(`/portal/sales/orders/create?container_id=${group.container_db_id}`)
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                        <Plus size={12} /> Add order
                      </button>
                    )}
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
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Approval</th>
                        <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-400">Date</th>
                        <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-400 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.orders.map(order => {
                        const paymentCfg = PAYMENT_STATUS_CONFIG[order.payment_status] ?? PAYMENT_STATUS_CONFIG.outstanding
                        const showApprove = canApproveOrder && order.needs_approval && order.approval_status !== 'approved'
                        return (
                          <tr key={order.id}
                            className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                            onClick={() => router.push(`/portal/sales/orders/${order.id}`)}>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">
                                  {order.order_id}
                                </span>
                                {order.needs_approval && (
                                  <span title="Modified - needs approval">
                                    <AlertTriangle size={12} className="text-amber-500" />
                                  </span>
                                )}
                              </div>
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
                            <td className="px-5 py-3 whitespace-nowrap">
                              {order.needs_approval || order.approval_status === 'pending' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  <AlertTriangle size={11} /> Pending
                                </span>
                              ) : order.approval_status === 'approved' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                  <CheckCircle2 size={11} /> Approved
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                              {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-5 py-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => router.push(`/portal/sales/orders/${order.id}`)}
                                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600 transition-colors"
                                  title="View"
                                >
                                  <Eye size={14} />
                                </button>
                                {showApprove && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setWorkflowOrder(order)
                                      setWorkflowOpen(true)
                                    }}
                                    className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                                    title="Approve"
                                  >
                                    <Shield size={14} />
                                  </button>
                                )}
                              </div>
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
      )}

      {/* Transactional view */}
      {viewMode === 'transactional' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : flatOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Package size={28} className="text-gray-200" />
              <p className="text-sm text-gray-400">No sales orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Order ID','Container','Customer','Sale Type','Payable','Paid','Outstanding','Payment','Approval','Date',''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flatOrders.map((o: any) => {
                    const out = Number(o.outstanding_balance ?? 0)
                    return (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                        onClick={() => router.push(`/portal/sales/orders/${o.id}`)}>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{o.order_id}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{o._container.container_id}</span>
                          {o._container.tracking_number && <span className="text-xs text-gray-500 ml-2">{o._container.tracking_number}</span>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700">
                          {o.customer?.name ?? '—'}
                          <span className="text-gray-400 ml-1">{o.customer?.customer_id ?? ''}</span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 capitalize whitespace-nowrap">{o.sale_type?.replace('_', ' ')}</td>
                        <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{fmt(Number(o.customer_payable))}</td>
                        <td className="px-3 py-3 font-medium text-green-700 whitespace-nowrap">{fmt(Number(o.amount_paid ?? 0))}</td>
                        <td className={`px-3 py-3 font-bold whitespace-nowrap ${out > 0 ? 'text-red-600' : 'text-gray-400'}`}>{out > 0 ? fmt(out) : '—'}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            o.payment_status === 'paid' ? 'bg-green-50 text-green-700' :
                            o.payment_status === 'partial' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-600'
                          }`}>{o.payment_status?.replace('_', ' ')}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            o.approval_status === 'approved' ? 'bg-blue-50 text-blue-700' :
                            o.approval_status === 'pending_approval' ? 'bg-amber-50 text-amber-700' :
                            o.approval_status === 'rejected' ? 'bg-red-50 text-red-600' :
                            'bg-purple-50 text-purple-700'
                          }`}>{o.approval_status?.replace('_', ' ')}</span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => router.push(`/portal/sales/orders/${o.id}`)}
                            className="text-gray-400 hover:text-brand-600"><Eye size={14} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={workflowOpen}
        onClose={() => { setWorkflowOpen(false); setWorkflowOrder(null); setWorkflowNote(''); setAssignee(''); setSelfApprove(false) }}
        title="Request approval"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-green-700 font-medium">Once approved, this order will be marked as approved and the needs approval flag will be cleared.</p>
          </div>
          {canSelfApprove && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={selfApprove} onChange={e => setSelfApprove(e.target.checked)} className="mt-0.5" />
                <div>
                  <span className="text-sm font-medium text-amber-900">Self-approve (skip approval)</span>
                  <p className="text-xs text-amber-700 mt-0.5">As an admin, you can execute this action immediately without sending an approval request.</p>
                </div>
              </label>
            </div>
          )}
          {!selfApprove && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to <span className="text-red-400">*</span></label>
              <select required value={assignee} onChange={e => setAssignee(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Select user...</option>
                {employees.filter(e => e.id !== currentUserId).map(e => (
                  <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <textarea rows={2} value={workflowNote} onChange={e => setWorkflowNote(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setWorkflowOpen(false); setWorkflowOrder(null); setWorkflowNote(''); setAssignee(''); setSelfApprove(false) }}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="button" onClick={() => void submitWorkflow()} disabled={submittingWorkflow || (!selfApprove && !assignee)}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2 bg-green-600 text-white hover:bg-green-700">
              {submittingWorkflow
                ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                : selfApprove
                  ? 'Approve now'
                  : 'Submit request'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
