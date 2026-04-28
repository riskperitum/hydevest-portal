'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Edit2, Trash2, Loader2, Shield } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'

interface OutlierSale {
  id: string
  sale_id: string
  customer_id: string
  type: string
  quantity_sold: number
  pricing_mode: string
  price_per_piece: number | null
  total_price: number
  notes: string | null
  status: string
  is_modified: boolean
  approved_at: string | null
  approved_by: string | null
  created_at: string
  customer: { name: string; customer_id: string; phone: string | null } | null
  created_by_profile: { full_name: string | null; email: string } | null
  approved_by_profile: { full_name: string | null; email: string } | null
}

interface ActivityLog {
  id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  performed_by_profile: { full_name: string | null; email: string } | null
}

const TYPES = ['ISINLE', 'BAYA', 'BLEACHING'] as const

const TYPE_COLORS: Record<string, string> = {
  ISINLE:    'bg-blue-50 text-blue-700 border-blue-200',
  BAYA:      'bg-purple-50 text-purple-700 border-purple-200',
  BLEACHING: 'bg-amber-50 text-amber-700 border-amber-200',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending_approval: { label: 'Pending approval',  color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  approved:         { label: 'Approved',           color: 'bg-blue-50 text-blue-700 border-blue-200',   dot: 'bg-blue-500' },
  rejected:         { label: 'Rejected',           color: 'bg-red-50 text-red-600 border-red-200',      dot: 'bg-red-500' },
  modified_pending: { label: 'Modified — pending', color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function OutlierSaleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [sale, setSale] = useState<OutlierSale | null>(null)
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ type: '', quantity_sold: '', pricing_mode: 'gross', price_per_piece: '', total_price: '', notes: '' })
  const [editReason, setEditReason] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')

  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowType, setWorkflowType] = useState<'edit' | 'delete' | 'approve' | null>(null)
  const [selfApprove, setSelfApprove] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { permissions, isSuperAdmin } = usePermissions()
  const canEdit = isSuperAdmin || can(permissions, isSuperAdmin, 'outlier.edit')
  const canDelete = isSuperAdmin || can(permissions, isSuperAdmin, 'outlier.delete')
  const canApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'outlier.approve')
  const canSelfApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*') || canApprove

  const load = useCallback(async () => {
    const supabase = createClient()
    const one = <T,>(v: T | T[] | null | undefined): T | null => v == null ? null : (Array.isArray(v) ? v[0] ?? null : v)

    const { data } = await supabase.from('outlier_sales').select(`
      *,
      customer:customers(name, customer_id, phone),
      created_by_profile:profiles!outlier_sales_created_by_fkey(full_name, email),
      approved_by_profile:profiles!outlier_sales_approved_by_fkey(full_name, email)
    `).eq('id', id).maybeSingle()

    if (data) {
      setSale({
        ...data,
        customer: one(data.customer),
        created_by_profile: one(data.created_by_profile),
        approved_by_profile: one(data.approved_by_profile),
      } as OutlierSale)
      setEditForm({
        type: data.type,
        quantity_sold: String(data.quantity_sold),
        pricing_mode: data.pricing_mode,
        price_per_piece: data.price_per_piece?.toString() ?? '',
        total_price: data.total_price?.toString() ?? '',
        notes: data.notes ?? '',
      })
    }

    const { data: logs } = await supabase.from('outlier_sale_activity_log').select(`
      *, performed_by_profile:profiles!outlier_sale_activity_log_performed_by_fkey(full_name, email)
    `).eq('outlier_sale_id', id).order('created_at', { ascending: false })

    setActivityLogs((logs ?? []).map(l => ({ ...l, performed_by_profile: one(l.performed_by_profile) })) as ActivityLog[])
    setLoading(false)
  }, [id])

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
      const emps = await getAdminProfiles()
      setEmployees(emps)
    }
    init()
    load()
  }, [load])

  async function logActivity(action: string, newValue: string | null = null) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('outlier_sale_activity_log').insert({
      outlier_sale_id: id, action, new_value: newValue, performed_by: user?.id,
    })
  }

  async function submitWorkflow() {
    if (!sale || !workflowType) return
    if (!selfApprove && !assignee) return

    setSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const labels = { edit: 'Edit approval', delete: 'Delete approval', approve: 'Approve' }

    if (selfApprove && canSelfApprove) {
      await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `${labels[workflowType]}: ${sale.sale_id} (self-approved)`,
        description: workflowType === 'edit' ? editReason : workflowType === 'delete' ? deleteReason : 'Approve outlier sale',
        module: 'outlier_sales',
        record_id: sale.id,
        record_ref: sale.sale_id,
        requested_by: user?.id,
        assigned_to: user?.id,
        status: 'approved',
        priority: workflowType === 'delete' ? 'high' : 'normal',
        review_note: 'Self-approved by ' + (user?.email ?? 'admin'),
      })

      if (workflowType === 'edit') {
        const newTotal = editForm.pricing_mode === 'per_piece'
          ? Number(editForm.price_per_piece || 0) * Number(editForm.quantity_sold || 0)
          : Number(editForm.total_price || 0)
        await supabase.from('outlier_sales').update({
          type: editForm.type,
          quantity_sold: Number(editForm.quantity_sold),
          pricing_mode: editForm.pricing_mode,
          price_per_piece: editForm.pricing_mode === 'per_piece' ? Number(editForm.price_per_piece) : null,
          total_price: newTotal,
          notes: editForm.notes || null,
          is_modified: true,
        }).eq('id', sale.id)
        await logActivity('Sale modified (self-approved)', editReason)
      } else if (workflowType === 'delete') {
        await supabase.from('outlier_sales').delete().eq('id', sale.id)
        await logActivity('Sale deleted (self-approved)', deleteReason)
        setSubmitting(false)
        router.push('/portal/inventory/outlier')
        return
      } else if (workflowType === 'approve') {
        await supabase.from('outlier_sales').update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        }).eq('id', sale.id)
        await logActivity('Sale approved (self-approved)')
      }
    } else {
      const { data: task } = await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `${labels[workflowType]}: ${sale.sale_id}`,
        description: workflowType === 'edit' ? editReason : workflowType === 'delete' ? deleteReason : 'Approve outlier sale',
        module: 'outlier_sales',
        record_id: sale.id,
        record_ref: sale.sale_id,
        requested_by: user?.id,
        assigned_to: assignee,
        priority: workflowType === 'delete' ? 'high' : 'normal',
      }).select().single()

      await supabase.from('notifications').insert({
        user_id: assignee,
        type: 'task_approval_request',
        title: `New task: ${labels[workflowType]}`,
        message: `${sale.sale_id} — ${sale.type} × ${sale.quantity_sold}`,
        task_id: task?.id,
        record_id: sale.id,
        record_ref: sale.sale_id,
        module: 'outlier_sales',
      })

      if (workflowType === 'edit' || workflowType === 'delete') {
        await supabase.from('outlier_sales').update({ status: 'modified_pending' }).eq('id', sale.id)
      }

      await logActivity(`${labels[workflowType]} requested`)
    }

    setSubmitting(false)
    setWorkflowOpen(false)
    setWorkflowType(null)
    setSelfApprove(false)
    setAssignee('')
    setEditReason('')
    setDeleteReason('')
    setEditOpen(false)
    setDeleteOpen(false)
    load()
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading...</div>
  if (!sale) return <div className="p-6 text-sm text-gray-400">Sale not found</div>

  const sCfg = STATUS_CONFIG[sale.status] ?? STATUS_CONFIG.pending_approval

  return (
    <PermissionGate permKey="outlier.view">
      <div className="space-y-5 max-w-4xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{sale.sale_id}</h1>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${sCfg.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />
                  {sCfg.label}
                </span>
                {sale.is_modified && (
                  <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-medium">Modified</span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">Outlier sale details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canApprove && sale.status === 'pending_approval' && (
              <button type="button" onClick={() => { setWorkflowType('approve'); setWorkflowOpen(true) }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                <Shield size={14} /> Approve
              </button>
            )}
            {canEdit && sale.status !== 'modified_pending' && (
              <button type="button" onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                <Edit2 size={14} /> Edit
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Customer */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Customer</h3>
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
            <span className="font-mono text-xs bg-white text-brand-700 px-2 py-0.5 rounded">{sale.customer?.customer_id ?? '—'}</span>
            <span className="text-sm font-semibold text-gray-900 ml-2">{sale.customer?.name ?? '—'}</span>
            {sale.customer?.phone && <p className="text-xs text-gray-600 mt-1">{sale.customer.phone}</p>}
          </div>
        </div>

        {/* Sale details */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Sale breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Type</p>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${TYPE_COLORS[sale.type]}`}>{sale.type}</span>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Quantity</p>
              <p className="text-lg font-bold text-gray-900">{sale.quantity_sold.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pricing mode</p>
              <p className="text-sm font-semibold text-gray-700 capitalize">{sale.pricing_mode === 'per_piece' ? 'Per piece' : 'Gross total'}</p>
            </div>
            {sale.pricing_mode === 'per_piece' && sale.price_per_piece && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Price per piece</p>
                <p className="text-sm font-semibold text-gray-700">{fmt(sale.price_per_piece)}</p>
              </div>
            )}
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Total price</p>
            <p className="text-2xl font-bold text-green-700">{fmt(sale.total_price)}</p>
          </div>
          {sale.notes && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{sale.notes}</p>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Sale info</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-gray-400">Created by</p>
              <p className="font-medium text-gray-700">{sale.created_by_profile?.full_name ?? sale.created_by_profile?.email ?? '—'}</p>
              <p className="text-gray-400 mt-0.5">{new Date(sale.created_at).toLocaleString('en-GB')}</p>
            </div>
            {sale.approved_at && (
              <div>
                <p className="text-gray-400">Approved by</p>
                <p className="font-medium text-gray-700">{sale.approved_by_profile?.full_name ?? sale.approved_by_profile?.email ?? '—'}</p>
                <p className="text-gray-400 mt-0.5">{new Date(sale.approved_at).toLocaleString('en-GB')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Activity log */}
        {activityLogs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity log</h3>
            <div className="space-y-3">
              {activityLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-gray-700">{log.action}</p>
                    {log.new_value && <p className="text-gray-500 mt-0.5 italic">"{log.new_value}"</p>}
                    <p className="text-gray-400 mt-0.5">
                      {log.performed_by_profile?.full_name ?? log.performed_by_profile?.email ?? '—'} · {new Date(log.created_at).toLocaleString('en-GB')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit Modal */}
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit sale" size="md">
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-700">Editing requires approval. Status will change to "Modified — pending" until approved.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
                <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity</label>
                <input type="number" min="1" value={editForm.quantity_sold} onChange={e => setEditForm(f => ({ ...f, quantity_sold: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditForm(f => ({ ...f, pricing_mode: 'gross' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border ${editForm.pricing_mode === 'gross' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600'}`}>Gross</button>
              <button type="button" onClick={() => setEditForm(f => ({ ...f, pricing_mode: 'per_piece' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border ${editForm.pricing_mode === 'per_piece' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600'}`}>Per piece</button>
            </div>
            {editForm.pricing_mode === 'per_piece' ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Price per piece (₦)</label>
                <input type="number" step="0.01" value={editForm.price_per_piece} onChange={e => setEditForm(f => ({ ...f, price_per_piece: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                <p className="text-xs text-gray-400 mt-1">Total: {fmt(Number(editForm.price_per_piece || 0) * Number(editForm.quantity_sold || 0))}</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Total price (₦)</label>
                <input type="number" step="0.01" value={editForm.total_price} onChange={e => setEditForm(f => ({ ...f, total_price: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason for change <span className="text-red-400">*</span></label>
              <textarea rows={2} value={editReason} onChange={e => setEditReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" placeholder="Why are you editing?" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditOpen(false)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={() => { setWorkflowType('edit'); setWorkflowOpen(true) }}
                disabled={!editReason.trim()}
                className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">Request edit</button>
            </div>
          </div>
        </Modal>

        {/* Delete Modal */}
        <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete sale" size="sm">
          <div className="space-y-4">
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700">This will permanently delete the sale (unless you self-approve, an approver will need to confirm).</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason for deletion <span className="text-red-400">*</span></label>
              <textarea rows={3} value={deleteReason} onChange={e => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" placeholder="Why are you deleting?" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setDeleteOpen(false)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={() => { setWorkflowType('delete'); setWorkflowOpen(true) }}
                disabled={!deleteReason.trim()}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Request deletion</button>
            </div>
          </div>
        </Modal>

        {/* Workflow Modal */}
        <Modal open={workflowOpen} onClose={() => { setWorkflowOpen(false); setWorkflowType(null); setSelfApprove(false); setAssignee('') }}
          title={workflowType === 'edit' ? 'Request edit approval' : workflowType === 'delete' ? 'Request delete approval' : 'Approve sale'} size="sm">
          <div className="space-y-4">
            {canSelfApprove && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={selfApprove} onChange={e => setSelfApprove(e.target.checked)} className="mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-amber-900">Self-approve</span>
                    <p className="text-xs text-amber-700 mt-0.5">Execute this action immediately.</p>
                  </div>
                </label>
              </div>
            )}
            {!selfApprove && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to <span className="text-red-400">*</span></label>
                <select value={assignee} onChange={e => setAssignee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="">Select user...</option>
                  {employees.filter(e => e.id !== currentUserId).map(e => (
                    <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setWorkflowOpen(false); setWorkflowType(null); setSelfApprove(false) }}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={submitWorkflow} disabled={submitting || (!selfApprove && !assignee)}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 ${
                  workflowType === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : workflowType === 'approve' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}>
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : selfApprove ? (workflowType === 'delete' ? 'Delete now' : workflowType === 'approve' ? 'Approve now' : 'Apply edit now') : 'Submit request'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </PermissionGate>
  )
}
