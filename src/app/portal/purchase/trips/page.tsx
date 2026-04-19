'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Download, Eye, ClipboardCheck, CheckCircle2, Trash2, Loader2, AlertTriangle, Filter, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ModifiedIndicator } from '@/components/trips/ModifiedIndicator'
import Modal from '@/components/ui/Modal'
import PermissionGate from '@/components/ui/PermissionGate'
import { usePermissions, can } from '@/lib/permissions/hooks'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'

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
  needs_review: boolean
  last_reviewed_at: string | null
  created_at: string
  supplier: { name: string } | null
  clearing_agent: { name: string } | null
  created_by_profile: { full_name: string | null; email: string } | null
  hasModifiedContainers?: boolean
  modified_containers?: { id: string; is_modified: boolean | null }[] | null
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
  const [approvalFilter, setApprovalFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [workflowTrip, setWorkflowTrip] = useState<Trip | null>(null)
  const [workflowType, setWorkflowType] = useState<'delete' | 'review' | 'completion' | 'approval' | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [submittingWorkflow, setSubmittingWorkflow] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  const { permissions, isSuperAdmin } = usePermissions()
  const canViewCosts = can(permissions, isSuperAdmin, 'view_costs')
  const canSelfApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('trips')
      .select(`
        *,
        supplier:suppliers(name),
        clearing_agent:clearing_agents(name),
        created_by_profile:profiles!trips_created_by_fkey(full_name, email),
        modified_containers:containers(id, is_modified)
      `)
      .order('created_at', { ascending: false })
    setTrips((data ?? []).map(t => ({
      ...t,
      hasModifiedContainers: ((t as any).modified_containers ?? []).some((c: any) => c.is_modified === true),
    })))
    setLoading(false)
  }, [])

  const loadDropdowns = useCallback(async () => {
    const supabase = createClient()
    const [{ data: sup }, { data: clr }, emp] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('is_active', true),
      supabase.from('clearing_agents').select('id, name').eq('is_active', true),
      getAdminProfiles(),
    ])
    setSuppliers(sup ?? [])
    setClearingAgents(clr ?? [])
    setEmployees(emp ?? [])
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user ? { id: user.id } : null)
      setCurrentUserId(user?.id ?? null)
    })
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

  async function submitWorkflow() {
    if (!assignee || !workflowType || !workflowTrip) return
    setSubmittingWorkflow(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const typeKeys = {
      delete: 'delete_approval',
      review: 'review_request',
      completion: 'completion_approval',
      approval: 'approval_request',
    }
    const typeLabels = {
      delete: 'Delete approval',
      review: 'Review request',
      completion: 'Completion approval',
      approval: 'Approval request',
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

  async function generateReport(type: 'filtered' | 'full') {
    setGeneratingReport(true)
    const data = type === 'filtered' ? filtered : trips

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Trips Report — Hydevest</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #fff; }
    .header { background: #55249E; color: white; padding: 32px 40px; }
    .header h1 { font-size: 24px; font-weight: 700; }
    .header p { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .meta { display: flex; gap: 32px; margin-top: 16px; flex-wrap: wrap; }
    .meta-item { font-size: 12px; opacity: 0.9; }
    .meta-item span { font-weight: 600; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 24px 40px; background: #f8f7ff; border-bottom: 1px solid #e8e0ff; }
    .summary-card { background: white; border-radius: 8px; padding: 16px; border: 1px solid #ede9f7; }
    .summary-card .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .summary-card .value { font-size: 20px; font-weight: 700; color: #55249E; }
    .content { padding: 24px 40px; }
    .section-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #55249E; color: white; }
    thead th { padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
    tbody tr { border-bottom: 1px solid #f0ebff; }
    tbody tr:nth-child(even) { background: #faf8ff; }
    tbody td { padding: 9px 12px; color: #374151; white-space: nowrap; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 600; }
    .badge-not_started { background: #f3f4f6; color: #4b5563; }
    .badge-in_progress { background: #eff6ff; color: #1d4ed8; }
    .badge-completed { background: #f0fdf4; color: #15803d; }
    .badge-not_approved { background: #fffbeb; color: #b45309; }
    .badge-reviewed { background: #eff6ff; color: #1d4ed8; }
    .badge-approved { background: #f0fdf4; color: #15803d; }
    .caution { display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; margin-left: 4px; }
    .footer { padding: 20px 40px; border-top: 1px solid #ede9f7; text-align: center; font-size: 11px; color: #9ca3af; margin-top: 24px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Trips Report</h1>
    <p>Hydevest Portal — ${type === 'filtered' ? 'Filtered View' : 'Full Report'}</p>
    <div class="meta">
      <div class="meta-item">Generated: <span>${new Date().toLocaleString()}</span></div>
      <div class="meta-item">Total trips: <span>${data.length}</span></div>
      ${type === 'filtered' && activeFilters > 0 ? `<div class="meta-item">Filters applied: <span>${activeFilters}</span></div>` : ''}
      ${statusFilter ? `<div class="meta-item">Status: <span>${statusFilter}</span></div>` : ''}
      ${approvalFilter ? `<div class="meta-item">Approval: <span>${approvalFilter}</span></div>` : ''}
      ${locationFilter ? `<div class="meta-item">Location: <span>${locationFilter}</span></div>` : ''}
      ${dateFrom || dateTo ? `<div class="meta-item">Date range: <span>${dateFrom || '—'} to ${dateTo || '—'}</span></div>` : ''}
    </div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Total trips</div>
      <div class="value">${data.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Not started</div>
      <div class="value">${data.filter(t => t.status === 'not_started').length}</div>
    </div>
    <div class="summary-card">
      <div class="label">In progress</div>
      <div class="value">${data.filter(t => t.status === 'in_progress').length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Completed</div>
      <div class="value">${data.filter(t => t.status === 'completed').length}</div>
    </div>
  </div>

  <div class="content">
    <div class="section-title">Trip details</div>
    <table>
      <thead>
        <tr>
          <th>Trip ID</th>
          <th>Title</th>
          <th>Location</th>
          <th>Supplier</th>
          <th>Clearing Agent</th>
          <th>Start Date</th>
          <th>End Date</th>
          <th>Status</th>
          <th>Approval</th>
          <th>Created By</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(t => `
        <tr>
          <td><strong style="color:#55249E">${t.trip_id}</strong></td>
          <td>
            <strong>${t.title}</strong>
            ${t.needs_review ? '<span class="caution" title="Modified since last review"></span>' : ''}
          </td>
          <td>${t.source_location ?? '—'}</td>
          <td>${t.supplier?.name ?? '—'}</td>
          <td>${t.clearing_agent?.name ?? '—'}</td>
          <td>${t.start_date ? new Date(t.start_date).toLocaleDateString() : '—'}</td>
          <td>${t.end_date ? new Date(t.end_date).toLocaleDateString() : '—'}</td>
          <td><span class="badge badge-${t.status}">${t.status.replace('_', ' ')}</span></td>
          <td><span class="badge badge-${t.approval_status}">${t.approval_status.replace('_', ' ')}</span></td>
          <td>${t.created_by_profile?.full_name ?? t.created_by_profile?.email ?? '—'}</td>
          <td>${new Date(t.created_at).toLocaleDateString()}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Hydevest Portal · Generated ${new Date().toLocaleString()} · Confidential
  </div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setGeneratingReport(false)
    setReportOpen(false)
  }

  const filtered = trips.filter(t => {
    const matchSearch = search === '' ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.trip_id.toLowerCase().includes(search.toLowerCase()) ||
      (t.supplier?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (t.source_location ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || t.status === statusFilter
    const matchApproval = approvalFilter === '' || t.approval_status === approvalFilter
    const matchLocation = locationFilter === '' ||
      (t.source_location ?? '').toLowerCase().includes(locationFilter.toLowerCase())
    const matchSupplier = supplierFilter === '' || t.supplier?.name === supplierFilter
    const matchDateFrom = dateFrom === '' || new Date(t.created_at) >= new Date(dateFrom)
    const matchDateTo = dateTo === '' || new Date(t.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchApproval && matchLocation && matchSupplier && matchDateFrom && matchDateTo
  })

  const activeFilters = [statusFilter, approvalFilter, locationFilter, supplierFilter, dateFrom, dateTo].filter(Boolean).length

  const uniqueLocations = [...new Set(trips.map(t => t.source_location).filter(Boolean))] as string[]
  const uniqueSuppliers = [...new Set(trips.map(t => t.supplier?.name).filter(Boolean))] as string[]

  const statusInfo = (s: string) => STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0]

  return (
    <PermissionGate permKey="trips.view">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Trips</h1>
          <p className="text-sm text-gray-400 mt-0.5">{trips.length} total trip{trips.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Create trip</span>
        </button>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, ID, supplier or location..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
                ${showFilters || activeFilters > 0
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={15} />
              Filters
              {activeFilters > 0 && (
                <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {activeFilters}
                </span>
              )}
            </button>
            <button onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm">
              <FileText size={15} /> Generate report
            </button>
            <button onClick={exportCSV}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <Download size={15} /> Export
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Approval</label>
              <select value={approvalFilter} onChange={e => setApprovalFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All approvals</option>
                <option value="not_approved">Not approved</option>
                <option value="reviewed">Reviewed</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Location</label>
              <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All locations</option>
                {uniqueLocations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Supplier</label>
              <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All suppliers</option>
                {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Created from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Created to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {activeFilters > 0 && (
              <div className="col-span-2 md:col-span-3 lg:col-span-6 flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''} · {activeFilters} filter{activeFilters !== 1 ? 's' : ''} active
                </p>
                <button
                  onClick={() => {
                    setStatusFilter('')
                    setApprovalFilter('')
                    setLocationFilter('')
                    setSupplierFilter('')
                    setDateFrom('')
                    setDateTo('')
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Trip ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Clearing Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Start</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">End</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Approval</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3 whitespace-nowrap">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-sm text-gray-400 whitespace-nowrap">
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{trip.trip_id}</span>
                        {trip.hasModifiedContainers && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 ml-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                              <line x1="12" y1="9" x2="12" y2="13"/>
                              <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            Modified
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 group-hover:text-brand-700 transition-colors">
                          {trip.title}
                        </span>
                        {trip.needs_review && (
                          <div className="relative group/tooltip">
                            <div className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 shrink-0">
                              <AlertTriangle size={10} className="text-amber-600" />
                            </div>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10">
                              Modified since last review
                              {trip.last_reviewed_at && (
                                <span className="text-gray-400"> · {new Date(trip.last_reviewed_at).toLocaleDateString()}</span>
                              )}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{trip.source_location ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{trip.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{trip.clearing_agent?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{trip.start_date ? new Date(trip.start_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{trip.end_date ? new Date(trip.end_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusInfo(trip.status).color}`}>
                        {statusInfo(trip.status).label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap
                        ${trip.approval_status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {trip.approval_status === 'approved' ? 'Approved' : 'Not approved'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                          <ClipboardCheck size={15} />
                        </button>

                        {/* Request approval */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setWorkflowTrip(trip); setWorkflowType('approval') }}
                          title="Request approval"
                          className={`p-1.5 rounded-lg transition-colors
                            ${trip.approval_status === 'approved'
                              ? 'text-green-500 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'}`}>
                          <CheckCircle2 size={15} />
                        </button>

                        {/* Request delete */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setWorkflowTrip(trip); setWorkflowType('delete') }}
                          disabled={deletingId === trip.id}
                          title="Request deletion"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          {deletingId === trip.id
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Trash2 size={15} />}
                        </button>

                        {/* Approval action for admin/super admin */}
                        {canSelfApprove && (trip.approval_status === 'pending' || trip.approval_status === 'pending_review') && (
                          <button
                            type="button"
                            onClick={async e => {
                              e.stopPropagation()
                              const supabase = createClient()
                              await supabase.from('trips').update({
                                approval_status: 'reviewed',
                                needs_review: false,
                                last_reviewed_at: new Date().toISOString(),
                                last_reviewed_by: currentUser?.id,
                              }).eq('id', trip.id)
                              load()
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100">
                            Review
                          </button>
                        )}
                        {canSelfApprove && trip.approval_status === 'reviewed' && (
                          <button
                            type="button"
                            onClick={async e => {
                              e.stopPropagation()
                              const supabase = createClient()
                              await supabase.from('trips').update({
                                approval_status: 'approved',
                              }).eq('id', trip.id)
                              load()
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700">
                            Approve
                          </button>
                        )}
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
          workflowType === 'approval' ? 'Request trip approval' :
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
                Send a review request for <span className="font-semibold">{workflowTrip?.trip_id}</span>. The reviewer will be able to review all sections and approve or reject from the trip page.
              </p>
            </div>
          )}
          {workflowType === 'approval' && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-700 font-medium">
                Send an approval request for <span className="font-semibold">{workflowTrip?.trip_id}</span>. The approver will mark the trip as approved after review.
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
                  : workflowType === 'approval'
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
              {submittingWorkflow ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Report modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
                <FileText size={16} className="text-brand-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Generate report</h2>
                <p className="text-xs text-gray-400">Choose which trips to include</p>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => setReportType('filtered')}
                className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all
                  ${reportType === 'filtered' ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-semibold ${reportType === 'filtered' ? 'text-brand-700' : 'text-gray-700'}`}>
                    Filtered view
                  </p>
                  {reportType === 'filtered' && (
                    <div className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {filtered.length} trip{filtered.length !== 1 ? 's' : ''}
                  {activeFilters > 0 ? ` · ${activeFilters} filter${activeFilters !== 1 ? 's' : ''} active` : ' · no filters applied'}
                </p>
              </button>
              <button onClick={() => setReportType('full')}
                className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all
                  ${reportType === 'full' ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-semibold ${reportType === 'full' ? 'text-brand-700' : 'text-gray-700'}`}>
                    Full report
                  </p>
                  {reportType === 'full' && (
                    <div className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{trips.length} total trip{trips.length !== 1 ? 's' : ''}</p>
              </button>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setReportOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => generateReport(reportType)} disabled={generatingReport}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                {generatingReport
                  ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                  : <><FileText size={14} /> Generate</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGate>
  )
}
