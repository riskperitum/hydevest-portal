'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Check, X, Pencil,
  Trash2, CheckCircle2, Eye, Activity,
  ChevronDown, Upload, AlertTriangle
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
  created_at: string
  customer: { id: string; name: string; customer_id: string; phone: string | null } | null
  container: { tracking_number: string | null; container_id: string } | null
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

export default function RecoveryDetailPage() {
  const params = useParams()
  const router = useRouter()
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

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: o }, { data: r }, { data: pl }, { data: al }] = await Promise.all([
      supabase.from('sales_orders')
        .select(`id, order_id, sale_type, customer_payable, initial_payment,
          amount_paid, outstanding_balance, payment_status, created_at,
          customer:customers(id, name, customer_id, phone),
          container:containers(tracking_number, container_id)`)
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

    if (isCreator && editRecovery.approval_status === 'approved') {
      // Requires approval workflow — flag it
      await supabase.from('recoveries').update({
        amount_paid: parseFloat(editForm.amount_paid),
        payment_date: editForm.payment_date,
        payment_method: editForm.payment_method,
        comments: editForm.comments || null,
        needs_approval: true,
        approval_status: 'pending',
      }).eq('id', editRecovery.id)
      await logActivity('Recovery edited — needs approval', 'amount_paid', fmt(editRecovery.amount_paid), fmt(parseFloat(editForm.amount_paid)))
    } else {
      await supabase.from('recoveries').update({
        amount_paid: parseFloat(editForm.amount_paid),
        payment_date: editForm.payment_date,
        payment_method: editForm.payment_method,
        comments: editForm.comments || null,
      }).eq('id', editRecovery.id)
      await logActivity('Recovery updated', 'amount_paid', fmt(editRecovery.amount_paid), fmt(parseFloat(editForm.amount_paid)))
    }

    // Recalculate sales order totals
    const { data: allRecoveries } = await supabase
      .from('recoveries').select('amount_paid').eq('sales_order_id', orderId)
    const newTotal = (allRecoveries ?? []).reduce((s, r) => s + Number(r.amount_paid), 0)
    const newOutstanding = Math.max(Number(order?.customer_payable ?? 0) - newTotal, 0)
    await supabase.from('sales_orders').update({
      amount_paid: newTotal,
      outstanding_balance: newOutstanding,
      payment_status: newOutstanding <= 0 ? 'paid' : newTotal > 0 ? 'partial' : 'outstanding',
    }).eq('id', orderId)

    setSavingEdit(false)
    setEditRecovery(null)
    load()
  }

  async function handleUploadReceipt(recovery: Recovery) {
    if (!uploadFile) return
    setUploading(true)
    const supabase = createClient()
    const ext = uploadFile.name.split('.').pop()
    const path = `recoveries/${recovery.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(path, uploadFile, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      await supabase.from('recoveries').update({ file_url: publicUrl, file_name: uploadFile.name, file_type: uploadFile.type }).eq('id', recovery.id)
      await logActivity('Receipt uploaded', 'file', '', uploadFile.name)
    }
    setUploading(false)
    setUploadFile(null)
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
      record_ref: workflowRecovery.recovery_id,
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
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                ${order.payment_status === 'paid' ? 'bg-green-50 text-green-700' :
                  order.payment_status === 'partial' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-600'}`}>
                {order.payment_status === 'paid' ? 'Fully paid' : order.payment_status === 'partial' ? 'Partial' : 'Outstanding'}
              </span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mt-0.5">{order.customer?.name}</h1>
            <p className="text-xs text-gray-400">{order.customer?.customer_id}{order.customer?.phone ? ` · ${order.customer.phone}` : ''}</p>
          </div>
        </div>
        <Link href={`/portal/recoveries/create`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
          + Record recovery
        </Link>
      </div>

      {/* Sale info — collapsible */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button onClick={() => setOrderInfoOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
          <h2 className="text-sm font-semibold text-gray-700">Sale information</h2>
          <ChevronDown size={15} className={`text-gray-400 transition-transform ${orderInfoOpen ? 'rotate-180' : ''}`} />
        </button>
        {orderInfoOpen && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              {[
                { label: 'Tracking No.', value: order.container?.tracking_number ?? '—' },
                { label: 'Sale date', value: new Date(order.created_at).toLocaleDateString() },
                { label: 'Total payable', value: fmt(order.customer_payable) },
                { label: 'Initial payment', value: fmt(order.initial_payment) },
                { label: 'Total recovered', value: fmt(totalRecovered) },
                { label: 'Outstanding', value: fmt(order.outstanding_balance) },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-medium text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
            {order.sale_type === 'split_sale' && palletLines.length > 0 && (
              <div className="mt-4 rounded-lg overflow-hidden border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Pallet type','Pallets purchased','Total pieces','Price/pc','Line total'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {palletLines.map(l => (
                      <tr key={l.id} className="border-b border-gray-50">
                        <td className="px-3 py-2 font-medium">{l.pieces_per_pallet.toLocaleString()} pcs/pallet</td>
                        <td className="px-3 py-2">{l.pallets_sold}</td>
                        <td className="px-3 py-2">{l.total_pieces.toLocaleString()}</td>
                        <td className="px-3 py-2">{fmt(l.selling_price_per_piece)}</td>
                        <td className="px-3 py-2 font-semibold text-brand-700">{fmt(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  {['Recovery ID','Type','Amount','Date','Method','Comments','Receipt','Approval','Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recoveries.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">No recovery records yet.</td></tr>
                ) : recoveries.map(rec => (
                  <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50/50 group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded">{rec.recovery_id}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rec.payment_type === 'initial' ? 'bg-blue-50 text-blue-700' : 'bg-brand-50 text-brand-700'}`}>
                        {rec.payment_type === 'initial' ? 'Initial' : 'Recovery'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(rec.amount_paid)}</td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{new Date(rec.payment_date).toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-gray-500 capitalize whitespace-nowrap">{rec.payment_method}</td>
                    <td className="px-3 py-3 text-gray-500 max-w-[150px] truncate">{rec.comments ?? '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {rec.file_url ? (
                        <a href={rec.file_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                          <Eye size={12} /> View
                        </a>
                      ) : (
                        <label className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 cursor-pointer transition-colors">
                          <Upload size={12} /> Upload
                          <input type="file" className="hidden" onChange={e => {
                            setUploadFile(e.target.files?.[0] ?? null)
                            if (e.target.files?.[0]) {
                              setUploadFile(e.target.files[0])
                              // Auto upload
                              const file = e.target.files[0]
                              const supabase = createClient()
                              const ext = file.name.split('.').pop()
                              const path = `recoveries/${rec.id}/${Date.now()}.${ext}`
                              supabase.storage.from('documents').upload(path, file, { upsert: true }).then(({ error }) => {
                                if (!error) {
                                  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
                                  supabase.from('recoveries').update({ file_url: publicUrl, file_name: file.name, file_type: file.type }).eq('id', rec.id).then(() => load())
                                }
                              })
                            }
                          }} />
                        </label>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {rec.needs_approval ? (
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-medium">Pending</span>
                      ) : (
                        <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200 font-medium">Approved</span>
                      )}
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
                    <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(totalRecovered)}</td>
                    <td colSpan={6} />
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

      {/* Edit recovery modal */}
      <Modal open={!!editRecovery} onClose={() => setEditRecovery(null)} title="Edit recovery" size="md">
        {editRecovery && (
          <form onSubmit={handleEdit} className="space-y-4">
            {editRecovery.created_by === currentUserId && editRecovery.approval_status === 'approved' && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-700 font-medium flex items-center gap-2">
                  <AlertTriangle size={13} />
                  You created this record. Editing will require approval from another user.
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
                <select value={editForm.payment_method}
                  onChange={e => setEditForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                <input value={editForm.comments}
                  onChange={e => setEditForm(f => ({ ...f, comments: e.target.value }))}
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
              <button type="button" onClick={() => setEditRecovery(null)}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={savingEdit || (editRecovery.created_by === currentUserId && editRecovery.approval_status === 'approved' && !assignee)}
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
              <p className="text-xs text-red-700 font-medium">The recovery record will only be deleted after approval. The sales order totals will be recalculated.</p>
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
