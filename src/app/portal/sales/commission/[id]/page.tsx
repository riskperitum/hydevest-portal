'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Edit2, Trash2, CheckCircle2, XCircle, DollarSign,
  Loader2, User, Calendar, FileText, AlertCircle, Clock, Save, X
} from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'

interface Commission {
  id: string
  commission_id: string
  sales_order_id: string
  referrer_name: string
  calculation_type: string
  excess_amount: number | null
  total_pieces: number | null
  sale_price_per_piece: number | null
  commission_amount: number
  notes: string | null
  status: string
  is_modified: boolean
  approved_at: string | null
  approved_by: string | null
  paid_at: string | null
  paid_by: string | null
  created_at: string
  created_by: string
  sales_order: {
    order_id: string
    sale_type: string
    customer_payable: number
    customer: { name: string; customer_id: string } | null
    container: { tracking_number: string | null; container_id: string } | null
  } | null
  created_by_profile: { full_name: string | null; email: string } | null
  approved_by_profile: { full_name: string | null; email: string } | null
  paid_by_profile: { full_name: string | null; email: string } | null
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

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending_approval:   { label: 'Pending approval',   color: 'bg-amber-50 text-amber-700 border-amber-200',  dot: 'bg-amber-400' },
  approved:           { label: 'Approved',            color: 'bg-blue-50 text-blue-700 border-blue-200',    dot: 'bg-blue-500' },
  rejected:           { label: 'Rejected',            color: 'bg-red-50 text-red-600 border-red-200',       dot: 'bg-red-500' },
  paid:               { label: 'Paid',                color: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  modified_pending:   { label: 'Modified - pending',  color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function CommissionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [commission, setCommission] = useState<Commission | null>(null)
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ excess_amount: '', flat_amount: '', referrer_name: '', notes: '', calculation_type: 'auto' as 'auto' | 'flat' })
  const [editReason, setEditReason] = useState('')

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')

  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowType, setWorkflowType] = useState<'edit' | 'delete' | 'mark_paid' | null>(null)
  const [selfApprove, setSelfApprove] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { permissions, isSuperAdmin } = usePermissions()
  const canViewActivity = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*')
  const canEdit = isSuperAdmin || can(permissions, isSuperAdmin, 'commission.edit')
  const canDelete = isSuperAdmin || can(permissions, isSuperAdmin, 'commission.delete')
  const canApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'commission.approve')
  const canMarkPaid = isSuperAdmin || can(permissions, isSuperAdmin, 'commission.pay')
  const canSelfApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*') || can(permissions, isSuperAdmin, 'commission.approve')

  const load = useCallback(async () => {
    const supabase = createClient()
    const one = <T,>(v: T | T[] | null | undefined): T | null => {
      if (v == null) return null
      return Array.isArray(v) ? (v[0] ?? null) : v
    }

    const { data } = await supabase
      .from('commissions')
      .select(`
        *,
        sales_order:sales_orders!commissions_sales_order_id_fkey(
          order_id, sale_type, customer_payable,
          customer:customers(name, customer_id),
          container:containers(tracking_number, container_id)
        ),
        created_by_profile:profiles!commissions_created_by_fkey(full_name, email),
        approved_by_profile:profiles!commissions_approved_by_fkey(full_name, email),
        paid_by_profile:profiles!commissions_paid_by_fkey(full_name, email)
      `)
      .eq('id', id)
      .maybeSingle()

    if (data) {
      setCommission({
        ...data,
        sales_order: one(data.sales_order),
        created_by_profile: one(data.created_by_profile),
        approved_by_profile: one(data.approved_by_profile),
        paid_by_profile: one(data.paid_by_profile),
      } as Commission)
      setEditForm({
        excess_amount: data.excess_amount?.toString() ?? '',
        flat_amount: data.commission_amount?.toString() ?? '',
        referrer_name: data.referrer_name ?? '',
        notes: data.notes ?? '',
        calculation_type: data.calculation_type as 'auto' | 'flat',
      })
    }

    const { data: logs } = await supabase
      .from('commission_activity_log')
      .select(`
        *,
        performed_by_profile:profiles!commission_activity_log_performed_by_fkey(full_name, email)
      `)
      .eq('commission_id', id)
      .order('created_at', { ascending: false })

    setActivityLogs(
      (logs ?? []).map(l => ({
        ...l,
        performed_by_profile: one(l.performed_by_profile),
      })) as ActivityLog[],
    )
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
    void init()
    void load()
  }, [load])

  async function logActivity(action: string, field_name: string | null = null, old_value: string | null = null, new_value: string | null = null) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('commission_activity_log').insert({
      commission_id: id,
      action,
      field_name,
      old_value,
      new_value,
      performed_by: user?.id,
    })
  }

  async function submitWorkflow() {
    if (!commission || !workflowType) return
    if (!selfApprove && !assignee) return

    setSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const typeLabels = {
      edit: 'Edit approval',
      delete: 'Delete approval',
      mark_paid: 'Mark paid approval',
    }

    // Self-approve path
    if (selfApprove && canSelfApprove) {
      await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `${typeLabels[workflowType]}: ${commission.commission_id} (self-approved)`,
        description: workflowType === 'edit' ? editReason : workflowType === 'delete' ? deleteReason : 'Mark as paid',
        module: 'commission',
        record_id: commission.id,
        record_ref: commission.commission_id,
        requested_by: user?.id,
        assigned_to: user?.id,
        status: 'approved',
        priority: workflowType === 'delete' ? 'high' : 'normal',
        review_note: 'Self-approved by ' + (user?.email ?? 'admin'),
      })

      if (workflowType === 'edit') {
        const excessNum = Number(editForm.excess_amount || 0)
        const flatNum = Number(editForm.flat_amount || 0)
        const newCommissionAmount = editForm.calculation_type === 'auto'
          ? excessNum * (commission.total_pieces ?? 0)
          : flatNum

        await supabase.from('commissions').update({
          referrer_name: editForm.referrer_name,
          calculation_type: editForm.calculation_type,
          excess_amount: editForm.calculation_type === 'auto' ? excessNum : null,
          commission_amount: newCommissionAmount,
          notes: editForm.notes || null,
          is_modified: true,
          updated_at: new Date().toISOString(),
        }).eq('id', commission.id)

        await logActivity('Commission modified (self-approved)', null, null, editReason)
      } else if (workflowType === 'delete') {
        await supabase.from('commissions').delete().eq('id', commission.id)
        await logActivity('Commission deleted (self-approved)', null, null, deleteReason)
        setSubmitting(false)
        router.push('/portal/sales/commission')
        return
      } else if (workflowType === 'mark_paid') {
        await supabase.from('commissions').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: user?.id,
        }).eq('id', commission.id)
        await logActivity('Commission marked as paid (self-approved)')
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
      return
    }

    // Normal flow - create task
    const { data: task } = await supabase.from('tasks').insert({
      type: 'approval_request',
      title: `${typeLabels[workflowType]}: ${commission.commission_id}`,
      description: workflowType === 'edit' ? editReason : workflowType === 'delete' ? deleteReason : 'Mark as paid',
      module: 'commission',
      record_id: commission.id,
      record_ref: commission.commission_id,
      requested_by: user?.id,
      assigned_to: assignee,
      priority: workflowType === 'delete' ? 'high' : 'normal',
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: assignee,
      type: 'task_approval_request',
      title: `New task: ${typeLabels[workflowType]}`,
      message: `${commission.commission_id} — ${commission.referrer_name}`,
      task_id: task?.id,
      record_id: commission.id,
      record_ref: commission.commission_id,
      module: 'commission',
    })

    // Mark commission as modified_pending if editing
    if (workflowType === 'edit' || workflowType === 'delete') {
      await supabase.from('commissions').update({
        status: 'modified_pending',
      }).eq('id', commission.id)
    }

    await logActivity(`${typeLabels[workflowType]} requested`, null, null, assignee)

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
  if (!commission) return <div className="p-6 text-sm text-gray-400">Commission not found</div>

  const statusCfg = STATUS_CONFIG[commission.status] ?? STATUS_CONFIG.pending_approval

  return (
    <PermissionGate permKey="commission.view">
      <div className="space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{commission.commission_id}</h1>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                  {statusCfg.label}
                </span>
                {commission.is_modified && (
                  <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                    Modified
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">Commission details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canMarkPaid && commission.status === 'approved' && (
              <button
                type="button"
                onClick={() => { setWorkflowType('mark_paid'); setWorkflowOpen(true) }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <DollarSign size={14} /> Mark as paid
              </button>
            )}
            {canEdit && commission.status !== 'paid' && commission.status !== 'modified_pending' && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <Edit2 size={14} /> Edit
              </button>
            )}
            {canDelete && commission.status !== 'paid' && (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Sales Order */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Linked sales order</h3>
          <Link href={`/portal/sales/orders/${commission.sales_order_id}`} className="block bg-brand-50 border border-brand-200 rounded-lg p-4 hover:bg-brand-100 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-white text-brand-700 px-2 py-0.5 rounded">
                    {commission.sales_order?.order_id ?? '—'}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{commission.sales_order?.customer?.name ?? '—'}</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {commission.sales_order?.container?.tracking_number ?? commission.sales_order?.container?.container_id ?? '—'} · {commission.sales_order?.sale_type?.replace('_', ' ')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Customer payable</p>
                <p className="text-sm font-bold text-gray-900">{fmt(commission.sales_order?.customer_payable ?? 0)}</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Commission Details */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Commission breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Type</p>
              <p className="text-sm font-semibold text-gray-900 capitalize">{commission.calculation_type}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Referrer</p>
              <p className="text-sm font-semibold text-gray-900">{commission.referrer_name}</p>
            </div>
            {commission.calculation_type === 'auto' && (
              <>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Excess amount</p>
                  <p className="text-sm font-semibold text-gray-900">{fmt(commission.excess_amount ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total pieces</p>
                  <p className="text-sm font-semibold text-gray-900">{commission.total_pieces}</p>
                </div>
              </>
            )}
          </div>
          <div className="bg-brand-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Commission amount</p>
            <p className="text-2xl font-bold text-brand-700">{fmt(commission.commission_amount)}</p>
          </div>
          {commission.notes && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{commission.notes}</p>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Record info</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-gray-400">Created by</p>
              <p className="font-medium text-gray-700">{commission.created_by_profile?.full_name ?? commission.created_by_profile?.email ?? '—'}</p>
              <p className="text-gray-400 mt-0.5">{new Date(commission.created_at).toLocaleString('en-GB')}</p>
            </div>
            {commission.approved_at && (
              <div>
                <p className="text-gray-400">Approved by</p>
                <p className="font-medium text-gray-700">{commission.approved_by_profile?.full_name ?? commission.approved_by_profile?.email ?? '—'}</p>
                <p className="text-gray-400 mt-0.5">{new Date(commission.approved_at).toLocaleString('en-GB')}</p>
              </div>
            )}
            {commission.paid_at && (
              <div>
                <p className="text-gray-400">Paid by</p>
                <p className="font-medium text-gray-700">{commission.paid_by_profile?.full_name ?? commission.paid_by_profile?.email ?? '—'}</p>
                <p className="text-gray-400 mt-0.5">{new Date(commission.paid_at).toLocaleString('en-GB')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Activity Log */}
        {canViewActivity && activityLogs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity log</h3>
            <div className="space-y-3">
              {activityLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-gray-700">{log.action}</p>
                    {log.new_value && <p className="text-gray-500 mt-0.5 italic">{`"${log.new_value}"`}</p>}
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
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit commission" size="md">
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-700">
                {'Editing a commission requires approval (unless you self-approve). The commission status will change to "Modified - pending" until approved.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditForm(f => ({ ...f, calculation_type: 'auto' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border ${editForm.calculation_type === 'auto' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600'}`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setEditForm(f => ({ ...f, calculation_type: 'flat' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border ${editForm.calculation_type === 'flat' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600'}`}
              >
                Flat
              </button>
            </div>
            {editForm.calculation_type === 'auto' ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Excess amount per piece (₦)</label>
                <input type="number" step="0.01" value={editForm.excess_amount} onChange={e => setEditForm(f => ({ ...f, excess_amount: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
                <p className="text-xs text-gray-400 mt-1">Commission = {fmt(Number(editForm.excess_amount || 0) * (commission.total_pieces ?? 0))}</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Commission amount (₦)</label>
                <input type="number" step="0.01" value={editForm.flat_amount} onChange={e => setEditForm(f => ({ ...f, flat_amount: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Referrer name</label>
              <input value={editForm.referrer_name} onChange={e => setEditForm(f => ({ ...f, referrer_name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason for change <span className="text-red-400">*</span></label>
              <textarea rows={2} value={editReason} onChange={e => setEditReason(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" placeholder="Why are you editing this commission?" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                onClick={() => { setWorkflowType('edit'); setWorkflowOpen(true) }}
                disabled={!editReason.trim()}
                className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                Request edit
              </button>
            </div>
          </div>
        </Modal>

        {/* Delete Modal */}
        <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete commission" size="sm">
          <div className="space-y-4">
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700">
                This will permanently delete the commission (unless you self-approve, an approver will need to confirm the deletion first).
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason for deletion <span className="text-red-400">*</span></label>
              <textarea rows={3} value={deleteReason} onChange={e => setDeleteReason(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" placeholder="Why are you deleting this commission?" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setDeleteOpen(false)} className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                onClick={() => { setWorkflowType('delete'); setWorkflowOpen(true) }}
                disabled={!deleteReason.trim()}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Request deletion
              </button>
            </div>
          </div>
        </Modal>

        {/* Workflow Modal */}
        <Modal
          open={workflowOpen}
          onClose={() => { setWorkflowOpen(false); setWorkflowType(null); setSelfApprove(false); setAssignee('') }}
          title={workflowType === 'edit' ? 'Request edit approval' : workflowType === 'delete' ? 'Request delete approval' : 'Mark as paid'}
          size="sm"
        >
          <div className="space-y-4">
            {canSelfApprove && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={selfApprove} onChange={e => setSelfApprove(e.target.checked)} className="mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-amber-900">Self-approve</span>
                    <p className="text-xs text-amber-700 mt-0.5">Execute this action immediately without sending an approval request.</p>
                  </div>
                </label>
              </div>
            )}
            {!selfApprove && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to <span className="text-red-400">*</span></label>
                <select value={assignee} onChange={e => setAssignee(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                  <option value="">Select user...</option>
                  {employees.filter(e => e.id !== currentUserId).map(e => (
                    <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setWorkflowOpen(false); setWorkflowType(null); setSelfApprove(false) }} className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                onClick={submitWorkflow}
                disabled={submitting || (!selfApprove && !assignee)}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 ${workflowType === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : workflowType === 'mark_paid' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
              >
                {submitting
                  ? <><Loader2 size={14} className="animate-spin" /> Submitting...</>
                  : selfApprove
                    ? (workflowType === 'delete' ? 'Delete now' : workflowType === 'mark_paid' ? 'Mark paid now' : 'Apply edit now')
                    : 'Submit request'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </PermissionGate>
  )
}
