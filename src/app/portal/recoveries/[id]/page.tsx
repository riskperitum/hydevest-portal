'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Check, X, Pencil,
  Trash2, Eye, Activity, ChevronDown,
  AlertTriangle, TrendingUp, Wallet,
  CreditCard, Package, Calendar, User
} from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'

interface SalesOrder {
  id: string
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
  container: { tracking_number: string | null; container_id: string; container_number: string | null } | null
  presale: { presale_id: string; price_per_piece: number | null; price_per_kilo: number | null } | null
}

interface Recovery {
  id: string
  recovery_id: string
  payment_type: string
  amount_paid: number
  payment_date: string
  payment_method: string
  comments: string | null
  file_url: string | null
  file_name: string | null
  approval_status: string
  needs_approval: boolean
  created_at: string
  created_by: string | null
  created_by_profile: { full_name: string | null; email: string } | null
}

interface PalletLine {
  id: string
  pallets_sold: number
  pieces_per_pallet: number
  total_pieces: number
  selling_price_per_piece: number
  line_total: number
}

interface ActivityLog {
  id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  performer: { full_name: string | null; email: string } | null
}

const PAYMENT_STATUS = {
  paid:        { label: 'Fully paid',   color: 'bg-green-50 text-green-700 border-green-200' },
  partial:     { label: 'Partial',      color: 'bg-amber-50 text-amber-700 border-amber-200' },
  outstanding: { label: 'Outstanding',  color: 'bg-red-50 text-red-600 border-red-200' },
}

export default function RecoveryDetailPage() {
  const params = useParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [recoveries, setRecoveries] = useState<Recovery[]>([])
  const [palletLines, setPalletLines] = useState<PalletLine[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'recoveries' | 'activity'>('recoveries')
  const [orderInfoOpen, setOrderInfoOpen] = useState(true)

  const [editRecovery, setEditRecovery] = useState<Recovery | null>(null)
  const [editForm, setEditForm] = useState({ amount_paid: '', payment_date: '', payment_method: 'transfer', comments: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowRecovery, setWorkflowRecovery] = useState<Recovery | null>(null)
  const [workflowType, setWorkflowType] = useState<'delete' | 'approval' | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [submittingWorkflow, setSubmittingWorkflow] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: o }, { data: r }, { data: pl }, { data: al }] = await Promise.all([
      supabase.from('sales_orders')
        .select(`id, order_id, sale_type, customer_payable, initial_payment,
          amount_paid, outstanding_balance, payment_status, payment_method, created_at,
          customer:customers(id, name, customer_id, phone),
          container:containers(tracking_number, container_id, container_number),
          presale:presales(presale_id, price_per_piece, price_per_kilo)`)
        .eq('id', orderId).single(),
      supabase.from('recoveries')
        .select('*, created_by_profile:profiles!recoveries_created_by_fkey(full_name, email)')
        .eq('sales_order_id', orderId)
        .order('created_at', { ascending: true }),
      supabase.from('sales_order_pallets').select('*').eq('order_id', orderId),
      supabase.from('sales_order_activity_log')
        .select('*, performer:profiles!sales_order_activity_log_performed_by_fkey(full_name, email)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
    ])

    const one = <T,>(v: T | T[] | null | undefined): T | null => {
      if (v == null) return null
      return Array.isArray(v) ? (v[0] ?? null) : v
    }

    if (o) {
      setOrder({
        ...o,
        customer: one(o.customer),
        container: one(o.container),
        presale: one(o.presale),
      } as SalesOrder)
    } else {
      setOrder(null)
    }

    setRecoveries(
      (r ?? []).map(row => ({
        ...row,
        created_by_profile: one(
          (row as { created_by_profile?: unknown }).created_by_profile,
        ) as Recovery['created_by_profile'],
      })) as Recovery[],
    )
    setPalletLines((pl ?? []) as PalletLine[])
    setActivityLogs(
      (al ?? []).map(row => ({
        ...row,
        performer: one((row as { performer?: unknown }).performer) as ActivityLog['performer'],
      })) as ActivityLog[],
    )
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
    supabase.from('profiles').select('id, full_name, email').eq('is_active', true)
      .then(({ data }) => setEmployees(data ?? []))
  }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  async function logActivity(action: string, fieldName?: string, oldValue?: string, newValue?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('sales_order_activity_log').insert({
      order_id: orderId, action,
      field_name: fieldName ?? null, old_value: oldValue ?? null, new_value: newValue ?? null,
      performed_by: user?.id,
    })
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRecovery) return
    setSavingEdit(true)
    const supabase = createClient()
    const isCreator = editRecovery.created_by === currentUserId
    const requiresApproval = isCreator && editRecovery.approval_status === 'approved'

    await supabase.from('recoveries').update({
      amount_paid: parseFloat(editForm.amount_paid),
      payment_date: editForm.payment_date,
      payment_method: editForm.payment_method,
      comments: editForm.comments || null,
      ...(requiresApproval ? { needs_approval: true, approval_status: 'pending' } : {}),
    }).eq('id', editRecovery.id)

    await logActivity(
      requiresApproval ? 'Recovery edited — awaiting approval' : 'Recovery updated',
      'amount_paid', fmt(editRecovery.amount_paid), fmt(parseFloat(editForm.amount_paid))
    )

    // Recalculate order totals
    const { data: allRecoveries } = await supabase
      .from('recoveries').select('amount_paid').eq('sales_order_id', orderId)
    const newTotal = (allRecoveries ?? []).reduce((s, r) => s + Number(r.amount_paid), 0)
    const newOutstanding = Math.max(Number(order?.customer_payable ?? 0) - newTotal, 0)
    await supabase.from('sales_orders').update({
      amount_paid: newTotal,
      outstanding_balance: newOutstanding,
      payment_status: newOutstanding <= 0 ? 'paid' : newTotal > 0 ? 'partial' : 'outstanding',
    }).eq('id', orderId)

    if (requiresApproval && assignee) {
      const { data: task } = await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `Approval request: ${editRecovery.recovery_id}`,
        description: `Recovery record edited and requires approval`,
        module: 'recoveries',
        record_id: orderId,
        record_ref: editRecovery.recovery_id,
        requested_by: currentUserId,
        assigned_to: assignee,
        priority: 'normal',
      }).select().single()
      await supabase.from('notifications').insert({
        user_id: assignee,
        type: 'task_approval_request',
        title: 'Approval request: Recovery edit',
        message: `${editRecovery.recovery_id} — ${order?.customer?.name ?? ''}`,
        task_id: task?.id,
        record_id: orderId,
        module: 'recoveries',
      })
    }

    setSavingEdit(false)
    setEditRecovery(null)
    setAssignee('')
    load()
  }

  async function submitWorkflow() {
    if (!assignee || !workflowType || !workflowRecovery || !order) return
    setSubmittingWorkflow(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const typeKeys = { delete: 'delete_approval', approval: 'approval_request' }
    const typeLabels = { delete: 'Delete approval', approval: 'Approval request' }
    const { data: task } = await supabase.from('tasks').insert({
      type: typeKeys[workflowType],
      title: `${typeLabels[workflowType]}: ${workflowRecovery.recovery_id}`,
      description: workflowNote || `${typeLabels[workflowType]} for recovery ${workflowRecovery.recovery_id}`,
      module: 'recoveries',
      record_id: orderId,
      record_ref: workflowRecovery.recovery_id,
      requested_by: user?.id,
      assigned_to: assignee,
      priority: workflowType === 'delete' ? 'high' : 'normal',
    }).select().single()
    await supabase.from('notifications').insert({
      user_id: assignee,
      type: `task_${typeKeys[workflowType]}`,
      title: `New task: ${typeLabels[workflowType]}`,
      message: `${workflowRecovery.recovery_id} — ${order.customer?.name ?? ''}`,
      task_id: task?.id,
      record_id: orderId,
      module: 'recoveries',
    })
    await logActivity(`${typeLabels[workflowType]} requested`, 'workflow', '', workflowRecovery.recovery_id)
    setSubmittingWorkflow(false)
    setWorkflowOpen(false)
    setWorkflowType(null)
    setWorkflowNote('')
    setAssignee('')
    load()
  }

  const totalRecovered = recoveries.reduce((s, r) => s + Number(r.amount_paid), 0)
  const recoveryPayments = recoveries.filter(r => r.payment_type === 'recovery')
  const totalRecoveryPayments = recoveryPayments.reduce((s, r) => s + Number(r.amount_paid), 0)
  const progressPct = order ? Math.min((totalRecovered / Number(order.customer_payable)) * 100, 100) : 0
  const statusCfg = order ? (PAYMENT_STATUS[order.payment_status as keyof typeof PAYMENT_STATUS] ?? PAYMENT_STATUS.outstanding) : PAYMENT_STATUS.outstanding

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )
  if (!order) return <div className="text-center py-16 text-gray-400">Order not found.</div>

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/recoveries"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{order.order_id}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${order.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                {order.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mt-1">{order.customer?.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
              <span>{order.customer?.customer_id}</span>
              {order.customer?.phone && <><span>·</span><span>{order.customer.phone}</span></>}
              <span>·</span>
              <span>Sale date: {new Date(order.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <Link
          href={`/portal/recoveries/create?orderId=${order.id}&customerId=${order.customer?.id}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors">
          + Record recovery
        </Link>
      </div>

      {/* Financial summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Total payable',
            value: fmt(order.customer_payable),
            icon: <Wallet size={16} className="text-brand-600" />,
            bg: 'bg-brand-50',
            text: 'text-brand-700',
          },
          {
            label: 'Initial payment',
            value: fmt(order.initial_payment),
            icon: <CreditCard size={16} className="text-blue-600" />,
            bg: 'bg-blue-50',
            text: 'text-blue-700',
          },
          {
            label: 'Total recovered',
            value: fmt(totalRecovered),
            icon: <TrendingUp size={16} className="text-green-600" />,
            bg: 'bg-green-50',
            text: 'text-green-700',
          },
          {
            label: 'Outstanding',
            value: fmt(order.outstanding_balance),
            icon: <AlertTriangle size={16} className={Number(order.outstanding_balance) > 0 ? 'text-red-500' : 'text-green-500'} />,
            bg: Number(order.outstanding_balance) > 0 ? 'bg-red-50' : 'bg-green-50',
            text: Number(order.outstanding_balance) > 0 ? 'text-red-600' : 'text-green-700',
          },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
            <div className="flex items-center gap-2 mb-2">
              {m.icon}
              <p className="text-xs text-gray-500 font-medium">{m.label}</p>
            </div>
            <p className={`text-lg font-bold ${m.text} truncate`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">Recovery progress</p>
          <p className="text-sm font-bold text-brand-600">{progressPct.toFixed(1)}%</p>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : progressPct >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
          <span>{fmt(totalRecovered)} recovered</span>
          <span>{fmt(Number(order.outstanding_balance))} remaining</span>
        </div>
      </div>

      {/* Sale info — collapsible */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button onClick={() => setOrderInfoOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Sale information</h2>
          </div>
          <ChevronDown size={15} className={`text-gray-400 transition-transform ${orderInfoOpen ? 'rotate-180' : ''}`} />
        </button>
        {orderInfoOpen && (
          <div className="border-t border-gray-100">
            {/* Key info grid */}
            <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Package size={13} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Tracking No.</p>
                  <p className="text-sm font-semibold text-gray-900">{order.container?.tracking_number ?? '—'}</p>
                  <p className="text-xs text-gray-400">{order.container?.container_id}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={13} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Customer</p>
                  <p className="text-sm font-semibold text-gray-900">{order.customer?.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{order.customer?.customer_id}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Calendar size={13} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Sale date</p>
                  <p className="text-sm font-semibold text-gray-900">{new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p className="text-xs text-gray-400 capitalize">{order.payment_method}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <CreditCard size={13} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Presale</p>
                  <p className="text-sm font-semibold text-gray-900">{order.presale?.presale_id ?? '—'}</p>
                  <p className="text-xs text-gray-400">{order.presale?.price_per_piece ? `₦${Number(order.presale.price_per_piece).toLocaleString()}/pc` : ''}</p>
                </div>
              </div>
            </div>

            {/* Pallet lines for split sale */}
            {order.sale_type === 'split_sale' && palletLines.length > 0 && (
              <div className="px-5 pb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pallet breakdown</p>
                <div className="rounded-xl overflow-hidden border border-gray-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['Pallet type', 'Pallets purchased', 'Total pieces', 'Sell price/pc', 'Line total'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {palletLines.map(l => (
                        <tr key={l.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2.5 font-medium text-gray-900">{l.pieces_per_pallet.toLocaleString()} pcs/pallet</td>
                          <td className="px-3 py-2.5 text-gray-600">{l.pallets_sold}</td>
                          <td className="px-3 py-2.5 text-gray-600">{l.total_pieces.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-gray-600">{fmt(l.selling_price_per_piece)}</td>
                          <td className="px-3 py-2.5 font-semibold text-brand-700">{fmt(l.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'recoveries', label: 'Recoveries', count: recoveries.length },
            { key: 'activity', label: 'Activity log', count: activityLogs.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as 'recoveries' | 'activity')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* RECOVERIES TAB */}
        {activeTab === 'recoveries' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Recovery ID', 'Type', 'Amount', 'Date', 'Method', 'Comments', 'Receipt', 'Status', 'Recorded by', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recoveries.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">No recovery records yet.</td></tr>
                ) : recoveries.map((rec, idx) => (
                  <tr key={rec.id}
                    className={`border-b border-gray-50 hover:bg-gray-50/50 group
                      ${rec.payment_type === 'initial' ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded font-medium
                        ${rec.payment_type === 'initial' ? 'bg-blue-100 text-blue-700' : 'bg-brand-50 text-brand-700'}`}>
                        {rec.recovery_id}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full
                        ${rec.payment_type === 'initial'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-50 text-green-700'}`}>
                        {rec.payment_type === 'initial' ? 'Initial payment' : `Recovery #${idx}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap font-bold text-gray-900">{fmt(rec.amount_paid)}</td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{new Date(rec.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-3 py-3 text-gray-500 capitalize whitespace-nowrap">{rec.payment_method === 'transfer' ? 'Bank transfer' : 'Cash'}</td>
                    <td className="px-3 py-3 text-gray-500 max-w-[140px] truncate">{rec.comments ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {rec.file_url ? (
                        <a href={rec.file_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline font-medium">
                          <Eye size={12} /> View
                        </a>
                      ) : (
                        rec.payment_type !== 'initial' ? (
                          <label className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 cursor-pointer transition-colors">
                            <span>Upload</span>
                            <input type="file" className="hidden" onChange={async e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const supabase = createClient()
                              const ext = file.name.split('.').pop()
                              const path = `recoveries/${rec.id}/${Date.now()}.${ext}`
                              const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
                              if (!error) {
                                const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
                                await supabase.from('recoveries').update({ file_url: publicUrl, file_name: file.name, file_type: file.type }).eq('id', rec.id)
                                load()
                              }
                            }} />
                          </label>
                        ) : <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {rec.payment_type === 'initial' ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : rec.needs_approval ? (
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-medium">Pending</span>
                      ) : (
                        <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200 font-medium">Approved</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {rec.created_by_profile?.full_name ?? rec.created_by_profile?.email ?? '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {rec.payment_type !== 'initial' && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => {
                            setEditRecovery(rec)
                            setEditForm({ amount_paid: rec.amount_paid.toString(), payment_date: rec.payment_date, payment_method: rec.payment_method, comments: rec.comments ?? '' })
                          }} className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => { setWorkflowRecovery(rec); setWorkflowType('delete'); setWorkflowOpen(true) }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {recoveries.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-brand-100">
                    <td colSpan={2} className="px-3 py-3 text-xs font-bold text-gray-500 uppercase">Total recovered</td>
                    <td className="px-3 py-3 text-sm font-bold text-green-600 whitespace-nowrap">{fmt(totalRecovered)}</td>
                    <td colSpan={7} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div className="p-5">
            {activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Activity size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No activity yet.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activityLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-brand-600 text-xs font-semibold">
                        {(log.performer?.full_name ?? log.performer?.email ?? 'S')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium text-gray-900">{log.performer?.full_name ?? log.performer?.email ?? 'System'}</span>
                        {' '}<span className="text-gray-500">{log.action}</span>
                        {log.field_name && <span className="text-xs text-gray-400 ml-1">· {log.field_name}</span>}
                      </p>
                      {(log.old_value || log.new_value) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {log.old_value && <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded line-through">{log.old_value}</span>}
                          {log.old_value && log.new_value && <span className="text-xs text-gray-400">→</span>}
                          {log.new_value && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{log.new_value}</span>}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={!!editRecovery} onClose={() => { setEditRecovery(null); setAssignee('') }} title="Edit recovery" size="md">
        {editRecovery && (
          <form onSubmit={handleEdit} className="space-y-4">
            {editRecovery.created_by === currentUserId && editRecovery.approval_status === 'approved' && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-xs text-amber-700 font-medium flex items-center gap-2">
                  <AlertTriangle size={13} />
                  You created this record. Editing requires approval from another user.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount paid (₦) <span className="text-red-400">*</span></label>
                <input required type="number" step="0.01" value={editForm.amount_paid}
                  onChange={e => setEditForm(f => ({ ...f, amount_paid: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment date</label>
                <input type="date" value={editForm.payment_date}
                  onChange={e => setEditForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment method</label>
                <select value={editForm.payment_method} onChange={e => setEditForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                <input value={editForm.comments} onChange={e => setEditForm(f => ({ ...f, comments: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Optional notes" />
              </div>
            </div>
            {editRecovery.created_by === currentUserId && editRecovery.approval_status === 'approved' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign approval to <span className="text-red-400">*</span></label>
                <select required value={assignee} onChange={e => setAssignee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="">Select user...</option>
                  {employees.filter(e => e.id !== currentUserId).map(e => (
                    <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setEditRecovery(null); setAssignee('') }}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit"
                disabled={savingEdit || (editRecovery.created_by === currentUserId && editRecovery.approval_status === 'approved' && !assignee)}
                className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingEdit ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Workflow modal */}
      <Modal open={workflowOpen} onClose={() => { setWorkflowOpen(false); setWorkflowType(null) }}
        title={workflowType === 'delete' ? 'Request deletion' : 'Request approval'} size="md">
        <div className="space-y-4">
          {workflowType === 'delete' && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700 font-medium">The recovery will only be deleted after approval. Sale order totals will be recalculated automatically.</p>
            </div>
          )}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <textarea rows={2} value={workflowNote} onChange={e => setWorkflowNote(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setWorkflowOpen(false); setWorkflowType(null) }}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={submitWorkflow} disabled={submittingWorkflow || !assignee}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2
                ${workflowType === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
              {submittingWorkflow ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit request'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
