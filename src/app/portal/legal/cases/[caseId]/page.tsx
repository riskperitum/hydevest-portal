'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Save, Loader2, X, Edit2,
  CheckCircle2, Clock, MessageSquare, DollarSign,
  User, Calendar, Activity, Lock, Unlock
} from 'lucide-react'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'

interface LegalCase {
  id: string
  case_id: string
  title: string
  description: string | null
  case_type: string
  status: string
  priority: string
  opened_date: string
  closed_date: string | null
  assigned_to: string | null
  assignee_name: string | null
  created_at: string
}

interface CaseCustomer {
  id: string
  customer_id: string
  customer_db_id: string
  name: string
}

interface CaseTask {
  id: string
  title: string
  description: string | null
  assigned_to: string | null
  assignee_name: string | null
  due_date: string | null
  status: string
  created_at: string
}

interface CaseComment {
  id: string
  content: string
  is_internal: boolean
  creator_name: string | null
  created_at: string
}

interface CasePayment {
  id: string
  payment_id: string
  amount: number
  payment_date: string
  payment_type: string
  description: string | null
  payee: string | null
  created_at: string
}

interface ActivityLog {
  id: string
  action: string
  notes: string | null
  creator_name: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open:          { label: 'Open',          color: 'bg-blue-50 text-blue-700'    },
  in_progress:   { label: 'In progress',   color: 'bg-amber-50 text-amber-700'  },
  pending_court: { label: 'Pending court', color: 'bg-purple-50 text-purple-700'},
  police_arrest: { label: 'Police arrest', color: 'bg-red-50 text-red-700'      },
  settled:       { label: 'Settled',       color: 'bg-green-50 text-green-700'  },
  closed:        { label: 'Closed',        color: 'bg-gray-100 text-gray-500'   },
  won:           { label: 'Won',           color: 'bg-green-50 text-green-700'  },
  lost:          { label: 'Lost',          color: 'bg-red-50 text-red-600'      },
}

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  open:        { label: 'Open',        color: 'bg-gray-100 text-gray-600'  },
  in_progress: { label: 'In progress', color: 'bg-amber-50 text-amber-700' },
  done:        { label: 'Done',        color: 'bg-green-50 text-green-700' },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function LegalCasePage() {
  const params  = useParams()
  const router  = useRouter()
  const caseId  = params.caseId as string

  const [legalCase, setCase]   = useState<LegalCase | null>(null)
  const [customers, setCaseCustomers] = useState<CaseCustomer[]>([])
  const [tasks, setTasks]       = useState<CaseTask[]>([])
  const [comments, setComments] = useState<CaseComment[]>([])
  const [payments, setPayments] = useState<CasePayment[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [loading, setLoading]   = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [employees, setEmployees]     = useState<any[]>([])
  const [allCustomers, setAllCustomers] = useState<any[]>([])

  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'comments' | 'payments' | 'activity'>('overview')

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Add task
  const [taskOpen, setTaskOpen]   = useState(false)
  const [taskForm, setTaskForm]   = useState({ title: '', description: '', assigned_to: '', due_date: '' })
  const [savingTask, setSavingTask] = useState(false)

  // Add comment
  const [commentText, setCommentText] = useState('')
  const [isInternal, setIsInternal]   = useState(false)
  const [savingComment, setSavingComment] = useState(false)

  // Add payment
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '', payment_date: new Date().toISOString().split('T')[0],
    payment_type: 'settlement', description: '', payee: '',
  })
  const [savingPayment, setSavingPayment] = useState(false)

  // Add customer to case
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [customerSearch, setCustomerSearch]   = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()

    const [
      { data: caseData },
      { data: caseCustomers },
      { data: caseTasks },
      { data: caseComments },
      { data: casePayments },
      { data: caseActivity },
      { data: authData },
    ] = await Promise.all([
      supabase.from('legal_cases').select(`
        id, case_id, title, description, case_type, status, priority,
        opened_date, closed_date, assigned_to, created_at,
        assignee:profiles!legal_cases_assigned_to_fkey(full_name, email)
      `).eq('id', caseId).single(),
      supabase.from('legal_case_customers').select(`
        id, customer_id,
        customer:customers!legal_case_customers_customer_id_fkey(id, name, customer_id)
      `).eq('case_id', caseId),
      supabase.from('legal_case_tasks').select(`
        id, title, description, due_date, status, created_at,
        assignee:profiles!legal_case_tasks_assigned_to_fkey(full_name, email)
      `).eq('case_id', caseId).order('created_at'),
      supabase.from('legal_case_comments').select(`
        id, content, is_internal, created_at,
        creator:profiles!legal_case_comments_created_by_fkey(full_name, email)
      `).eq('case_id', caseId).order('created_at'),
      supabase.from('legal_case_payments').select('*').eq('case_id', caseId).order('payment_date', { ascending: false }),
      supabase.from('legal_case_activity').select(`
        id, action, notes, created_at,
        creator:profiles!legal_case_activity_created_by_fkey(full_name, email)
      `).eq('case_id', caseId).order('created_at', { ascending: false }),
      supabase.auth.getUser(),
    ])

    if (caseData) {
      setCase({
        id:            caseData.id,
        case_id:       caseData.case_id,
        title:         caseData.title,
        description:   caseData.description,
        case_type:     caseData.case_type,
        status:        caseData.status,
        priority:      caseData.priority,
        opened_date:   caseData.opened_date,
        closed_date:   caseData.closed_date,
        assigned_to:   caseData.assigned_to,
        assignee_name: (caseData.assignee as any)?.full_name ?? (caseData.assignee as any)?.email ?? null,
        created_at:    caseData.created_at,
      })
    }

    setCaseCustomers((caseCustomers ?? []).map(cc => ({
      id:             cc.id,
      customer_id:    (cc.customer as any)?.customer_id,
      customer_db_id: (cc.customer as any)?.id,
      name:           (cc.customer as any)?.name,
    })))

    setTasks((caseTasks ?? []).map(t => ({
      id:            t.id,
      title:         t.title,
      description:   t.description,
      assigned_to:   null,
      assignee_name: (t.assignee as any)?.full_name ?? (t.assignee as any)?.email ?? null,
      due_date:      t.due_date,
      status:        t.status,
      created_at:    t.created_at,
    })))

    setComments((caseComments ?? []).map(c => ({
      id:           c.id,
      content:      c.content,
      is_internal:  c.is_internal,
      creator_name: (c.creator as any)?.full_name ?? (c.creator as any)?.email ?? null,
      created_at:   c.created_at,
    })))

    setPayments((casePayments ?? []).map(p => ({
      ...p,
      amount: Number(p.amount),
    })))

    setActivity((caseActivity ?? []).map(a => ({
      id:           a.id,
      action:       a.action,
      notes:        a.notes,
      creator_name: (a.creator as any)?.full_name ?? (a.creator as any)?.email ?? null,
      created_at:   a.created_at,
    })))

    if (authData.user) setCurrentUser({ id: authData.user.id })

    setLoading(false)
  }, [caseId])

  useEffect(() => {
    load()
    getAdminProfiles().then(setEmployees)
    const supabase = createClient()
    supabase.from('customers').select('id, name, customer_id').eq('is_active', true).order('name')
      .then(({ data }) => setAllCustomers(data ?? []))
  }, [load])

  async function logActivity(action: string, notes?: string) {
    const supabase = createClient()
    await supabase.from('legal_case_activity').insert({
      case_id: caseId, action, notes: notes ?? null, created_by: currentUser?.id,
    })
  }

  async function updateStatus(newStatus: string) {
    setUpdatingStatus(true)
    const supabase = createClient()
    const updates: any = { status: newStatus }
    if (['closed', 'settled', 'won', 'lost'].includes(newStatus)) {
      updates.closed_date = new Date().toISOString().split('T')[0]
    }
    await supabase.from('legal_cases').update(updates).eq('id', caseId)
    await logActivity('Status updated', `Changed to: ${STATUS_CONFIG[newStatus]?.label ?? newStatus}`)
    setUpdatingStatus(false)
    load()
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    if (!taskForm.title) return
    setSavingTask(true)
    const supabase = createClient()
    await supabase.from('legal_case_tasks').insert({
      case_id:     caseId,
      title:       taskForm.title,
      description: taskForm.description || null,
      assigned_to: taskForm.assigned_to || null,
      due_date:    taskForm.due_date || null,
      created_by:  currentUser?.id,
    })
    await logActivity('Task added', taskForm.title)
    setSavingTask(false)
    setTaskOpen(false)
    setTaskForm({ title: '', description: '', assigned_to: '', due_date: '' })
    load()
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const supabase = createClient()
    await supabase.from('legal_case_tasks').update({ status }).eq('id', taskId)
    load()
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    setSavingComment(true)
    const supabase = createClient()
    await supabase.from('legal_case_comments').insert({
      case_id:     caseId,
      content:     commentText.trim(),
      is_internal: isInternal,
      created_by:  currentUser?.id,
    })
    await logActivity(isInternal ? 'Internal note added' : 'Comment added')
    setSavingComment(false)
    setCommentText('')
    load()
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault()
    setSavingPayment(true)
    const supabase = createClient()
    const seq = Date.now().toString().slice(-5)
    await supabase.from('legal_case_payments').insert({
      payment_id:   `CPAY-${seq}`,
      case_id:      caseId,
      amount:       parseFloat(paymentForm.amount),
      payment_date: paymentForm.payment_date,
      payment_type: paymentForm.payment_type,
      description:  paymentForm.description || null,
      payee:        paymentForm.payee || null,
      created_by:   currentUser?.id,
    })
    await logActivity('Payment recorded', `${fmt(parseFloat(paymentForm.amount))} — ${paymentForm.payment_type}`)
    setSavingPayment(false)
    setPaymentOpen(false)
    setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_type: 'settlement', description: '', payee: '' })
    load()
  }

  async function addCustomerToCase(customerId: string) {
    const supabase = createClient()
    await supabase.from('legal_case_customers').insert({ case_id: caseId, customer_id: customerId })
    await logActivity('Customer added to case')
    setAddCustomerOpen(false)
    load()
  }

  async function removeCustomerFromCase(junctionId: string) {
    const supabase = createClient()
    await supabase.from('legal_case_customers').delete().eq('id', junctionId)
    load()
  }

  const totalPayments = payments.reduce((s, p) => s + p.amount, 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-600" />
    </div>
  )

  if (!legalCase) return <div className="text-center py-16 text-gray-400">Case not found.</div>

  const statusCfg = STATUS_CONFIG[legalCase.status] ?? STATUS_CONFIG.open

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 mt-1 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{legalCase.title}</h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded font-medium"
                style={{ background: '#f0ecfc', color: '#55249E' }}>
                {legalCase.case_id}
              </span>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Opened {new Date(legalCase.opened_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              {legalCase.assignee_name && ` · Assigned to ${legalCase.assignee_name}`}
            </p>
          </div>
        </div>

        {/* Update status */}
        <div className="flex items-center gap-2">
          <select value={legalCase.status}
            onChange={e => updateStatus(e.target.value)}
            disabled={updatingStatus}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {[
            { key: 'overview', label: 'Overview',  count: null },
            { key: 'tasks',    label: 'Tasks',     count: tasks.length },
            { key: 'comments', label: 'Notes',     count: comments.length },
            { key: 'payments', label: 'Payments',  count: payments.length },
            { key: 'activity', label: 'Activity',  count: null },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="p-5 space-y-5">
            {/* Case info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Case type',  value: legalCase.case_type.replace('_', ' '), capitalize: true },
                { label: 'Priority',   value: legalCase.priority,                    capitalize: true },
                { label: 'Assigned',   value: legalCase.assignee_name ?? '—',        capitalize: false },
                { label: 'Payments',   value: fmt(totalPayments),                    capitalize: false },
              ].map(m => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                  <p className={`text-sm font-semibold text-gray-800 ${m.capitalize ? 'capitalize' : ''}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {legalCase.description && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-500 mb-2">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{legalCase.description}</p>
              </div>
            )}

            {/* Customers */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Associated customers</h3>
                <button onClick={() => setAddCustomerOpen(!addCustomerOpen)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <Plus size={12} /> Add customer
                </button>
              </div>

              {addCustomerOpen && (
                <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <input value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Search customers..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2" />
                  <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
                    {allCustomers
                      .filter(c =>
                        !customers.find(cc => cc.customer_db_id === c.id) &&
                        (customerSearch === '' ||
                          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          c.customer_id.toLowerCase().includes(customerSearch.toLowerCase()))
                      )
                      .slice(0, 6)
                      .map(c => (
                        <button key={c.id} onClick={() => addCustomerToCase(c.id)}
                          className="w-full px-2 py-2 text-left text-sm hover:bg-white flex items-center justify-between">
                          <span className="font-medium text-gray-800">{c.name}</span>
                          <span className="text-xs text-gray-400">{c.customer_id}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {customers.length === 0 ? (
                <p className="text-sm text-gray-400">No customers associated with this case</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {customers.map(c => (
                    <div key={c.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium cursor-pointer hover:opacity-80"
                      style={{ background: '#f0ecfc', color: '#55249E', borderColor: '#d4c8f7' }}>
                      <button onClick={() => router.push(`/portal/accounts/customers/${c.customer_db_id}`)}>
                        {c.name} <span className="opacity-60 text-xs">({c.customer_id})</span>
                      </button>
                      <button onClick={() => removeCustomerFromCase(c.id)}
                        className="hover:opacity-60 ml-1">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TASKS TAB */}
        {activeTab === 'tasks' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Case tasks</h3>
              <button onClick={() => setTaskOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90"
                style={{ background: '#55249E' }}>
                <Plus size={12} /> Add task
              </button>
            </div>

            {taskOpen && (
              <form onSubmit={addTask} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Task title <span className="text-red-400">*</span></label>
                    <input required value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="What needs to be done?"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Assign to</label>
                    <select value={taskForm.assigned_to} onChange={e => setTaskForm(f => ({ ...f, assigned_to: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                      <option value="">Unassigned</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Due date</label>
                    <input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                    <input value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Optional details"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setTaskOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={savingTask}
                    className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50"
                    style={{ background: '#55249E' }}>
                    {savingTask ? 'Saving…' : 'Add task'}
                  </button>
                </div>
              </form>
            )}

            {tasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No tasks yet</p>
            ) : (
              <div className="space-y-2">
                {tasks.map(task => {
                  const taskStatusCfg = TASK_STATUS[task.status] ?? TASK_STATUS.open
                  return (
                    <div key={task.id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-start gap-3 min-w-0">
                        <button onClick={() => updateTaskStatus(task.id, task.status === 'done' ? 'open' : 'done')}
                          className={`mt-0.5 shrink-0 w-4 h-4 rounded border transition-colors ${task.status === 'done' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-brand-500'}`}>
                          {task.status === 'done' && <CheckCircle2 size={14} className="text-white" />}
                        </button>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {task.assignee_name && (
                              <span className="text-xs text-gray-400">→ {task.assignee_name}</span>
                            )}
                            {task.due_date && (
                              <span className="text-xs text-gray-400">
                                Due {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select value={task.status}
                          onChange={e => updateTaskStatus(task.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* COMMENTS TAB */}
        {activeTab === 'comments' && (
          <div className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Notes & comments</h3>

            {/* Add comment */}
            <form onSubmit={addComment} className="space-y-2">
              <textarea rows={3} value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Add a note or comment..."
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isInternal}
                    onChange={e => setIsInternal(e.target.checked)}
                    className="rounded" />
                  <span className="text-xs text-gray-500">Internal note (not visible externally)</span>
                </label>
                <button type="submit" disabled={savingComment || !commentText.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50"
                  style={{ background: '#55249E' }}>
                  {savingComment ? 'Saving…' : 'Add note'}
                </button>
              </div>
            </form>

            {/* Comments list */}
            {comments.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No comments yet</p>
            ) : (
              <div className="space-y-3">
                {comments.map(c => (
                  <div key={c.id}
                    className={`p-3 rounded-xl border ${c.is_internal ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{c.creator_name ?? 'Unknown'}</span>
                      <div className="flex items-center gap-2">
                        {c.is_internal && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Internal</span>
                        )}
                        <span className="text-xs text-gray-400">
                          {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Case payments</h3>
                <p className="text-xs text-gray-400 mt-0.5">Total: {fmt(totalPayments)}</p>
              </div>
              <button onClick={() => setPaymentOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90"
                style={{ background: '#55249E' }}>
                <Plus size={12} /> Record payment
              </button>
            </div>

            {paymentOpen && (
              <form onSubmit={addPayment} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount <span className="text-red-400">*</span></label>
                    <input type="number" required value={paymentForm.amount}
                      onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Date</label>
                    <input type="date" value={paymentForm.payment_date}
                      onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment type</label>
                    <select value={paymentForm.payment_type}
                      onChange={e => setPaymentForm(f => ({ ...f, payment_type: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                      {['settlement','legal_fee','court_fee','other'].map(t => (
                        <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Payee</label>
                    <input value={paymentForm.payee}
                      onChange={e => setPaymentForm(f => ({ ...f, payee: e.target.value }))}
                      placeholder="Who was paid?"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                    <input value={paymentForm.description}
                      onChange={e => setPaymentForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Details"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPaymentOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={savingPayment}
                    className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50"
                    style={{ background: '#55249E' }}>
                    {savingPayment ? 'Saving…' : 'Record payment'}
                  </button>
                </div>
              </form>
            )}

            {payments.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No payments recorded</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Ref','Amount','Date','Type','Payee','Description'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: '#f0ecfc', color: '#55249E' }}>
                          {p.payment_id}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-bold text-gray-800">{fmt(p.amount)}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 capitalize">{p.payment_type.replace('_', ' ')}</td>
                      <td className="px-3 py-3 text-xs text-gray-500">{p.payee ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px] truncate">{p.description ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Activity log</h3>
            {activity.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{a.action}</p>
                      {a.notes && <p className="text-xs text-gray-500 mt-0.5">{a.notes}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {a.creator_name ?? 'System'} · {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

