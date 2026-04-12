'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, XCircle, Clock, AlertCircle, Eye, ChevronDown, Loader2 } from 'lucide-react'
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

const TYPE_LABELS: Record<string, string> = {
  delete_approval:     'Delete approval',
  review_request:      'Review request',
  completion_approval: 'Completion approval',
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

    const query = supabase
      .from('tasks')
      .select(`
        *,
        requested_by_profile:profiles!tasks_requested_by_fkey(full_name, email),
        assigned_to_profile:profiles!tasks_assigned_to_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    if (tab === 'assigned') {
      query.eq('assigned_to', user.id)
    } else {
      query.eq('requested_by', user.id)
    }

    if (statusFilter) query.eq('status', statusFilter)

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

    await supabase.from('tasks').update({
      status: action,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null,
    }).eq('id', selectedTask.id)

    // Handle the actual action based on task type
    if (selectedTask.record_id) {
      if (selectedTask.type === 'delete_approval' && action === 'approved') {
        if (selectedTask.module === 'trips') {
          await supabase.from('trips').delete().eq('id', selectedTask.record_id)
        }
      }
      if (selectedTask.type === 'completion_approval' && action === 'approved') {
        if (selectedTask.module === 'trips') {
          await supabase.from('trips').update({ status: 'completed' }).eq('id', selectedTask.record_id)
        }
      }
      if (selectedTask.type === 'review_request' && action === 'approved') {
        if (selectedTask.module === 'trips') {
          await supabase.from('trips').update({ approval_status: 'reviewed' }).eq('id', selectedTask.record_id)
        }
      }
    }

    // Notify the requester
    await supabase.from('notifications').insert({
      user_id: selectedTask.requested_by,
      type: action === 'approved' ? 'task_approved' : 'task_rejected',
      title: action === 'approved' ? `${selectedTask.title} — Approved` : `${selectedTask.title} — Rejected`,
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
    if (task.module === 'trips' && task.record_id) {
      router.push(`/portal/purchase/trips/${task.record_id}`)
    }
  }

  const pendingCount = tasks.filter(t => t.status === 'pending').length

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
        <div className="flex items-center border-b border-gray-100">
          <div className="flex flex-1">
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
          ) : tasks.map(task => (
            <div key={task.id} className="p-4 hover:bg-gray-50/50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{task.task_id}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {task.status}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                      {task.priority}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                      {TYPE_LABELS[task.type] ?? task.type}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
                  )}
                  {task.changes_summary && (
                    <div className="mt-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                      <p className="text-xs font-medium text-amber-700 mb-1">Changes since last review</p>
                      <p className="text-xs text-amber-600">{task.changes_summary}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    {task.record_ref && (
                      <span className="font-medium text-brand-600">{task.record_ref}</span>
                    )}
                    <span>
                      {tab === 'assigned'
                        ? `Requested by ${task.requested_by_profile?.full_name ?? task.requested_by_profile?.email ?? '—'}`
                        : `Assigned to ${task.assigned_to_profile?.full_name ?? task.assigned_to_profile?.email ?? '—'}`
                      }
                    </span>
                    <span>{new Date(task.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {task.record_id && (
                    <button onClick={() => navigateToRecord(task)}
                      title="View record"
                      className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                      <Eye size={15} />
                    </button>
                  )}
                  {tab === 'assigned' && task.status === 'pending' && (
                    <button onClick={() => { setSelectedTask(task); setReviewNote('') }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors">
                      Take action
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action modal */}
      <Modal open={!!selectedTask} onClose={() => setSelectedTask(null)} title="Review task" size="md"
        description={selectedTask?.title ?? ''}>
        {selectedTask && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Task</span>
                <span className="font-medium text-gray-900">{selectedTask.task_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Type</span>
                <span className="font-medium text-gray-900">{TYPE_LABELS[selectedTask.type] ?? selectedTask.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Record</span>
                <span className="font-medium text-brand-600">{selectedTask.record_ref ?? '—'}</span>
              </div>
              {selectedTask.description && (
                <div className="pt-1 border-t border-gray-200">
                  <p className="text-gray-500 text-xs">{selectedTask.description}</p>
                </div>
              )}
            </div>

            {selectedTask.changes_summary && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs font-medium text-amber-700 mb-1">Changes since last review</p>
                <p className="text-xs text-amber-600">{selectedTask.changes_summary}</p>
              </div>
            )}

            {selectedTask.type === 'delete_approval' && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                <p className="text-xs font-medium text-red-700">
                  Approving this will permanently delete {selectedTask.record_ref}. This cannot be undone.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Review note (optional)</label>
              <textarea rows={3} value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                placeholder="Add a note explaining your decision..." />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setSelectedTask(null)}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleAction('rejected')} disabled={actioning}
                className="flex-1 px-4 py-2 text-sm font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {actioning ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
              </button>
              <button onClick={() => handleAction('approved')} disabled={actioning}
                className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {actioning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
