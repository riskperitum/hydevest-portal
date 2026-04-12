'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Plus, Trash2, Check, X,
  Pencil, Upload, Eye, RefreshCw, MessageSquare,
  Activity, Paperclip, ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import { displayName, fullDisplayName } from '@/lib/utils/displayName'

interface Container {
  id: string
  container_id: string
  trip_id: string
  container_number: string | null
  description: string | null
  title: string | null
  tracking_number: string | null
  average_weight: number | null
  max_weight: number | null
  invoice_number: string | null
  hide_type: string | null
  source_port: string | null
  destination_port: string | null
  funding_type: string
  pieces_purchased: number | null
  unit_price_usd: number | null
  shipping_amount_usd: number | null
  quoted_price_usd: number | null
  surcharge_ngn: number | null
  estimated_landing_cost: number | null
  status: string
  approval_status: string
  created_at: string
}

interface Funder {
  id: string
  funder_type: string
  funder_id: string
  funder_name: string
  percentage: number
}

interface Comment {
  id: string
  parent_id: string | null
  content: string
  created_at: string
  created_by: string | null
  author: { full_name: string | null; email: string } | null
  replies?: Comment[]
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

interface Entity { id: string; name: string; entity_id: string }
interface Partner { id: string; name: string; partner_id: string }

const CONTAINER_STATUS = [
  { value: 'ordered',    label: 'Ordered',    color: 'bg-gray-100 text-gray-600' },
  { value: 'in_transit', label: 'In transit', color: 'bg-blue-50 text-blue-700' },
  { value: 'arrived',    label: 'Arrived',    color: 'bg-green-50 text-green-700' },
  { value: 'cleared',    label: 'Cleared',    color: 'bg-brand-50 text-brand-700' },
]

export default function ContainerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string
  const containerId = params.containerId as string

  const [container, setContainer] = useState<Container | null>(null)
  const [funders, setFunders] = useState<Funder[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('comments')

  const [entities, setEntities] = useState<Entity[]>([])
  const [partners, setPartners] = useState<Partner[]>([])

  const [editField, setEditField] = useState<string | null>(null)
  const [fieldValue, setFieldValue] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)

  const [funderOpen, setFunderOpen] = useState(false)
  const [funderForm, setFunderForm] = useState({ funder_type: 'entity', funder_id: '', percentage: '' })
  const [savingFunder, setSavingFunder] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null)
  const [savingComment, setSavingComment] = useState(false)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [documents, setDocuments] = useState<{ id: string; name: string; file_url: string; file_type: string | null; created_at: string }[]>([])
  const [tripData, setTripData] = useState<{ source_port: string | null; destination_port: string | null } | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: con }, { data: fund }, { data: docs }] = await Promise.all([
      supabase.from('containers').select('*').eq('id', containerId).single(),
      supabase.from('container_funders').select('*').eq('container_id', containerId),
      supabase.from('trip_documents').select('*').eq('container_id', containerId).order('created_at', { ascending: false }),
    ])
    setContainer(con)
    setFunders(fund ?? [])
    setDocuments(docs ?? [])
    if (con?.trip_id) {
      const { data: trip } = await supabase
        .from('trips')
        .select('source_port, destination_port')
        .eq('id', con.trip_id)
        .single()
      setTripData(trip)
    } else {
      setTripData(null)
    }
    setLoading(false)
  }, [containerId])

  const loadComments = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('container_comments')
      .select('*, author:profiles!container_comments_created_by_fkey(full_name, email)')
      .eq('container_id', containerId)
      .order('created_at', { ascending: true })
    const all = data ?? []
    const top = all.filter(c => !c.parent_id)
    const nested = top.map(c => ({ ...c, replies: all.filter(r => r.parent_id === c.id) }))
    setComments(nested)
  }, [containerId])

  const loadActivity = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('container_activity_log')
      .select('*, performer:profiles!container_activity_log_performed_by_fkey(full_name, email)')
      .eq('container_id', containerId)
      .order('created_at', { ascending: false })
    setActivityLogs(data ?? [])
  }, [containerId])

  const loadDropdowns = useCallback(async () => {
    const supabase = createClient()
    const [{ data: ent }, { data: par }] = await Promise.all([
      supabase.from('entities').select('id, name, entity_id').eq('is_active', true),
      supabase.from('partners').select('id, name, partner_id').eq('is_active', true),
    ])
    setEntities(ent ?? [])
    setPartners(par ?? [])
  }, [])

  useEffect(() => {
    load()
    loadComments()
    loadActivity()
    loadDropdowns()
  }, [load, loadComments, loadActivity, loadDropdowns])

  const totalPct = funders.reduce((s, f) => s + Number(f.percentage), 0)

  async function logActivity(action: string, fieldName?: string, oldValue?: string, newValue?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('container_activity_log').insert({
      container_id: containerId,
      action,
      field_name: fieldName ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      performed_by: user?.id,
    })
  }

  async function updateField(field: string, value: string) {
    const supabase = createClient()
    const oldValue = String((container as Record<string, unknown>)[field] ?? '')
    await supabase.from('containers').update({ [field]: value || null }).eq('id', containerId)
    await logActivity('Updated field', field, oldValue, value)
    setEditField(null)
    load()
    loadActivity()
  }

  async function updateStatus(status: string) {
    const supabase = createClient()
    await supabase.from('containers').update({ status }).eq('id', containerId)
    await logActivity('Status changed', 'status', container?.status, status)
    setStatusOpen(false)
    load()
    loadActivity()
  }

  async function saveFunder(e: React.FormEvent) {
    e.preventDefault()
    const newPct = parseFloat(funderForm.percentage)

    if (newPct <= 0) {
      alert('Percentage must be greater than 0.')
      return
    }

    if (newPct > 100) {
      alert('Percentage cannot exceed 100%.')
      return
    }

    const existingFunder = funders.find(f => f.funder_id === funderForm.funder_id)

    if (!existingFunder) {
      const otherFundersTotal = funders.reduce((s, f) => s + Number(f.percentage), 0)
      const remaining = 100 - otherFundersTotal
      if (newPct > remaining) {
        alert(`Cannot add ${newPct}%. Only ${remaining.toFixed(1)}% remaining to allocate across all funders.`)
        return
      }
    }

    setSavingFunder(true)
    const supabase = createClient()
    const funderName = funderForm.funder_type === 'entity'
      ? entities.find(e => e.id === funderForm.funder_id)?.name ?? ''
      : partners.find(p => p.id === funderForm.funder_id)?.name ?? ''

    if (existingFunder) {
      await supabase.from('container_funders')
        .update({ percentage: newPct })
        .eq('id', existingFunder.id)
      await logActivity(
        'Funder percentage updated',
        'funders',
        `${funderName} ${existingFunder.percentage}%`,
        `${funderName} ${newPct}%`
      )
    } else {
      await supabase.from('container_funders').insert({
        container_id: containerId,
        funder_type: funderForm.funder_type,
        funder_id: funderForm.funder_id,
        funder_name: funderName,
        percentage: newPct,
      })
      await logActivity('Funder added', 'funders', '', `${funderName} (${newPct}%)`)
    }

    setSavingFunder(false)
    setFunderOpen(false)
    setFunderForm({ funder_type: 'entity', funder_id: '', percentage: '' })
    load()
    loadActivity()
  }

  async function deleteFunder(id: string, name: string) {
    if (!confirm(`Remove ${name} as funder?`)) return
    const supabase = createClient()
    await supabase.from('container_funders').delete().eq('id', id)
    await logActivity('Funder removed', 'funders', name, '')
    load()
    loadActivity()
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    setSavingComment(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('container_comments').insert({
      container_id: containerId,
      parent_id: replyTo?.id ?? null,
      content: commentText.trim(),
      created_by: user?.id,
    })
    setCommentText('')
    setReplyTo(null)
    setSavingComment(false)
    loadComments()
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadFile) return
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const ext = uploadFile.name.split('.').pop()
    const path = `containers/${containerId}/${Date.now()}.${ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, uploadFile, { upsert: true })

    if (uploadError) {
      alert(`Upload failed: ${uploadError.message}`)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(path)

    const { error: insertError } = await supabase.from('trip_documents').insert({
      container_id: containerId,
      trip_id: tripId,
      name: uploadName || uploadFile.name,
      file_url: urlData.publicUrl,
      file_type: uploadFile.type,
      file_size: uploadFile.size,
      uploaded_by: user?.id,
    })

    if (insertError) {
      alert(`Failed to save document record: ${insertError.message}`)
      setUploading(false)
      return
    }

    await logActivity('Document uploaded', 'documents', '', uploadName || uploadFile.name)
    setUploading(false)
    setUploadOpen(false)
    setUploadFile(null)
    setUploadName('')
    load()
    loadActivity()
  }

  async function deleteDocument(id: string, name: string) {
    if (!confirm(`Delete document "${name}"?`)) return
    const supabase = createClient()
    await supabase.from('trip_documents').delete().eq('id', id)
    await logActivity('Document deleted', 'documents', name, '')
    load()
    loadActivity()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtUSD = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const statusInfo = (s: string) => CONTAINER_STATUS.find(o => o.value === s) ?? CONTAINER_STATUS[0]
  const isPartner = container?.funding_type === 'partner'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!container) return <div className="text-center py-16 text-gray-400">Container not found.</div>

  const EditableField = ({
    fieldKey, label, value, type = 'text', placeholder = ''
  }: { fieldKey: string; label: string; value: string; type?: string; placeholder?: string }) => {
    const isEmpty = !value || value === ''
    const isApproved = container?.approval_status === 'approved'
    const useAutosave = isEmpty && !isApproved

    return (
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        {editField === fieldKey ? (
          <div className="flex gap-1.5">
            <input
              type={type}
              value={fieldValue}
              onChange={e => setFieldValue(e.target.value)}
              onBlur={() => {
                if (useAutosave && fieldValue !== value) {
                  updateField(fieldKey, fieldValue)
                }
              }}
              className="flex-1 px-2 py-1.5 text-sm border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0"
              placeholder={placeholder}
              autoFocus
            />
            {!useAutosave && (
              <>
                <button onClick={() => updateField(fieldKey, fieldValue)}
                  className="p-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shrink-0">
                  <Check size={13} />
                </button>
                <button onClick={() => setEditField(null)}
                  className="p-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors shrink-0">
                  <X size={13} />
                </button>
              </>
            )}
            {useAutosave && (
              <span className="text-xs text-gray-400 self-center whitespace-nowrap">blur to save</span>
            )}
          </div>
        ) : (
          <button
            onClick={() => { setEditField(fieldKey); setFieldValue(value) }}
            className="group w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-brand-50 transition-colors">
            <span className={`text-sm truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
              {value || (useAutosave ? 'Click to set' : 'Not set')}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {useAutosave && !value && (
                <span className="text-xs text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity">autosave</span>
              )}
              <Pencil size={11} className="text-gray-300 group-hover:text-brand-400 transition-colors" />
            </div>
          </button>
        )}
      </div>
    )
  }

  const SelectField = ({
    fieldKey, label, value, options
  }: { fieldKey: string; label: string; value: string; options: { value: string; label: string }[] }) => (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <select
        value={value}
        disabled={container?.approval_status === 'approved'}
        onChange={async e => {
          const supabase = createClient()
          await supabase.from('containers').update({ [fieldKey]: e.target.value }).eq('id', containerId)
          await logActivity('Updated field', fieldKey, value, e.target.value)
          load()
          loadActivity()
        }}
        className={`w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white
          ${container?.approval_status === 'approved' ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <option value="">Select...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/portal/purchase/trips/${tripId}`}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{container.container_id}</span>
              <span className="text-xs text-gray-400">Container drilldown</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mt-0.5">
              {container.container_number || container.title || 'Untitled container'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setStatusOpen(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${statusInfo(container.status).color}`}>
              {statusInfo(container.status).label}
              <ChevronDown size={13} />
            </button>
            {statusOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-gray-100 shadow-lg z-20 py-1">
                  {CONTAINER_STATUS.map(s => (
                    <button key={s.value} onClick={() => updateStatus(s.value)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors
                        ${container.status === s.value ? 'font-medium text-brand-600' : 'text-gray-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${s.color.split(' ')[0]}`} />
                      {s.label}
                      {container.status === s.value && <Check size={12} className="ml-auto" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 1: Container Details ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-700">Container details</h2>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          <EditableField fieldKey="container_number" label="Title / Label" value={container.container_number ?? ''} placeholder="e.g. Container A" />
          <EditableField fieldKey="tracking_number" label="Tracking number" value={container.tracking_number ?? ''} placeholder="e.g. MSCU1234567" />
          <EditableField fieldKey="invoice_number" label="Invoice number" value={container.invoice_number ?? ''} placeholder="e.g. INV-001" />
          <EditableField fieldKey="average_weight" label="Average weight (kg)" value={container.average_weight?.toString() ?? ''} type="number" placeholder="0.00" />
          <EditableField fieldKey="max_weight" label="Max weight (kg)" value={container.max_weight?.toString() ?? ''} type="number" placeholder="0.00" />
          <SelectField fieldKey="hide_type" label="Hide type" value={container.hide_type ?? ''} options={[
            { value: 'dried', label: 'Dried' },
            { value: 'wet_salted', label: 'Wet salted' },
          ]} />
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Source port</p>
            <div className="px-2 py-1.5 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{tripData?.source_port ?? <span className="text-gray-400 italic font-normal">Not set on trip</span>}</span>
              <span className="text-xs text-gray-300 italic">from trip</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Destination port</p>
            <div className="px-2 py-1.5 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{tripData?.destination_port ?? <span className="text-gray-400 italic font-normal">Not set on trip</span>}</span>
              <span className="text-xs text-gray-300 italic">from trip</span>
            </div>
          </div>
          <div className="col-span-2 md:col-span-3">
            <EditableField fieldKey="description" label="Description" value={container.description ?? ''} placeholder="Container notes or description" />
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Funding ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Funding</h2>
            {funders.length > 0 && (
              <p className={`text-xs mt-0.5 ${totalPct === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                {totalPct.toFixed(1)}% allocated {totalPct === 100 ? '✓' : `— ${(100 - totalPct).toFixed(1)}% remaining`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Funding type:</span>
              <select
                value={container.funding_type}
                onChange={async e => {
                  const supabase = createClient()
                  await supabase.from('containers').update({ funding_type: e.target.value }).eq('id', containerId)
                  await logActivity('Funding type changed', 'funding_type', container.funding_type, e.target.value)
                  load()
                  loadActivity()
                }}
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white font-medium"
              >
                <option value="entity">Entity</option>
                <option value="partner">Partner</option>
              </select>
            </div>
            <button
              onClick={() => setFunderOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors">
              <Plus size={13} /> {totalPct >= 100 ? 'Update funder' : 'Add funder'}
            </button>
          </div>
        </div>

        {funders.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No funders added yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {funders.map(f => (
              <div key={f.id} className="px-5 py-3 flex items-center gap-4">
                <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.funder_type === 'entity' ? 'bg-blue-50 text-blue-700' : 'bg-brand-50 text-brand-700'}`}>
                  {f.funder_type === 'entity' ? 'Entity' : 'Partner'}
                </div>
                <span className="text-sm font-medium text-gray-900 flex-1">{f.funder_name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-100 rounded-full h-1.5">
                    <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(f.percentage, 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-12 text-right">{f.percentage}%</span>
                </div>
                <button onClick={() => deleteFunder(f.id, f.funder_name)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 3: Unit & Fees ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-700">Unit & fees</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {isPartner ? 'Partner funding — all fields apply' : 'Entity funding — base fields apply'}
          </p>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          <EditableField fieldKey="pieces_purchased" label="Pieces purchased" value={container.pieces_purchased?.toString() ?? ''} type="number" placeholder="0" />
          <EditableField fieldKey="unit_price_usd" label="Unit price (USD)" value={container.unit_price_usd?.toString() ?? ''} type="number" placeholder="0.00" />
          <EditableField fieldKey="shipping_amount_usd" label="Shipping amount (USD)" value={container.shipping_amount_usd?.toString() ?? ''} type="number" placeholder="0.00" />
          {isPartner && (
            <>
              <EditableField fieldKey="quoted_price_usd" label="Quoted price (USD)" value={container.quoted_price_usd?.toString() ?? ''} type="number" placeholder="0.00" />
              <EditableField fieldKey="surcharge_ngn" label="Surcharge (₦)" value={container.surcharge_ngn?.toString() ?? ''} type="number" placeholder="0.00" />
              <EditableField fieldKey="estimated_landing_cost" label="Estimated landing cost" value={container.estimated_landing_cost?.toString() ?? ''} type="number" placeholder="0.00" />
            </>
          )}
          {!isPartner && (
            <EditableField fieldKey="estimated_landing_cost" label="Estimated landing cost" value={container.estimated_landing_cost?.toString() ?? ''} type="number" placeholder="0.00" />
          )}
        </div>

        {/* Summary row */}
        {(container.pieces_purchased || container.unit_price_usd) && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-6 flex-wrap">
            {container.pieces_purchased && container.unit_price_usd && (
              <span className="text-xs text-gray-500">
                Purchase amount: <span className="font-semibold text-gray-900">
                  {fmtUSD(
                    (Number(container.pieces_purchased) * Number(container.unit_price_usd))
                  )}
                </span>
              </span>
            )}
            {container.pieces_purchased && container.unit_price_usd && (
              <span className="text-xs text-gray-500">
                Subtotal (with shipping): <span className="font-semibold text-gray-900">
                  {fmtUSD(
                    (Number(container.pieces_purchased) * Number(container.unit_price_usd)) +
                    Number(container.shipping_amount_usd ?? 0)
                  )}
                </span>
              </span>
            )}
            {isPartner && container.pieces_purchased && container.quoted_price_usd && (
              <span className="text-xs text-gray-500">
                Quoted amount: <span className="font-semibold text-gray-900">
                  {fmtUSD(Number(container.pieces_purchased) * Number(container.quoted_price_usd))}
                </span>
              </span>
            )}
            {container.estimated_landing_cost && (
              <span className="text-xs text-gray-500">
                Est. landing cost: <span className="font-semibold text-brand-700">{fmt(container.estimated_landing_cost)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 4: Attachments ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Attachments</h2>
          <button onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors">
            <Upload size={13} /> Upload file
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No attachments yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {documents.map(doc => (
              <div key={doc.id} className="px-5 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Paperclip size={14} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={doc.file_url} target="_blank" rel="noreferrer"
                    className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                    <Eye size={14} />
                  </a>
                  <button onClick={() => deleteDocument(doc.id, doc.name)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 5: Comments & Activity ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'comments', label: 'Comments', icon: <MessageSquare size={14} />, count: comments.length },
            { key: 'activity', label: 'Activity log', icon: <Activity size={14} />, count: activityLogs.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.icon} {tab.label}
              {tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* COMMENTS */}
          {activeTab === 'comments' && (
            <div className="space-y-5">
              {comments.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-6">No comments yet. Be the first to comment.</p>
              )}

              {comments.map(comment => (
                <div key={comment.id} className="space-y-3">
                  {/* Top-level comment */}
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold shrink-0">
                      {(comment.author?.full_name ?? comment.author?.email ?? 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-gray-50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-800">
                            {fullDisplayName(comment.author)}
                          </span>
                          <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                      <button
                        onClick={() => setReplyTo({ id: comment.id, author: fullDisplayName(comment.author) })}
                        className="text-xs text-gray-400 hover:text-brand-600 mt-1 ml-2 transition-colors">
                        Reply
                      </button>
                    </div>
                  </div>

                  {/* Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="ml-10 space-y-3">
                      {comment.replies.map(reply => (
                        <div key={reply.id} className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-semibold shrink-0">
                            {(reply.author?.full_name ?? reply.author?.email ?? 'U')[0].toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-gray-800">
                                  {reply.author?.full_name ?? reply.author?.email ?? 'Unknown'}
                                </span>
                                <span className="text-xs text-gray-400">{new Date(reply.created_at).toLocaleString()}</span>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{reply.content}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Comment input */}
              <form onSubmit={submitComment} className="space-y-2 pt-2 border-t border-gray-100">
                {replyTo && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-brand-50 px-3 py-2 rounded-lg">
                    <span>Replying to <span className="font-medium text-brand-700">{replyTo.author}</span></span>
                    <button type="button" onClick={() => setReplyTo(null)} className="ml-auto text-gray-400 hover:text-gray-600">
                      <X size={12} />
                    </button>
                  </div>
                )}
                <div className="flex gap-3">
                  <textarea
                    rows={2}
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Write a comment..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                  <button type="submit" disabled={savingComment || !commentText.trim()}
                    className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors self-end">
                    {savingComment ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ACTIVITY LOG */}
          {activeTab === 'activity' && (
            <div className="space-y-1">
              {activityLogs.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">No activity recorded yet.</p>
              ) : (
                activityLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Activity size={11} className="text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium text-gray-900">{fullDisplayName(log.performer)}</span>
                        {' '}{log.action}
                        {log.field_name && <span className="text-gray-500"> · {log.field_name}</span>}
                      </p>
                      {(log.old_value || log.new_value) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {log.old_value && <span className="text-xs text-red-500 line-through">{log.old_value}</span>}
                          {log.old_value && log.new_value && <span className="text-xs text-gray-400">→</span>}
                          {log.new_value && <span className="text-xs text-green-600">{log.new_value}</span>}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add funder modal */}
      <Modal open={funderOpen} onClose={() => setFunderOpen(false)} title="Add funder" description="Assign funding responsibility for this container" size="sm">
        <form onSubmit={saveFunder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Funder type</label>
            <select value={funderForm.funder_type} onChange={e => setFunderForm(f => ({ ...f, funder_type: e.target.value, funder_id: '' }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="entity">Entity</option>
              <option value="partner">Partner</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {funderForm.funder_type === 'entity' ? 'Select entity' : 'Select partner'} <span className="text-red-400">*</span>
            </label>
            <select required value={funderForm.funder_id} onChange={e => setFunderForm(f => ({ ...f, funder_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">Select...</option>
              {funderForm.funder_type === 'entity'
                ? entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.entity_id})</option>)
                : partners.map(p => <option key={p.id} value={p.id}>{p.name} ({p.partner_id})</option>)
              }
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Percentage (%) <span className="text-red-400">*</span>
            </label>
            <input
              required
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={funderForm.percentage}
              onChange={e => setFunderForm(f => ({ ...f, percentage: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. 100"
            />
            {(() => {
              const existingFunder = funders.find(f => f.funder_id === funderForm.funder_id)
              const otherFundersTotal = funders
                .filter(f => f.funder_id !== funderForm.funder_id)
                .reduce((s, f) => s + Number(f.percentage), 0)
              const remaining = 100 - otherFundersTotal
              return (
                <p className="text-xs text-gray-400 mt-1">
                  {existingFunder
                    ? `Currently at ${existingFunder.percentage}% — enter new percentage to update`
                    : `${remaining.toFixed(1)}% available to allocate`}
                </p>
              )
            })()}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setFunderOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={savingFunder}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {savingFunder ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Add funder'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Upload modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload document" size="sm">
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File name / Label</label>
            <input value={uploadName} onChange={e => setUploadName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Bill of Lading" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select file <span className="text-red-400">*</span></label>
            <input required type="file"
              onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-brand-50 file:text-brand-700" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setUploadOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={uploading || !uploadFile}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : 'Upload'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
