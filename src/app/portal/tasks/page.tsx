'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2, XCircle, AlertCircle, Eye,
  Loader2, Trash2, ClipboardCheck, RefreshCw
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'

interface Task {
  id: string
  task_id: string
  type: string
  title: string
  description: string | null
  status: string
  priority: string
  module: string
  record_id: string | null
  record_ref: string | null
  changes_summary: string | null
  due_date: string | null
  created_at: string
  requested_by: string
  assigned_to: string | null
  review_note: string | null
  requested_by_profile: { full_name: string | null; email: string } | null
  assigned_to_profile: { full_name: string | null; email: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  approved:  'bg-green-50 text-green-700 border-green-200',
  rejected:  'bg-red-50 text-red-600 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

const PRIORITY_COLORS: Record<string, string> = {
  low:    'bg-gray-100 text-gray-500',
  normal: 'bg-blue-50 text-blue-600',
  high:   'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-600',
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; approveLabel: string; approveColor: string }> = {
  approval_request:    { label: 'Approval request',    icon: <CheckCircle2 size={13} />, approveLabel: 'Approve',      approveColor: 'bg-brand-600 hover:bg-brand-700 text-white' },
  review_request:      { label: 'Review request',      icon: <ClipboardCheck size={13} />, approveLabel: 'Mark reviewed', approveColor: 'bg-blue-600 hover:bg-blue-700 text-white' },
  delete_approval:     { label: 'Delete approval',     icon: <Trash2 size={13} />, approveLabel: 'Confirm delete',  approveColor: 'bg-red-600 hover:bg-red-700 text-white' },
  completion_approval: { label: 'Completion approval', icon: <RefreshCw size={13} />, approveLabel: 'Mark complete',   approveColor: 'bg-green-600 hover:bg-green-700 text-white' },
}

const MODULE_LABELS: Record<string, string> = {
  trips: 'Trips', containers: 'Containers', presales: 'Presales',
  sales_orders: 'Sales orders', recoveries: 'Recoveries',
  expenses: 'Expenses', supplier_receivables: 'Supplier receivables',
}

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'assigned' | 'requested'>('assigned')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [actioning, setActioning] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    let query = supabase
      .from('tasks')
      .select(`
        *,
        requested_by_profile:profiles!tasks_requested_by_fkey(full_name, email),
        assigned_to_profile:profiles!tasks_assigned_to_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    if (tab === 'assigned') {
      query = query.eq('assigned_to', user.id)
    } else {
      query = query.eq('requested_by', user.id)
    }

    if (statusFilter) query = query.eq('status', statusFilter)

    const { data } = await query
    setTasks(data ?? [])
    setLoading(false)
  }, [tab, statusFilter])

  useEffect(() => { load() }, [load])

  async function handleAction(action: 'approved' | 'rejected') {
    if (!selectedTask) return
    setActioning(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // 1. Update task status
    await supabase.from('tasks').update({
      status: action,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null,
    }).eq('id', selectedTask.id)

    // 2. Execute the actual business action
    if (selectedTask.record_id && action === 'approved') {
      const { type, module, record_id, record_ref } = selectedTask

      // ── APPROVAL REQUESTS ──────────────────────────────────────────
      if (type === 'approval_request') {
        if (module === 'trips') {
          await supabase.from('trips').update({ approval_status: 'approved' }).eq('id', record_id)
        }
        if (module === 'containers') {
          await supabase.from('containers').update({ approval_status: 'approved' }).eq('id', record_id)
        }
        if (module === 'presales') {
          await supabase.from('presales').update({
            approval_status: 'approved',
            status: 'confirmed',
            needs_review: false,
            last_reviewed_by: user?.id,
            last_reviewed_at: new Date().toISOString(),
          }).eq('id', record_id)
        }
        if (module === 'sales_orders') {
          await supabase.from('sales_orders').update({
            approval_status: 'approved',
            needs_approval: false,
            last_approved_by: user?.id,
            last_approved_at: new Date().toISOString(),
          }).eq('id', record_id)
        }
        if (module === 'recoveries') {
          await supabase.from('recoveries').update({
            approval_status: 'approved',
            needs_approval: false,
          }).eq('id', record_id)
        }
        if (module === 'expenses') {
          await supabase.from('expenses').update({
            approval_status: 'approved',
            needs_approval: false,
            last_approved_by: user?.id,
            last_approved_at: new Date().toISOString(),
          }).eq('id', record_id)
        }
        if (module === 'supplier_receivables') {
          // Find the allocation and approve it
          const { data: alloc } = await supabase
            .from('supplier_receivable_allocations')
            .select('id, amount_usd, target_trip_id, receivable_id')
            .eq('receivable_id', record_id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (alloc) {
            await supabase.from('supplier_receivable_allocations').update({
              status: 'approved',
              approved_by: user?.id,
              approved_at: new Date().toISOString(),
            }).eq('id', alloc.id)

            // Auto-create trip expense
            await supabase.from('trip_expenses').insert({
              trip_id: alloc.target_trip_id,
              category: 'container',
              currency: 'USD',
              amount: alloc.amount_usd,
              description: `Supplier receivable reallocation (approved)`,
              expense_date: new Date().toISOString().split('T')[0],
              created_by: user?.id,
            })

            // Update receivable totals
            const { data: rec } = await supabase.from('supplier_receivables')
              .select('total_applied_usd, gross_value_usd, agreed_value_usd, total_written_off_usd')
              .eq('id', alloc.receivable_id).single()
            if (rec) {
              const newApplied = Number(rec.total_applied_usd) + Number(alloc.amount_usd)
              const effectiveVal = rec.agreed_value_usd ? Number(rec.agreed_value_usd) : Number(rec.gross_value_usd)
              const newRemaining = effectiveVal - newApplied - Number(rec.total_written_off_usd)
              await supabase.from('supplier_receivables').update({
                total_applied_usd: newApplied,
                status: newRemaining <= 0 ? 'fully_applied' : 'partially_applied',
              }).eq('id', alloc.receivable_id)
            }
          }
        }
      }

      // ── REVIEW REQUESTS ────────────────────────────────────────────
      if (type === 'review_request') {
        if (module === 'trips') {
          await supabase.from('trips').update({
            approval_status: 'reviewed',
            needs_review: false,
          }).eq('id', record_id)
        }
        if (module === 'presales') {
          await supabase.from('presales').update({
            approval_status: 'reviewed',
            needs_review: false,
            last_reviewed_by: user?.id,
            last_reviewed_at: new Date().toISOString(),
          }).eq('id', record_id)
        }
      }

      // ── COMPLETION APPROVALS ───────────────────────────────────────
      if (type === 'completion_approval') {
        if (module === 'trips') {
          await supabase.from('trips').update({ status: 'completed' }).eq('id', record_id)
        }
      }

      // ── DELETE APPROVALS ───────────────────────────────────────────
      if (type === 'delete_approval') {
        if (module === 'trips') {
          await supabase.from('trips').delete().eq('id', record_id)
        }
        if (module === 'containers') {
          await supabase.from('containers').delete().eq('id', record_id)
        }
        if (module === 'presales') {
          await supabase.from('presales').delete().eq('id', record_id)
        }
        if (module === 'sales_orders') {
          await supabase.from('sales_orders').delete().eq('id', record_id)
        }
        if (module === 'expenses') {
          await supabase.from('expenses').delete().eq('id', record_id)
        }
        if (module === 'recoveries') {
          // Delete recovery and recalculate order totals
          const { data: rec } = await supabase
            .from('recoveries')
            .select('sales_order_id, amount_paid')
            .eq('id', record_id)
            .single()
          if (rec) {
            await supabase.from('recoveries').delete().eq('id', record_id)
            const { data: remaining } = await supabase
              .from('recoveries')
              .select('amount_paid')
              .eq('sales_order_id', rec.sales_order_id)
            const { data: order } = await supabase
              .from('sales_orders')
              .select('customer_payable')
              .eq('id', rec.sales_order_id)
              .single()
            const newTotal = (remaining ?? []).reduce((s: number, r: { amount_paid: number }) => s + Number(r.amount_paid), 0)
            const newOutstanding = Math.max(Number(order?.customer_payable ?? 0) - newTotal, 0)
            await supabase.from('sales_orders').update({
              amount_paid: newTotal,
              outstanding_balance: newOutstanding,
              payment_status: newOutstanding <= 0 ? 'paid' : newTotal > 0 ? 'partial' : 'outstanding',
            }).eq('id', rec.sales_order_id)
          }
        }
      }
    }

    // 3. Notify the requester
    await supabase.from('notifications').insert({
      user_id: selectedTask.requested_by,
      type: action === 'approved' ? 'task_approved' : 'task_rejected',
      title: action === 'approved'
        ? `✓ ${selectedTask.title} — Approved`
        : `✗ ${selectedTask.title} — Rejected`,
      message: reviewNote || (action === 'approved' ? 'Your request has been approved.' : 'Your request has been rejected.'),
      task_id: selectedTask.id,
      record_id: selectedTask.record_id,
      record_ref: selectedTask.record_ref,
      module: selectedTask.module,
    })

    setActioning(false)
    setSelectedTask(null)
    setReviewNote('')
    load()
  }

  function navigateToRecord(task: Task) {
    const map: Record<string, string> = {
      trips:                 `/portal/purchase/trips/${task.record_id}`,
      containers:            `/portal/purchase/containers/${task.record_id}`,
      presales:              `/portal/sales/presales/${task.record_id}`,
      sales_orders:          `/portal/sales/orders/${task.record_id}`,
      recoveries:            `/portal/recoveries/${task.record_id}`,
      expenses:              `/portal/expensify/${task.record_id}`,
      supplier_receivables:  `/portal/reports/supplier-receivables/${task.record_id}`,
    }
    const path = map[task.module]
    if (path && task.record_id) router.push(path)
  }

  function openActionModal(task: Task) {
    setSelectedTask(task)
    setReviewNote('')
  }

  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const typeCfg = selectedTask ? (TYPE_CONFIG[selectedTask.type] ?? TYPE_CONFIG.approval_request) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-400 mt-0.5">Actions assigned to you and requests you have made</p>
        </div>
        {pendingCount > 0 && tab === 'assigned' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-medium rounded-lg border border-amber-200">
            <AlertCircle size={14} /> {pendingCount} pending action{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabs + filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center border-b border-gray-100 flex-wrap gap-2 px-4 py-2 sm:p-0">
          <div className="flex flex-1 min-w-max">
            {([
              { key: 'assigned', label: 'Assigned to me' },
              { key: 'requested', label: 'My requests' },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                  ${tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="px-4">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-1/4" />
                <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
              </div>
            ))
          ) : tasks.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 size={32} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 font-medium">No tasks found</p>
              <p className="text-xs text-gray-300 mt-1">
                {tab === 'assigned' ? 'No tasks assigned to you' : 'You have not made any requests'}
              </p>
            </div>
          ) : tasks.map(task => {
            const tCfg = TYPE_CONFIG[task.type] ?? TYPE_CONFIG.approval_request
            const isDelete = task.type === 'delete_approval'
            return (
              <div key={task.id}
                className={`p-4 hover:bg-gray-50/50 transition-colors ${task.status === 'pending' && tab === 'assigned' ? 'border-l-2 border-brand-400' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">

                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-mono text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{task.task_id}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                        {task.priority}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                        {tCfg.icon} {tCfg.label}
                      </span>
                      {task.module && (
                        <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">
                          {MODULE_LABELS[task.module] ?? task.module}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <p className="text-sm font-semibold text-gray-900">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
                    )}

                    {/* Changes summary */}
                    {task.changes_summary && (
                      <div className="mt-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-xs font-medium text-amber-700 mb-1">Changes since last review</p>
                        <p className="text-xs text-amber-600">{task.changes_summary}</p>
                      </div>
                    )}

                    {/* Delete warning on list */}
                    {isDelete && task.status === 'pending' && (
                      <div className="mt-2 p-2.5 bg-red-50 rounded-lg border border-red-100">
                        <p className="text-xs font-medium text-red-700">
                          Approval will permanently delete {task.record_ref}
                        </p>
                      </div>
                    )}

                    {/* Review note if actioned */}
                    {task.review_note && task.status !== 'pending' && (
                      <div className="mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-xs font-medium text-gray-500 mb-0.5">Review note</p>
                        <p className="text-xs text-gray-600">{task.review_note}</p>
                      </div>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                      {task.record_ref && (
                        <span className="font-mono font-medium text-brand-600">{task.record_ref}</span>
                      )}
                      <span>
                        {tab === 'assigned'
                          ? `Requested by ${task.requested_by_profile?.full_name ?? task.requested_by_profile?.email ?? '—'}`
                          : `Assigned to ${task.assigned_to_profile?.full_name ?? task.assigned_to_profile?.email ?? '—'}`}
                      </span>
                      <span>{new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {task.record_id && (
                      <button onClick={() => navigateToRecord(task)}
                        title="View record"
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                        <Eye size={15} />
                      </button>
                    )}
                    {tab === 'assigned' && task.status === 'pending' && (
                      <>
                        <button
                          onClick={() => { openActionModal(task) }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isDelete ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}>
                          {tCfg.icon}
                          {tCfg.approveLabel}
                        </button>
                        <button
                          onClick={async () => {
                            setSelectedTask(task)
                            setReviewNote('')
                            await new Promise(r => setTimeout(r, 0))
                            handleAction('rejected')
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          <XCircle size={13} /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Action modal */}
      <Modal open={!!selectedTask} onClose={() => { setSelectedTask(null); setReviewNote('') }}
        title={typeCfg?.approveLabel ?? 'Action task'}
        description={selectedTask?.title ?? ''} size="md">
        {selectedTask && typeCfg && (
          <div className="space-y-4">

            {/* Task summary */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Task ID</span>
                <span className="font-mono text-xs text-gray-700">{selectedTask.task_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Type</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700">{typeCfg.icon} {typeCfg.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Module</span>
                <span className="text-xs font-medium text-brand-600">{MODULE_LABELS[selectedTask.module] ?? selectedTask.module}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">Record</span>
                <span className="font-mono text-xs font-semibold text-brand-700">{selectedTask.record_ref ?? '—'}</span>
              </div>
              {selectedTask.description && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">{selectedTask.description}</p>
                </div>
              )}
            </div>

            {/* Changes summary */}
            {selectedTask.changes_summary && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-xs font-semibold text-amber-700 mb-1">Changes since last review</p>
                <p className="text-xs text-amber-600">{selectedTask.changes_summary}</p>
              </div>
            )}

            {/* Delete warning */}
            {selectedTask.type === 'delete_approval' && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2">
                <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-red-700">
                  Confirming will permanently delete <span className="font-mono">{selectedTask.record_ref}</span>. This cannot be undone.
                </p>
              </div>
            )}

            {/* Review note */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea rows={3} value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                placeholder="Add a note explaining your decision..." />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setSelectedTask(null); setReviewNote('') }}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleAction('rejected')} disabled={actioning}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {actioning ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
              </button>
              <button onClick={() => handleAction('approved')} disabled={actioning}
                className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2 ${typeCfg.approveColor}`}>
                {actioning ? <Loader2 size={14} className="animate-spin" /> : typeCfg.icon}
                {typeCfg.approveLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
