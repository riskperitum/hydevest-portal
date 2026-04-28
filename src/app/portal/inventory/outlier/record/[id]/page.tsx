'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Edit2, Trash2, Loader2, Shield, Clock } from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'

interface OutlierRecord {
  id: string
  record_id: string
  container_id: string
  type: string
  quantity: number
  notes: string | null
  status: string
  is_modified: boolean
  approved_at: string | null
  approved_by: string | null
  created_at: string
  created_by: string
  container: {
    container_id: string
    tracking_number: string | null
  } | null
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

export default function OutlierRecordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [record, setRecord] = useState<OutlierRecord | null>(null)
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ type: '', quantity: '', notes: '' })
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

    const { data } = await supabase.from('outlier_records').select(`
      *,
      container:containers(container_id, tracking_number),
      created_by_profile:profiles!outlier_records_created_by_fkey(full_name, email),
      approved_by_profile:profiles!outlier_records_approved_by_fkey(full_name, email)
    `).eq('id', id).maybeSingle()

    if (data) {
      setRecord({
        ...data,
        container: one(data.container),
        created_by_profile: one(data.created_by_profile),
        approved_by_profile: one(data.approved_by_profile),
      } as OutlierRecord)
      setEditForm({ type: data.type, quantity: String(data.quantity), notes: data.notes ?? '' })
    }

    const { data: logs } = await supabase.from('outlier_record_activity_log').select(`
      *, performed_by_profile:profiles!outlier_record_activity_log_performed_by_fkey(full_name, email)
    `).eq('outlier_record_id', id).order('created_at', { ascending: false })

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
    await supabase.from('outlier_record_activity_log').insert({
      outlier_record_id: id, action, new_value: newValue, performed_by: user?.id,
    })
  }

  async function submitWorkflow() {
    if (!record || !workflowType) return
    if (!selfApprove && !assignee) return

    setSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const labels = { edit: 'Edit approval', delete: 'Delete approval', approve: 'Approve' }

    if (selfApprove && canSelfApprove) {
      await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `${labels[workflowType]}: ${record.record_id} (self-approved)`,
        description: workflowType === 'edit' ? editReason : workflowType === 'delete' ? deleteReason : 'Approve outlier record',
        module: 'outlier_records',
        record_id: record.id,
        record_ref: record.record_id,
        requested_by: user?.id,
        assigned_to: user?.id,
        status: 'approved',
        priority: workflowType === 'delete' ? 'high' : 'normal',
        review_note: 'Self-approved by ' + (user?.email ?? 'admin'),
      })

      if (workflowType === 'edit') {
        await supabase.from('outlier_records').update({
          type: editForm.type,
          quantity: Number(editForm.quantity),
          notes: editForm.notes || null,
          is_modified: true,
        }).eq('id', record.id)
        await logActivity('Record modified (self-approved)', editReason)
      } else if (workflowType === 'delete') {
        await supabase.from('outlier_records').delete().eq('id', record.id)
        await logActivity('Record deleted (self-approved)', deleteReason)
        setSubmitting(false)
        router.push('/portal/inventory/outlier')
        return
      } else if (workflowType === 'approve') {
        await supabase.from('outlier_records').update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        }).eq('id', record.id)
        await logActivity('Record approved (self-approved)')
      }
    } else {
      const { data: task } = await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `${labels[workflowType]}: ${record.record_id}`,
        description: workflowType === 'edit' ? editReason : workflowType === 'delete' ? deleteReason : 'Approve outlier record',
        module: 'outlier_records',
        record_id: record.id,
        record_ref: record.record_id,
        requested_by: user?.id,
        assigned_to: assignee,
        priority: workflowType === 'delete' ? 'high' : 'normal',
      }).select().single()

      await supabase.from('notifications').insert({
        user_id: assignee,
        type: 'task_approval_request',
        title: `New task: ${labels[workflowType]}`,
        message: `${record.record_id} — ${record.type} × ${record.quantity}`,
        task_id: task?.id,
        record_id: record.id,
        record_ref: record.record_id,
        module: 'outlier_records',
      })

      if (workflowType === 'edit' || workflowType === 'delete') {
        await supabase.from('outlier_records').update({ status: 'modified_pending' }).eq('id', record.id)
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
  if (!record) return <div className="p-6 text-sm text-gray-400">Record not found</div>

  const sCfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.pending_approval

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
                <h1 className="text-xl font-semibold text-gray-900">{record.record_id}</h1>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${sCfg.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />
                  {sCfg.label}
                </span>
                {record.is_modified && (
                  <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-medium">Modified</span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">Outlier record details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canApprove && record.status === 'pending_approval' && (
              <button type="button" onClick={() => { setWorkflowType('approve'); setWorkflowOpen(true) }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                <Shield size={14} /> Approve
              </button>
            )}
            {canEdit && record.status !== 'modified_pending' && (
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

        {/* Linked container */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Container</h3>
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
            <span className="font-mono text-xs bg-white text-brand-700 px-2 py-0.5 rounded">
              {record.container?.container_id ?? '—'}
            </span>
            {record.container?.tracking_number && (
              <span className="text-sm text-gray-700 ml-2">{record.container.tracking_number}</span>
            )}
          </div>
        </div>

        {/* Record details */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Type</p>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${TYPE_COLORS[record.type]}`}>{record.type}</span>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Quantity</p>
              <p className="text-2xl font-bold text-gray-900">{record.quantity.toLocaleString()}</p>
            </div>
          </div>
          {record.notes && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.notes}</p>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Record info</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-gray-400">Created by</p>
              <p className="font-medium text-gray-700">{record.created_by_profile?.full_name ?? record.created_by_profile?.email ?? '—'}</p>
              <p className="text-gray-400 mt-0.5">{new Date(record.created_at).toLocaleString('en-GB')}</p>
            </div>
            {record.approved_at && (
              <div>
                <p className="text-gray-400">Approved by</p>
                <p className="font-medium text-gray-700">{record.approved_by_profile?.full_name ?? record.approved_by_profile?.email ?? '—'}</p>
                <p className="text-gray-400 mt-0.5">{new Date(record.approved_at).toLocaleString('en-GB')}</p>
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
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit record" size="md">
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
                <input type="number" min="1" value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
              </div>
            </div>
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
        <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete record" size="sm">
          <div className="space-y-4">
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700">This will permanently delete the record (unless you self-approve, an approver will need to confirm).</p>
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
          title={workflowType === 'edit' ? 'Request edit approval' : workflowType === 'delete' ? 'Request delete approval' : 'Approve record'} size="sm">
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
