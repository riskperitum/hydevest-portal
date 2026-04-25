'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions, can } from '@/lib/permissions/hooks'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'
import {
  Scale, FileText, DollarSign, Plus, Search,
  AlertCircle, Clock, CheckCircle2, RefreshCw,
  Upload, ChevronRight, Users, Trash2, Shield, X, Eye, Loader2, Paperclip,
} from 'lucide-react'

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
  customer_count: number
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  open:          { label: 'Open',          color: 'bg-blue-50 text-blue-700',    dot: 'bg-blue-500'   },
  in_progress:   { label: 'In progress',   color: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-500'  },
  pending_court: { label: 'Pending court', color: 'bg-purple-50 text-purple-700',dot: 'bg-purple-500' },
  police_arrest: { label: 'Police arrest', color: 'bg-red-50 text-red-700',    dot: 'bg-red-600'    },
  settled:       { label: 'Settled',       color: 'bg-green-50 text-green-700',  dot: 'bg-green-500'  },
  closed:        { label: 'Closed',        color: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400'   },
  won:           { label: 'Won',           color: 'bg-green-50 text-green-700',  dot: 'bg-green-600'  },
  lost:          { label: 'Lost',          color: 'bg-red-50 text-red-600',      dot: 'bg-red-500'    },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'bg-gray-100 text-gray-500'   },
  normal: { label: 'Normal', color: 'bg-blue-50 text-blue-600'    },
  high:   { label: 'High',   color: 'bg-amber-50 text-amber-700'  },
  urgent: { label: 'Urgent', color: 'bg-red-50 text-red-600'      },
}

const TYPE_LABELS: Record<string, string> = {
  debt_recovery:     'Debt recovery',
  contract_dispute:  'Contract dispute',
  property:          'Property',
  other:             'Other',
}

export default function LegalPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'cases' | 'documents' | 'payments' | 'requests'>('cases')
  const [cases, setCases]         = useState<LegalCase[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')

  const [summary, setSummary] = useState({
    total: 0, open: 0, in_progress: 0, settled: 0,
  })

  const { permissions, isSuperAdmin } = usePermissions()
  const canCreateCases = isSuperAdmin || can(permissions, isSuperAdmin, 'legal.create_cases')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data } = await supabase
      .from('legal_cases')
      .select(`
        id, case_id, title, description, case_type, status, priority,
        opened_date, closed_date, created_at,
        assignee:profiles!legal_cases_assigned_to_fkey(full_name, email),
        customers:legal_case_customers(id)
      `)
      .order('created_at', { ascending: false })

    const mapped: LegalCase[] = (data ?? []).map(c => ({
      id:             c.id,
      case_id:        c.case_id,
      title:          c.title,
      description:    c.description,
      case_type:      c.case_type,
      status:         c.status,
      priority:       c.priority,
      opened_date:    c.opened_date,
      closed_date:    c.closed_date,
      assigned_to:    null,
      assignee_name:  (c.assignee as any)?.full_name ?? (c.assignee as any)?.email ?? null,
      customer_count: Array.isArray(c.customers) ? c.customers.length : 0,
      created_at:     c.created_at,
    }))

    setCases(mapped)
    setSummary({
      total:       mapped.length,
      open:        mapped.filter(c => c.status === 'open').length,
      in_progress: mapped.filter(c => c.status === 'in_progress').length,
      settled:     mapped.filter(c => c.status === 'settled' || c.status === 'won' || c.status === 'closed').length,
    })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = cases.filter(c => {
    const matchSearch = search === '' ||
      c.case_id.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.assignee_name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const tabs = [
    { key: 'cases',     label: 'Cases',           icon: Scale    },
    { key: 'documents', label: 'Documents',        icon: FileText },
    { key: 'payments',  label: 'Legal payments',   icon: DollarSign },
    { key: 'requests',  label: 'Payment requests', icon: Clock },
  ]

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Legal</h1>
          <p className="text-sm text-gray-400 mt-0.5">Case management, documents and legal payments</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateCases && (
            <button onClick={() => router.push('/portal/legal/cases/create')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90"
              style={{ background: '#55249E' }}>
              <Plus size={14} /> New case
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total cases',   value: summary.total,       color: 'text-gray-800',  bg: 'bg-gray-50',   icon: <Scale size={15} className="text-gray-500" />        },
          { label: 'Open',          value: summary.open,        color: 'text-blue-700',  bg: 'bg-blue-50',   icon: <AlertCircle size={15} className="text-blue-600" />   },
          { label: 'In progress',   value: summary.in_progress, color: 'text-amber-700', bg: 'bg-amber-50',  icon: <Clock size={15} className="text-amber-600" />        },
          { label: 'Resolved',      value: summary.settled,     color: 'text-green-700', bg: 'bg-green-50',  icon: <CheckCircle2 size={15} className="text-green-600" /> },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap
                  ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={14} /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* CASES TAB */}
        {activeTab === 'cases' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search cases..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <select value={statusFilter} onChange={e => setStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All statuses</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <RefreshCw size={14} />
              </button>
            </div>

            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Scale size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No cases found</p>
                {canCreateCases && (
                  <button onClick={() => router.push('/portal/legal/cases/create')}
                    className="text-xs font-medium text-brand-600 hover:underline">
                    Create first case
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Case ID','Title','Type','Customers','Priority','Status','Assigned to','Opened',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(c => {
                      const statusCfg   = STATUS_CONFIG[c.status]   ?? STATUS_CONFIG.open
                      const priorityCfg = PRIORITY_CONFIG[c.priority] ?? PRIORITY_CONFIG.normal
                      return (
                        <tr key={c.id}
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/portal/legal/cases/${c.id}`)}>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="font-mono text-xs px-2 py-0.5 rounded font-medium"
                              style={{ background: '#f0ecfc', color: '#55249E' }}>
                              {c.case_id}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-sm font-medium text-gray-900 max-w-[200px] truncate">{c.title}</p>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="text-xs text-gray-500">{TYPE_LABELS[c.case_type] ?? c.case_type}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Users size={12} className="text-gray-400" />
                              <span className="text-xs text-gray-600">{c.customer_count}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityCfg.color}`}>
                              {priorityCfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                            {c.assignee_name ?? '—'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-400">
                            {new Date(c.opened_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-3">
                            <ChevronRight size={14} className="text-gray-300" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && <LegalDocumentsTab />}
        {activeTab === 'payments' && <LegalPaymentsTab />}
        {activeTab === 'requests' && <PaymentRequestsTab />}
      </div>
    </div>
  )
}

// ── DOCUMENTS TAB ─────────────────────────────────────────────────────────────
function LegalDocumentsTab() {
  const { permissions, isSuperAdmin } = usePermissions()
  const canManageDocs = isSuperAdmin || can(permissions, isSuperAdmin, 'legal.manage_documents')

  const [docTab, setDocTab]           = useState<'internal' | 'agreements'>('internal')
  const [docs, setDocs]               = useState<any[]>([])
  const [agreements, setAgreements]   = useState<any[]>([])
  const [customers, setCustomers]     = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [uploadOpen, setUploadOpen]   = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [docForm, setDocForm]         = useState({ title: '', description: '', category: 'general', customer_id: '' })
  const [file, setFile]               = useState<File | null>(null)

  useEffect(() => { loadDocs() }, [docTab])

  async function loadDocs() {
    setLoading(true)
    const supabase = createClient()
    if (docTab === 'internal') {
      const { data } = await supabase.from('legal_documents').select(`
        id, title, description, category, file_url, file_name, file_size, file_type, created_at,
        creator:profiles!legal_documents_created_by_fkey(full_name, email)
      `).order('created_at', { ascending: false })
      setDocs(data ?? [])
    } else {
      const [{ data: agreeData }, { data: custData }] = await Promise.all([
        supabase.from('legal_customer_agreements').select(`
          id, title, description, signed_date, file_url, file_name, file_size, created_at,
          customer:customers!legal_customer_agreements_customer_id_fkey(name, customer_id),
          creator:profiles!legal_customer_agreements_created_by_fkey(full_name, email)
        `).order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name, customer_id').eq('is_active', true).order('name'),
      ])
      setAgreements(agreeData ?? [])
      setCustomers(custData ?? [])
    }
    setLoading(false)
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !docForm.title) return
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ext  = file.name.split('.').pop()
    const path = `legal/${docTab}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
    if (uploadError) { alert(`Upload failed: ${uploadError.message}`); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)

    if (docTab === 'internal') {
      await supabase.from('legal_documents').insert({
        title: docForm.title, description: docForm.description || null,
        category: docForm.category, file_url: urlData.publicUrl,
        file_name: file.name, file_size: file.size, file_type: file.type,
        created_by: user?.id,
      })
    } else {
      await supabase.from('legal_customer_agreements').insert({
        customer_id: docForm.customer_id, title: docForm.title,
        description: docForm.description || null, file_url: urlData.publicUrl,
        file_name: file.name, file_size: file.size, file_type: file.type,
        created_by: user?.id,
      })
    }
    setUploading(false)
    setUploadOpen(false)
    setDocForm({ title: '', description: '', category: 'general', customer_id: '' })
    setFile(null)
    loadDocs()
  }

  const CATEGORY_OPTIONS = ['general','policy','template','agreement','other']

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[{ key: 'internal', label: 'Internal documents' }, { key: 'agreements', label: 'Customer agreements' }].map(t => (
            <button key={t.key} onClick={() => setDocTab(t.key as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                ${docTab === t.key ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={docTab === t.key ? { background: '#55249E' } : {}}>
              {t.label}
            </button>
          ))}
        </div>
        {canManageDocs && (
          <button onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90"
            style={{ background: '#55249E' }}>
            <Upload size={12} /> Upload document
          </button>
        )}
      </div>

      {canManageDocs && uploadOpen && (
        <form onSubmit={handleUpload} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Title <span className="text-red-400">*</span></label>
              <input required value={docForm.title} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Document title"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {docTab === 'internal' ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
                <select value={docForm.category} onChange={e => setDocForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Customer <span className="text-red-400">*</span></label>
                <select required value={docForm.customer_id} onChange={e => setDocForm(f => ({ ...f, customer_id: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_id})</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
              <input value={docForm.description} onChange={e => setDocForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">File <span className="text-red-400">*</span></label>
              <input type="file" required onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setUploadOpen(false)}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={uploading}
              className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ background: '#55249E' }}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {docTab === 'internal'
                ? ['Title','Category','Description','Uploaded by','Date',''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400">{h}</th>
                  ))
                : ['Title','Customer','Description','Uploaded by','Date',''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400">{h}</th>
                  ))
              }
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(docTab === 'internal' ? docs : agreements).map((doc: any) => (
              <tr key={doc.id} className="hover:bg-gray-50/50">
                <td className="px-3 py-3">
                  <p className="text-xs font-medium text-gray-800">{doc.title}</p>
                  {doc.file_name && <p className="text-xs text-gray-400">{doc.file_name}</p>}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500 capitalize">
                  {docTab === 'internal' ? doc.category : (
                    <div>
                      <p className="font-medium text-gray-700">{doc.customer?.name}</p>
                      <p className="text-gray-400">{doc.customer?.customer_id}</p>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500 max-w-[180px] truncate">{doc.description ?? '—'}</td>
                <td className="px-3 py-3 text-xs text-gray-500">{doc.creator?.full_name ?? doc.creator?.email ?? '—'}</td>
                <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-3 py-3">
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium text-brand-600 hover:underline">View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── LEGAL PAYMENTS TAB ────────────────────────────────────────────────────────
function LegalPaymentsTab() {
  const { permissions, isSuperAdmin } = usePermissions()
  const canManagePayments = isSuperAdmin || can(permissions, isSuperAdmin, 'legal.manage_payments')
  const canApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'legal.*') || can(permissions, isSuperAdmin, 'legal.approve')
  const canSelfApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*') || canApprove

  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    amount: '', payment_date: new Date().toISOString().split('T')[0],
    category: 'other', description: '', payee: '', notes: '',
  })

  // File upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string; type: string }[]>([])
  const [uploading, setUploading] = useState(false)

  // Workflow state
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowType, setWorkflowType] = useState<'approve' | 'delete' | null>(null)
  const [workflowPayment, setWorkflowPayment] = useState<any | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [selfApprove, setSelfApprove] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Notes modal
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [notesContent, setNotesContent] = useState<{ title: string; content: string } | null>(null)

  // Attachments modal
  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false)
  const [attachmentsList, setAttachmentsList] = useState<{ url: string; name: string; type: string }[]>([])

  useEffect(() => {
    void loadPayments()
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
      const emps = await getAdminProfiles()
      setEmployees(emps)
    }
    void init()
  }, [])

  async function loadPayments() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('legal_payments').select(`
      id, payment_id, amount, payment_date, category, description, payee, notes,
      file_urls, status, is_modified, approved_at, created_at, created_by,
      creator:profiles!legal_payments_created_by_fkey(full_name, email)
    `).order('payment_date', { ascending: false })
    setPayments(data ?? [])
    setLoading(false)
  }

  async function handleUpload(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const supabase = createClient()
    const uploaded: { url: string; name: string; type: string }[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `legal-payments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
        uploaded.push({ url: publicUrl, name: file.name, type: file.type })
      }
    }
    setUploadedFiles(prev => [...prev, ...uploaded])
    setUploading(false)
    setUploadFiles([])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const seq = Date.now().toString().slice(-5)
    await supabase.from('legal_payments').insert({
      payment_id: `LEG-${seq}`,
      amount: parseFloat(form.amount),
      payment_date: form.payment_date,
      category: form.category,
      description: form.description || null,
      payee: form.payee || null,
      notes: form.notes || null,
      file_urls: uploadedFiles,
      status: 'pending_approval',
      created_by: user?.id,
    })
    setSaving(false)
    setAddOpen(false)
    setForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], category: 'other', description: '', payee: '', notes: '' })
    setUploadedFiles([])
    setUploadFiles([])
    void loadPayments()
  }

  async function submitWorkflow() {
    if (!workflowPayment || !workflowType) return
    if (!selfApprove && !assignee) return

    setSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (selfApprove && canSelfApprove) {
      if (workflowType === 'approve') {
        await supabase.from('legal_payments').update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        }).eq('id', workflowPayment.id)
        await supabase.from('legal_payment_activity_log').insert({
          legal_payment_id: workflowPayment.id,
          action: 'Payment approved (self-approved)',
          performed_by: user?.id,
          new_value: workflowNote || null,
        })
      } else if (workflowType === 'delete') {
        await supabase.from('legal_payment_activity_log').insert({
          legal_payment_id: workflowPayment.id,
          action: 'Payment deleted (self-approved)',
          performed_by: user?.id,
          new_value: workflowNote || null,
        })
        await supabase.from('legal_payments').delete().eq('id', workflowPayment.id)
      }

      await supabase.from('tasks').insert({
        type: workflowType === 'delete' ? 'delete_approval' : 'approval_request',
        title: `Legal payment ${workflowType}: ${workflowPayment.payment_id} (self-approved)`,
        description: workflowNote || '',
        module: 'legal_payments',
        record_id: workflowPayment.id,
        record_ref: workflowPayment.payment_id,
        requested_by: user?.id,
        assigned_to: user?.id,
        status: 'approved',
        priority: workflowType === 'delete' ? 'high' : 'normal',
        review_note: 'Self-approved by ' + (user?.email ?? 'admin'),
      })
    } else {
      const { data: task } = await supabase.from('tasks').insert({
        type: workflowType === 'delete' ? 'delete_approval' : 'approval_request',
        title: `Legal payment ${workflowType}: ${workflowPayment.payment_id}`,
        description: workflowNote || '',
        module: 'legal_payments',
        record_id: workflowPayment.id,
        record_ref: workflowPayment.payment_id,
        requested_by: user?.id,
        assigned_to: assignee,
        priority: workflowType === 'delete' ? 'high' : 'normal',
      }).select().single()

      await supabase.from('notifications').insert({
        user_id: assignee,
        type: `task_${workflowType === 'delete' ? 'delete_approval' : 'approval_request'}`,
        title: `New task: Legal payment ${workflowType}`,
        message: workflowPayment.payment_id,
        task_id: task?.id,
        record_id: workflowPayment.id,
        record_ref: workflowPayment.payment_id,
        module: 'legal_payments',
      })
    }

    setSubmitting(false)
    setWorkflowOpen(false)
    setWorkflowType(null)
    setWorkflowPayment(null)
    setWorkflowNote('')
    setSelfApprove(false)
    setAssignee('')
    void loadPayments()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const total = payments.filter(p => p.status === 'approved' || p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0)

  function closeWorkflow() {
    setWorkflowOpen(false)
    setWorkflowType(null)
    setWorkflowPayment(null)
    setSelfApprove(false)
    setAssignee('')
    setWorkflowNote('')
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Legal payments</h3>
          <p className="text-xs text-gray-400 mt-0.5">Standalone legal expenses outside of cases · Approved total: {fmt(total)}</p>
        </div>
        {canManagePayments && (
          <button onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90"
            style={{ background: '#55249E' }}>
            <Plus size={12} /> Add payment
          </button>
        )}
      </div>

      {canManagePayments && addOpen && (
        <form onSubmit={handleAdd} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount <span className="text-red-400">*</span></label>
              <input type="number" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Date</label>
              <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                {['retainer','filing_fee','counsel_fee','other'].map(c => (
                  <option key={c} value={c} className="capitalize">{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Payee</label>
              <input value={form.payee} onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
                placeholder="Who was paid?" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Details of the payment" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Attachments</label>
            {uploadedFiles.length > 0 && (
              <div className="space-y-1 mb-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-700 truncate">{f.name}</span>
                    <button type="button" onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-500 hover:text-red-700"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="flex-1 cursor-pointer">
                <input type="file" multiple className="hidden" onChange={e => setUploadFiles(Array.from(e.target.files ?? []))} />
                <span className="block px-3 py-2 text-xs text-gray-500 border border-gray-200 border-dashed rounded-lg hover:bg-gray-50">
                  {uploadFiles.length > 0 ? `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected` : 'Click to attach files'}
                </span>
              </label>
              {uploadFiles.length > 0 && (
                <button type="button" onClick={() => void handleUpload(uploadFiles)} disabled={uploading}
                  className="px-3 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: '#55249E' }}>
                  {uploading ? <><Loader2 size={12} className="animate-spin inline" /> Uploading</> : 'Upload'}
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => { setAddOpen(false); setUploadedFiles([]); setUploadFiles([]) }}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ background: '#55249E' }}>
              {saving ? 'Saving…' : 'Save payment'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Payment ID','Date','Category','Payee','Description','Notes','Attachments','Amount','Status','Actions'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-gray-400">Loading...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-gray-400">No payments found</td></tr>
              ) : payments.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{p.payment_id}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">
                    {new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 capitalize">{p.category?.replace('_', ' ')}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700">{p.payee ?? '—'}</td>
                  <td className="px-3 py-3 text-xs text-gray-600 max-w-[180px] truncate">{p.description ?? '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {p.notes ? (
                      <button type="button" onClick={() => { setNotesContent({ title: p.payment_id, content: p.notes }); setNotesModalOpen(true) }}
                        className="text-xs text-brand-600 hover:text-brand-700 underline">View notes</button>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {Array.isArray(p.file_urls) && p.file_urls.length > 0 ? (
                      <button type="button" onClick={() => { setAttachmentsList(p.file_urls); setAttachmentsModalOpen(true) }}
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 underline">
                        <Paperclip size={11} /> {p.file_urls.length}
                      </button>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-semibold text-gray-900">{fmt(p.amount)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'approved' ? 'bg-green-50 text-green-700' :
                      p.status === 'paid' ? 'bg-blue-50 text-blue-700' :
                      p.status === 'rejected' ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {p.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {canApprove && p.status === 'pending_approval' && (
                        <button type="button"
                          onClick={() => { setWorkflowPayment(p); setWorkflowType('approve'); setWorkflowOpen(true) }}
                          className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600"
                          title="Approve"><Shield size={13} /></button>
                      )}
                      {canManagePayments && (
                        <button type="button"
                          onClick={() => { setWorkflowPayment(p); setWorkflowType('delete'); setWorkflowOpen(true) }}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                          title="Delete"><Trash2 size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workflow modal */}
      <Modal open={workflowOpen} onClose={closeWorkflow}
        title={workflowType === 'approve' ? 'Approve legal payment' : 'Delete legal payment'} size="sm">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea rows={2} value={workflowNote} onChange={e => setWorkflowNote(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeWorkflow}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={() => void submitWorkflow()} disabled={submitting || (!selfApprove && !assignee)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 ${
                workflowType === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'
              }`}>
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : selfApprove ? (workflowType === 'delete' ? 'Delete now' : 'Approve now') : 'Submit request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Notes modal */}
      {notesModalOpen && notesContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setNotesModalOpen(false); setNotesContent(null) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900 truncate">Notes · {notesContent.title}</h2>
              <button type="button" onClick={() => { setNotesModalOpen(false); setNotesContent(null) }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">{notesContent.content}</p>
          </div>
        </div>
      )}

      {/* Attachments modal */}
      {attachmentsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setAttachmentsModalOpen(false); setAttachmentsList([]) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Attachments</h2>
              <button type="button" onClick={() => { setAttachmentsModalOpen(false); setAttachmentsList([]) }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="space-y-2">
              {attachmentsList.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors">
                  <span className="text-sm text-gray-700 truncate">{f.name}</span>
                  <Eye size={14} className="text-gray-400" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentRequestsTab() {
  const { permissions, isSuperAdmin } = usePermissions()
  const canManage = isSuperAdmin || can(permissions, isSuperAdmin, 'legal.manage_payments') || can(permissions, isSuperAdmin, 'legal.*')

  const [requests, setRequests] = useState<any[]>([])
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'settled' | 'rejected'>('all')

  const [form, setForm] = useState({
    case_id: '',
    amount: '',
    category: 'counsel_fee',
    payee: '',
    description: '',
    notes: '',
  })

  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string; type: string }[]>([])
  const [uploading, setUploading] = useState(false)

  // Settle modal state
  const [settleOpen, setSettleOpen] = useState(false)
  const [settleTarget, setSettleTarget] = useState<any | null>(null)
  const [settling, setSettling] = useState(false)

  // Reject modal state
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<any | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Notes/attachments modal
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesContent, setNotesContent] = useState<{ title: string; content: string } | null>(null)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachList, setAttachList] = useState<{ url: string; name: string; type: string }[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: reqs }, { data: caseList }] = await Promise.all([
      supabase.from('legal_payment_requests').select(`
        *,
        case:legal_cases(id, case_id, title),
        creator:profiles!legal_payment_requests_created_by_fkey(full_name, email),
        settler:profiles!legal_payment_requests_settled_by_fkey(full_name, email)
      `).order('created_at', { ascending: false }),
      supabase.from('legal_cases').select('id, case_id, title').order('created_at', { ascending: false }),
    ])
    setRequests(reqs ?? [])
    setCases(caseList ?? [])
    setLoading(false)
  }

  async function handleUpload(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const supabase = createClient()
    const uploaded: { url: string; name: string; type: string }[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `legal-payment-requests/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
        uploaded.push({ url: publicUrl, name: file.name, type: file.type })
      }
    }
    setUploadedFiles(prev => [...prev, ...uploaded])
    setUploading(false)
    setUploadFiles([])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('legal_payment_requests').insert({
      case_id: form.case_id || null,
      amount: parseFloat(form.amount),
      category: form.category,
      payee: form.payee,
      description: form.description || null,
      notes: form.notes || null,
      file_urls: uploadedFiles,
      status: 'pending',
      created_by: user?.id,
    })
    setSaving(false)
    setAddOpen(false)
    setForm({ case_id: '', amount: '', category: 'counsel_fee', payee: '', description: '', notes: '' })
    setUploadedFiles([])
    setUploadFiles([])
    load()
  }

  async function handleSettle() {
    if (!settleTarget) return
    setSettling(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let legalPaymentId: string | null = null
    let legalCasePaymentId: string | null = null

    if (settleTarget.case_id) {
      // Create case payment
      const seq = Date.now().toString().slice(-5)
      const { data: cp } = await supabase.from('legal_case_payments').insert({
        payment_id: `CPAY-${seq}`,
        case_id: settleTarget.case_id,
        amount: settleTarget.amount,
        payment_date: new Date().toISOString().split('T')[0],
        payment_type: settleTarget.category === 'counsel_fee' ? 'legal_fee' : settleTarget.category === 'filing_fee' ? 'court_fee' : 'other',
        description: settleTarget.description ?? `Settled from request ${settleTarget.request_id}`,
        payee: settleTarget.payee,
        notes: settleTarget.notes,
        file_urls: settleTarget.file_urls,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
        created_by: user?.id,
      }).select().single()
      legalCasePaymentId = cp?.id ?? null
    } else {
      // Create main legal payment
      const seq = Date.now().toString().slice(-5)
      const { data: lp } = await supabase.from('legal_payments').insert({
        payment_id: `LEG-${seq}`,
        amount: settleTarget.amount,
        payment_date: new Date().toISOString().split('T')[0],
        category: settleTarget.category,
        description: settleTarget.description ?? `Settled from request ${settleTarget.request_id}`,
        payee: settleTarget.payee,
        notes: settleTarget.notes,
        file_urls: settleTarget.file_urls,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
        created_by: user?.id,
      }).select().single()
      legalPaymentId = lp?.id ?? null
    }

    await supabase.from('legal_payment_requests').update({
      status: 'settled',
      settled_at: new Date().toISOString(),
      settled_by: user?.id,
      legal_payment_id: legalPaymentId,
      legal_case_payment_id: legalCasePaymentId,
    }).eq('id', settleTarget.id)

    setSettling(false)
    setSettleOpen(false)
    setSettleTarget(null)
    load()
  }

  async function handleReject() {
    if (!rejectTarget) return
    setRejecting(true)
    const supabase = createClient()
    await supabase.from('legal_payment_requests').update({
      status: 'rejected',
      rejection_reason: rejectReason,
    }).eq('id', rejectTarget.id)
    setRejecting(false)
    setRejectOpen(false)
    setRejectTarget(null)
    setRejectReason('')
    load()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const filtered = statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter)
  const totalPending = requests.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0)
  const totalSettled = requests.filter(r => r.status === 'settled').reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Payment requests</h3>
          <p className="text-xs text-gray-400 mt-0.5">Pending: {fmt(totalPending)} · Settled: {fmt(totalSettled)}</p>
        </div>
        {canManage && (
          <button onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90"
            style={{ background: '#55249E' }}>
            <Plus size={12} /> Request payment
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {(['all', 'pending', 'settled', 'rejected'] as const).map(s => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              statusFilter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {addOpen && canManage && (
        <form onSubmit={handleAdd} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Linked case (optional)</label>
              <select value={form.case_id} onChange={e => setForm(f => ({ ...f, case_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                <option value="">No case (general request)</option>
                {cases.map(c => <option key={c.id} value={c.id}>{c.case_id} — {c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount <span className="text-red-400">*</span></label>
              <input type="number" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
                {['retainer','filing_fee','counsel_fee','other'].map(c => (
                  <option key={c} value={c} className="capitalize">{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Payee (counsel name) <span className="text-red-400">*</span></label>
              <input required value={form.payee} onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
                placeholder="Counsel name" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What is this payment for?" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Attachments</label>
            {uploadedFiles.length > 0 && (
              <div className="space-y-1 mb-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-700 truncate">{f.name}</span>
                    <button type="button" onClick={() => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-500 hover:text-red-700"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="flex-1 cursor-pointer">
                <input type="file" multiple className="hidden" onChange={e => setUploadFiles(Array.from(e.target.files ?? []))} />
                <span className="block px-3 py-2 text-xs text-gray-500 border border-gray-200 border-dashed rounded-lg hover:bg-gray-50">
                  {uploadFiles.length > 0 ? `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected` : 'Click to attach files'}
                </span>
              </label>
              {uploadFiles.length > 0 && (
                <button type="button" onClick={() => handleUpload(uploadFiles)} disabled={uploading}
                  className="px-3 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: '#55249E' }}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => { setAddOpen(false); setUploadedFiles([]); setUploadFiles([]) }}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: '#55249E' }}>
              {saving ? 'Saving…' : 'Submit request'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Request ID','Case','Payee','Category','Amount','Notes','Files','Status','Date','Actions'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-gray-400">No payment requests</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{r.request_id}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.case ? (
                      <a href={`/portal/legal/cases/${r.case.id}`} className="text-xs text-brand-600 hover:underline">{r.case.case_id}</a>
                    ) : <span className="text-xs text-gray-400">General</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 font-medium">{r.payee}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600 capitalize">{r.category?.replace('_', ' ')}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-gray-900">{fmt(r.amount)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.notes ? (
                      <button type="button" onClick={() => { setNotesContent({ title: r.request_id, content: r.notes }); setNotesOpen(true) }}
                        className="text-xs text-brand-600 hover:underline">View</button>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {Array.isArray(r.file_urls) && r.file_urls.length > 0 ? (
                      <button type="button" onClick={() => { setAttachList(r.file_urls); setAttachOpen(true) }}
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                        <Paperclip size={11} /> {r.file_urls.length}
                      </button>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.status === 'settled' ? 'bg-green-50 text-green-700' :
                      r.status === 'rejected' ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-700'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.status === 'pending' && canManage && (
                      <div className="flex items-center gap-1">
                        <button type="button"
                          onClick={() => { setSettleTarget(r); setSettleOpen(true) }}
                          className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600"
                          title="Settle payment"><CheckCircle2 size={13} /></button>
                        <button type="button"
                          onClick={() => { setRejectTarget(r); setRejectOpen(true) }}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                          title="Reject"><X size={13} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settle modal */}
      <Modal open={settleOpen} onClose={() => { setSettleOpen(false); setSettleTarget(null) }} title="Settle payment request" size="sm">
        {settleTarget && (
          <div className="space-y-4">
            <div className="bg-brand-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Request</p>
              <p className="text-sm font-semibold text-gray-900">{settleTarget.request_id} · {settleTarget.payee}</p>
              <p className="text-sm font-bold text-brand-700 mt-1">{fmt(settleTarget.amount)}</p>
            </div>
            <p className="text-sm text-gray-600">
              This will create a {settleTarget.case_id ? 'case payment' : 'legal payment'} record (auto-approved) and mark this request as settled. The payment will roll up to Expensify.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setSettleOpen(false); setSettleTarget(null) }}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={handleSettle} disabled={settling}
                className="flex-1 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {settling ? 'Settling…' : 'Settle now'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject modal */}
      <Modal open={rejectOpen} onClose={() => { setRejectOpen(false); setRejectTarget(null); setRejectReason('') }} title="Reject payment request" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Reason for rejection</label>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Why are you rejecting this request?"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setRejectOpen(false); setRejectTarget(null); setRejectReason('') }}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleReject} disabled={rejecting}
              className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {rejecting ? 'Rejecting…' : 'Reject request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Notes modal */}
      {notesOpen && notesContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setNotesOpen(false); setNotesContent(null) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Notes · {notesContent.title}</h2>
              <button type="button" onClick={() => { setNotesOpen(false); setNotesContent(null) }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">{notesContent.content}</p>
          </div>
        </div>
      )}

      {/* Attachments modal */}
      {attachOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setAttachOpen(false); setAttachList([]) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Attachments</h2>
              <button type="button" onClick={() => { setAttachOpen(false); setAttachList([]) }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="space-y-2">
              {attachList.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors">
                  <span className="text-sm text-gray-700 truncate">{f.name}</span>
                  <Eye size={14} className="text-gray-400" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


