'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Check, X, Pencil,
  Trash2, CheckCircle2, Eye, Activity,
  AlertTriangle, Upload, FileText
} from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import AmountInput from '@/components/ui/AmountInput'

interface Expense {
  id: string
  expense_id: string
  main_type: string
  category: string
  description: string
  amount: number
  currency: string
  exchange_rate: number
  amount_ngn: number
  expense_date: string
  file_urls: { url: string; name: string; type: string }[]
  approval_status: string
  needs_approval: boolean
  last_approved_at: string | null
  last_approved_by: string | null
  created_by: string | null
  created_at: string
  creator: { full_name: string | null; email: string } | null
  last_approver: { full_name: string | null; email: string } | null
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

const CATEGORIES = [
  'Transport', 'Accommodation', 'Meals', 'Office Supplies',
  'Utilities', 'Professional Services', 'Marketing', 'Equipment',
  'Maintenance', 'Customs & Duties', 'Port Charges', 'Logistics',
  'Communication', 'Banking & Finance', 'Miscellaneous',
]

const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CNY']

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Transport':             ['fuel', 'transport', 'vehicle', 'car', 'truck', 'logistics', 'freight', 'shipping', 'delivery'],
  'Accommodation':         ['hotel', 'accommodation', 'lodging', 'stay', 'apartment'],
  'Meals':                 ['food', 'lunch', 'dinner', 'breakfast', 'meal', 'restaurant', 'catering'],
  'Office Supplies':       ['office', 'stationery', 'paper', 'printer', 'supplies'],
  'Utilities':             ['electricity', 'water', 'internet', 'utility', 'power', 'generator', 'diesel'],
  'Professional Services': ['legal', 'consultant', 'lawyer', 'accountant', 'audit', 'professional'],
  'Marketing':             ['marketing', 'advert', 'promotion', 'social media', 'brand'],
  'Equipment':             ['equipment', 'machine', 'device', 'tool', 'hardware', 'computer', 'laptop'],
  'Maintenance':           ['repair', 'maintenance', 'fix', 'service', 'parts'],
  'Customs & Duties':      ['customs', 'duty', 'tariff', 'import', 'export', 'clearance'],
  'Port Charges':          ['port', 'terminal', 'demurrage', 'berth', 'dock'],
  'Logistics':             ['warehouse', 'storage', 'container', 'packing', 'loading'],
  'Communication':         ['phone', 'airtime', 'data', 'telecom', 'mobile', 'call'],
  'Banking & Finance':     ['bank', 'transfer', 'fee', 'charge', 'interest', 'commission', 'forex'],
}

function detectCategory(description: string): string {
  const lower = description.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat
  }
  return 'Miscellaneous'
}

export default function ExpenseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const expenseId = params.id as string

  const [expense, setExpense] = useState<Expense | null>(null)
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details')

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    description: '', category: '', amount: '',
    currency: 'NGN', exchange_rate: '1', expense_date: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)

  // Workflow
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowType, setWorkflowType] = useState<'approval' | 'delete' | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [submittingWorkflow, setSubmittingWorkflow] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Attachments
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const editAutoCategory = editForm.description.length > 2 ? detectCategory(editForm.description) : ''
  const editEffectiveCategory = editForm.category || editAutoCategory
  const editAmountNgn = editForm.currency === 'NGN'
    ? parseFloat(editForm.amount) || 0
    : (parseFloat(editForm.amount) || 0) * (parseFloat(editForm.exchange_rate) || 1)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: exp }, { data: al }] = await Promise.all([
      supabase.from('expenses')
        .select(`*,
          creator:profiles!expenses_created_by_fkey(full_name, email),
          last_approver:profiles!expenses_last_approved_by_fkey(full_name, email)
        `)
        .eq('id', expenseId)
        .single(),
      supabase.from('expense_activity_log')
        .select('*, performer:profiles!expense_activity_log_performed_by_fkey(full_name, email)')
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: false }),
    ])
    setExpense(exp)
    setActivityLogs(al ?? [])
    setLoading(false)
  }, [expenseId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
    getAdminProfiles().then(data => setEmployees(data))
  }, [load])

  const fmt = (n: number, curr = 'NGN') => {
    const symbol = curr === 'NGN' ? '₦' : curr + ' '
    return `${symbol}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  async function logActivity(action: string, fieldName?: string, oldValue?: string, newValue?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('expense_activity_log').insert({
      expense_id: expenseId, action,
      field_name: fieldName ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      performed_by: user?.id,
    })
  }

  function openEdit() {
    if (!expense) return
    setEditForm({
      description: expense.description,
      category: expense.category,
      amount: expense.amount.toString(),
      currency: expense.currency,
      exchange_rate: expense.exchange_rate.toString(),
      expense_date: expense.expense_date.slice(0, 10),
    })
    setEditing(true)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!expense) return
    setSavingEdit(true)
    const supabase = createClient()
    const wasApproved = expense.approval_status === 'approved'

    await supabase.from('expenses').update({
      description: editForm.description,
      category: editEffectiveCategory,
      amount: parseFloat(editForm.amount),
      currency: editForm.currency,
      exchange_rate: parseFloat(editForm.exchange_rate) || 1,
      amount_ngn: editAmountNgn,
      expense_date: editForm.expense_date,
      ...(wasApproved ? { needs_approval: true, approval_status: 'pending' } : {}),
    }).eq('id', expenseId)

    await logActivity(
      wasApproved ? 'Expense modified after approval — needs re-approval' : 'Expense updated',
      'expense', JSON.stringify({
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
      }),
      JSON.stringify({
        description: editForm.description,
        amount: editForm.amount,
        category: editEffectiveCategory,
      })
    )

    setSavingEdit(false)
    setEditing(false)
    load()
  }

  async function handleUploadAttachments(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const supabase = createClient()
    const newFiles: { url: string; name: string; type: string }[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `expenses/${expenseId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
        newFiles.push({ url: publicUrl, name: file.name, type: file.type })
      }
    }
    const existing = expense?.file_urls ?? []
    const updated = [...existing, ...newFiles]
    await supabase.from('expenses').update({ file_urls: updated }).eq('id', expenseId)
    await logActivity('Attachments uploaded', 'file_urls', '', newFiles.map(f => f.name).join(', '))
    setUploading(false)
    setUploadFiles([])
    load()
  }

  async function handleDeleteAttachment(index: number) {
    if (!expense) return
    const supabase = createClient()
    const updated = expense.file_urls.filter((_, i) => i !== index)
    await supabase.from('expenses').update({ file_urls: updated }).eq('id', expenseId)
    await logActivity('Attachment removed', 'file_urls', expense.file_urls[index].name, '')
    load()
  }

  async function submitWorkflow() {
    if (!assignee || !workflowType || !expense) return
    setSubmittingWorkflow(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const typeKeys = { approval: 'approval_request', delete: 'delete_approval' }
    const typeLabels = { approval: 'Approval request', delete: 'Delete approval' }

    const { data: task } = await supabase.from('tasks').insert({
      type: typeKeys[workflowType],
      title: `${typeLabels[workflowType]}: ${expense.expense_id}`,
      description: workflowNote || `${typeLabels[workflowType]} for expense ${expense.expense_id}`,
      module: 'expenses',
      record_id: expenseId,
      record_ref: expense.expense_id,
      requested_by: user?.id,
      assigned_to: assignee,
      priority: workflowType === 'delete' ? 'high' : 'normal',
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: assignee,
      type: `task_${typeKeys[workflowType]}`,
      title: `New task: ${typeLabels[workflowType]}`,
      message: `${expense.expense_id} — ${expense.description}`,
      task_id: task?.id,
      record_id: expenseId,
      record_ref: expense.expense_id,
      module: 'expenses',
    })

    await logActivity(`${typeLabels[workflowType]} requested`, 'workflow', '', assignee)
    setSubmittingWorkflow(false)
    setWorkflowOpen(false)
    setWorkflowType(null)
    setWorkflowNote('')
    setAssignee('')
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!expense) return <div className="text-center py-16 text-gray-400">Expense not found.</div>

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/expensify"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{expense.expense_id}</span>
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">{expense.category}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border
                ${expense.approval_status === 'approved'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                {expense.approval_status === 'approved' ? '✓ Approved' : 'Pending approval'}
              </span>
              {expense.needs_approval && expense.approval_status !== 'pending' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Modified since last approval
                </span>
              )}
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mt-1 line-clamp-1">{expense.description}</h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
              <span>Created by <span className="text-gray-600">{expense.creator?.full_name ?? expense.creator?.email ?? '—'}</span></span>
              <span>on {new Date(expense.created_at).toLocaleDateString()}</span>
              {expense.last_approved_at && (
                <>
                  <span className="text-gray-200">·</span>
                  <span>Last approved by <span className="text-gray-600">{expense.last_approver?.full_name ?? expense.last_approver?.email ?? '—'}</span></span>
                  <span>on {new Date(expense.last_approved_at).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={openEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
            <Pencil size={13} /> Edit
          </button>
          <button onClick={() => { setWorkflowType('approval'); setWorkflowOpen(true) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
            <CheckCircle2 size={13} /> Request approval
          </button>
          <button onClick={() => { setWorkflowType('delete'); setWorkflowOpen(true) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {/* Modified after approval warning */}
      {expense.needs_approval && expense.approval_status === 'pending' && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">This expense requires approval</p>
            <p className="text-xs text-amber-600 mt-0.5">Use the Request approval button to send for review.</p>
          </div>
        </div>
      )}

      {/* Financial summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Amount', value: fmt(expense.amount, expense.currency), color: 'text-brand-700' },
          { label: 'Currency', value: expense.currency, color: 'text-gray-900' },
          { label: 'Exchange rate', value: expense.currency === 'NGN' ? '1.00' : expense.exchange_rate.toLocaleString(), color: 'text-gray-900' },
          { label: 'Amount (NGN)', value: fmt(expense.amount_ngn), color: 'text-green-700' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-lg font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'details', label: 'Expense details' },
            { key: 'activity', label: 'Activity log', count: activityLogs.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as 'details' | 'activity')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'details' && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Expense ID', value: expense.expense_id },
                { label: 'Category', value: expense.category },
                { label: 'Type', value: 'Expense' },
                { label: 'Expense date', value: new Date(expense.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) },
                { label: 'Main type', value: 'Other expenses' },
                { label: 'Created', value: new Date(expense.created_at).toLocaleDateString() },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{item.label}</p>
                  <p className="text-sm font-medium text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">{expense.description}</p>
            </div>

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Attachments</p>
              </div>
              {expense.file_urls?.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {expense.file_urls.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <FileText size={14} className="text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={f.url} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                          <Eye size={13} />
                        </a>
                        <button type="button" onClick={() => handleDeleteAttachment(i)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-3">No attachments yet.</p>
              )}
              <div className="flex items-center gap-3">
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-colors cursor-pointer">
                  <Upload size={15} />
                  <span>{uploadFiles.length > 0 ? `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected` : 'Add attachments'}</span>
                  <input type="file" multiple className="hidden"
                    onChange={e => setUploadFiles(Array.from(e.target.files ?? []))} />
                </label>
                {uploadFiles.length > 0 && (
                  <button type="button" onClick={() => handleUploadAttachments(uploadFiles)} disabled={uploading}
                    className="px-4 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 shrink-0">
                    {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : 'Upload'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="p-5">
            {activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Activity size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No activity recorded yet.</p>
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
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {log.old_value && <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded line-through max-w-[200px] truncate">{log.old_value}</span>}
                          {log.old_value && log.new_value && <span className="text-xs text-gray-400">→</span>}
                          {log.new_value && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded max-w-[200px] truncate">{log.new_value}</span>}
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
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit expense" size="md">
        <form onSubmit={handleEdit} className="space-y-4">
          {expense.approval_status === 'approved' && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-700 font-medium flex items-center gap-2">
                <AlertTriangle size={13} />
                This expense is approved. Editing will reset it to pending approval.
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description <span className="text-red-400">*</span></label>
            <input required value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Category</label>
              {editAutoCategory && !editForm.category && (
                <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">Auto: {editAutoCategory}</span>
              )}
            </div>
            <select value={editForm.category || editAutoCategory}
              onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount</label>
              <AmountInput value={editForm.amount} onChange={v => setEditForm(f => ({ ...f, amount: v }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <select value={editForm.currency}
                onChange={e => setEditForm(f => ({ ...f, currency: e.target.value, exchange_rate: e.target.value === 'NGN' ? '1' : f.exchange_rate }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {editForm.currency !== 'NGN' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Exchange rate</label>
                <AmountInput value={editForm.exchange_rate} onChange={v => setEditForm(f => ({ ...f, exchange_rate: v }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) — auto</label>
                <div className="px-3 py-2 text-sm rounded-lg border bg-green-50 border-green-200 text-green-700 font-semibold">
                  {editAmountNgn > 0 ? `₦${editAmountNgn.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Expense date</label>
            <input type="date" value={editForm.expense_date}
              onChange={e => setEditForm(f => ({ ...f, expense_date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditing(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingEdit}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingEdit ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Workflow modal */}
      <Modal open={workflowOpen}
        onClose={() => { setWorkflowOpen(false); setWorkflowType(null); setWorkflowNote(''); setAssignee('') }}
        title={workflowType === 'delete' ? 'Request deletion' : 'Request approval'}
        size="md">
        <div className="space-y-4">
          {workflowType === 'delete' && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700 font-medium">The expense will only be deleted after the assigned user approves it.</p>
            </div>
          )}
          {workflowType === 'approval' && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <p className="text-xs text-green-700 font-medium">Once approved, this expense will be marked as approved.</p>
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
                ${workflowType === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}>
              {submittingWorkflow ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit request'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

