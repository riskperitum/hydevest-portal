'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Scale, FileText, DollarSign, Plus, Search,
  AlertCircle, Clock, CheckCircle2, RefreshCw,
  Upload, ChevronRight, Users
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
  const [activeTab, setActiveTab] = useState<'cases' | 'documents' | 'payments'>('cases')
  const [cases, setCases]         = useState<LegalCase[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')

  const [summary, setSummary] = useState({
    total: 0, open: 0, in_progress: 0, settled: 0,
  })

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
          <button onClick={() => router.push('/portal/legal/cases/create')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90"
            style={{ background: '#55249E' }}>
            <Plus size={14} /> New case
          </button>
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
                <button onClick={() => router.push('/portal/legal/cases/create')}
                  className="text-xs font-medium text-brand-600 hover:underline">
                  Create first case
                </button>
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
      </div>
    </div>
  )
}

// ── DOCUMENTS TAB ─────────────────────────────────────────────────────────────
function LegalDocumentsTab() {
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
        <button onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90"
          style={{ background: '#55249E' }}>
          <Upload size={12} /> Upload document
        </button>
      </div>

      {uploadOpen && (
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
  const [payments, setPayments]     = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [addOpen, setAddOpen]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState({
    amount: '', payment_date: new Date().toISOString().split('T')[0],
    category: 'other', description: '', payee: '',
  })

  useEffect(() => { loadPayments() }, [])

  async function loadPayments() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('legal_payments').select(`
      id, payment_id, amount, payment_date, category, description, payee, created_at,
      creator:profiles!legal_payments_created_by_fkey(full_name, email)
    `).order('payment_date', { ascending: false })
    setPayments(data ?? [])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const seq = Date.now().toString().slice(-5)
    await supabase.from('legal_payments').insert({
      payment_id:   `LEG-${seq}`,
      amount:       parseFloat(form.amount),
      payment_date: form.payment_date,
      category:     form.category,
      description:  form.description || null,
      payee:        form.payee || null,
      created_by:   user?.id,
    })
    setSaving(false)
    setAddOpen(false)
    setForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], category: 'other', description: '', payee: '' })
    loadPayments()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const total = payments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Legal payments</h3>
          <p className="text-xs text-gray-400 mt-0.5">Standalone legal expenses outside of cases · Total: {fmt(total)}</p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90"
          style={{ background: '#55249E' }}>
          <Plus size={12} /> Add payment
        </button>
      </div>

      {addOpen && (
        <form onSubmit={handleAdd} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount <span className="text-red-400">*</span></label>
              <input type="number" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Date</label>
              <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {['retainer','filing_fee','counsel_fee','other'].map(c => (
                  <option key={c} value={c} className="capitalize">{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Payee</label>
              <input value={form.payee} onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
                placeholder="Who was paid?"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Details of the payment"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAddOpen(false)}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ background: '#55249E' }}>
              {saving ? 'Saving…' : 'Save payment'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)
      ) : payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <DollarSign size={24} className="text-gray-200" />
          <p className="text-sm text-gray-400">No legal payments recorded</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Ref','Amount','Date','Category','Payee','Description','Recorded by'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {payments.map((p: any) => (
              <tr key={p.id} className="hover:bg-gray-50/50">
                <td className="px-3 py-3">
                  <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: '#f0ecfc', color: '#55249E' }}>
                    {p.payment_id}
                  </span>
                </td>
                <td className="px-3 py-3 text-sm font-bold text-gray-800">{fmt(Number(p.amount))}</td>
                <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-3 py-3 text-xs text-gray-500 capitalize">{p.category?.replace('_', ' ')}</td>
                <td className="px-3 py-3 text-xs text-gray-500">{p.payee ?? '—'}</td>
                <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px] truncate">{p.description ?? '—'}</td>
                <td className="px-3 py-3 text-xs text-gray-500">{p.creator?.full_name ?? p.creator?.email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

