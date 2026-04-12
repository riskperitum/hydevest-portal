'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Download, Eye, Trash2, CheckCircle2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'

interface Trip {
  id: string
  trip_id: string
  title: string
  description: string | null
  source_location: string | null
  start_date: string | null
  end_date: string | null
  status: string
  approval_status: string
  created_at: string
  supplier: { name: string } | null
  clearing_agent: { name: string } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

interface Supplier { id: string; name: string }
interface ClearingAgent { id: string; name: string }

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started', color: 'bg-gray-100 text-gray-600' },
  { value: 'in_progress', label: 'In progress', color: 'bg-blue-50 text-blue-700' },
  { value: 'completed',   label: 'Completed',   color: 'bg-green-50 text-green-700' },
]

const blank = {
  title: '', description: '', source_location: '',
  supplier_id: '', clearing_agent_id: '',
  start_date: '', end_date: '',
}

export default function TripsPage() {
  const router = useRouter()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [clearingAgents, setClearingAgents] = useState<ClearingAgent[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [workflowTrip, setWorkflowTrip] = useState<Trip | null>(null)
  const [workflowType, setWorkflowType] = useState<'delete' | 'review' | 'completion' | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [submittingWorkflow, setSubmittingWorkflow] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('trips')
      .select(`
        *,
        supplier:suppliers(name),
        clearing_agent:clearing_agents(name),
        created_by_profile:profiles!trips_created_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })
    setTrips(data ?? [])
    setLoading(false)
  }, [])

  const loadDropdowns = useCallback(async () => {
    const supabase = createClient()
    const [{ data: sup }, { data: clr }, { data: emp }] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('is_active', true),
      supabase.from('clearing_agents').select('id, name').eq('is_active', true),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
    ])
    setSuppliers(sup ?? [])
    setClearingAgents(clr ?? [])
    setEmployees(emp ?? [])
    const supabase2 = createClient()
    const { data: { user } } = await supabase2.auth.getUser()
    setCurrentUserId(user?.id ?? null)
  }, [])

  useEffect(() => { load(); loadDropdowns() }, [load, loadDropdowns])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('trips').insert({
      ...form,
      supplier_id: form.supplier_id || null,
      clearing_agent_id: form.clearing_agent_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      created_by: user?.id,
    })
    setOpen(false)
    setForm(blank)
    setSaving(false)
    load()
  }

  async function handleDelete(e: React.MouseEvent, trip: Trip) {
    e.stopPropagation()
    setWorkflowTrip(trip)
    setWorkflowType('delete')
  }

  async function submitWorkflow() {
    if (!assignee || !workflowType || !workflowTrip) return
    setSubmittingWorkflow(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const typeKeys = {
      delete: 'delete_approval',
      review: 'review_request',
      completion: 'completion_approval',
    }
    const typeLabels = {
      delete: 'Delete approval',
      review: 'Review request',
      completion: 'Completion approval',
    }

    const { data: task } = await supabase.from('tasks').insert({
      type: typeKeys[workflowType],
      title: `${typeLabels[workflowType]}: ${workflowTrip.trip_id}`,
      description: workflowNote || `${typeLabels[workflowType]} for trip ${workflowTrip.trip_id} — ${workflowTrip.title}`,
      module: 'trips',
      record_id: workflowTrip.id,
      record_ref: workflowTrip.trip_id,
      requested_by: user?.id,
      assigned_to: assignee,
      priority: workflowType === 'delete' ? 'high' : 'normal',
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: assignee,
      type: `task_${typeKeys[workflowType]}`,
      title: `New task: ${typeLabels[workflowType]}`,
      message: `${workflowTrip.trip_id} — ${workflowTrip.title}`,
      task_id: task?.id,
      record_id: workflowTrip.id,
      record_ref: workflowTrip.trip_id,
      module: 'trips',
    })

    setSubmittingWorkflow(false)
    setWorkflowTrip(null)
    setWorkflowType(null)
    setWorkflowNote('')
    setAssignee('')
    load()
  }

  function exportCSV() {
    const headers = ['Trip ID', 'Title', 'Location', 'Supplier', 'Clearing Agent', 'Start Date', 'End Date', 'Status', 'Approval']
    const rows = filtered.map(t => [
      t.trip_id, t.title, t.source_location ?? '',
      t.supplier?.name ?? '', t.clearing_agent?.name ?? '',
      t.start_date ?? '', t.end_date ?? '', t.status, t.approval_status
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'trips.csv'; a.click()
  }

  const filtered = trips.filter(t => {
    const matchSearch = search === '' ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.trip_id.toLowerCase().includes(search.toLowerCase()) ||
      (t.supplier?.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || t.status === statusFilter
    return matchSearch && matchStatus
  })

  const statusInfo = (s: string) => STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Trips</h1>
          <p className="text-sm text-gray-400 mt-0.5">{trips.length} total trip{trips.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
          <Plus size={16} /> Create trip
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, ID or supplier..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={exportCSV}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <Download size={15} /> Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Trip ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Clearing Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Start</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">End</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Approval</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-sm text-gray-400">
                    No trips found. Create your first trip.
                  </td>
                </tr>
              ) : (
                filtered.map(trip => (
                  <tr
                    key={trip.id}
                    onClick={() => router.push(`/portal/purchase/trips/${trip.id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{trip.trip_id}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 group-hover:text-brand-700 transition-colors">{trip.title}</td>
                    <td className="px-4 py-3 text-gray-500">{trip.source_location ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.clearing_agent?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{trip.start_date ? new Date(trip.start_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{trip.end_date ? new Date(trip.end_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusInfo(trip.status).color}`}>
                        {statusInfo(trip.status).label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap
                        ${trip.approval_status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {trip.approval_status === 'approved' ? 'Approved' : 'Not approved'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {/* View */}
                        <button
                          onClick={() => router.push(`/portal/purchase/trips/${trip.id}`)}
                          title="View trip"
                          className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                          <Eye size={15} />
                        </button>

                        {/* Request review */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setWorkflowTrip(trip); setWorkflowType('review') }}
                          title="Request review"
                          className={`p-1.5 rounded-lg transition-colors
                            ${trip.approval_status === 'reviewed'
                              ? 'text-green-500 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-brand-50 hover:text-brand-600'}`}>
                          <CheckCircle2 size={15} />
                        </button>

                        {/* Request delete */}
                        <button
                          onClick={(e) => handleDelete(e, trip)}
                          disabled={deletingId === trip.id}
                          title="Request deletion"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          {deletingId === trip.id
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Trash2 size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create trip modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Create trip" description="Fill in the trip details below" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-400">*</span></label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. Lakongo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source location</label>
              <input value={form.source_location} onChange={e => setForm(f => ({ ...f, source_location: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. Colombia" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Trip description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Select supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clearing agent</label>
              <select value={form.clearing_agent_id} onChange={e => setForm(f => ({ ...f, clearing_agent_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Select clearing agent</option>
                {clearingAgents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create trip'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Workflow modal */}
      <Modal
        open={!!workflowTrip && !!workflowType}
        onClose={() => { setWorkflowTrip(null); setWorkflowType(null); setWorkflowNote(''); setAssignee('') }}
        title={
          workflowType === 'delete' ? 'Request trip deletion' :
          workflowType === 'review' ? 'Request trip review' :
          'Request trip completion'
        }
        description="Select a user to assign this task to"
        size="sm"
      >
        <div className="space-y-4">
          {workflowType === 'delete' && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700 font-medium">
                This will send a delete approval request for <span className="font-semibold">{workflowTrip?.trip_id}</span>. The trip will only be deleted after the assigned user approves it.
              </p>
            </div>
          )}
          {workflowType === 'review' && (
            <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
              <p className="text-xs text-brand-700 font-medium">
                Send a review request for <span className="font-semibold">{workflowTrip?.trip_id}</span>. The reviewer will be able to approve or reject from the trip page.
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assign to <span className="text-red-400">*</span>
            </label>
            <select required value={assignee} onChange={e => setAssignee(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">Select user...</option>
              {employees
                .filter(e => e.id !== currentUserId)
                .map(e => (
                  <option key={e.id} value={e.id}>
                    {e.full_name ?? e.email}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <textarea rows={2} value={workflowNote} onChange={e => setWorkflowNote(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Add context for the assignee..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setWorkflowTrip(null); setWorkflowType(null); setWorkflowNote(''); setAssignee('') }}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={submitWorkflow} disabled={submittingWorkflow || !assignee}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2
                ${workflowType === 'delete'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
              {submittingWorkflow ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit request'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
