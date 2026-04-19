'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Check, X, Pencil, Plus,
  Trash2, CheckCircle2, Eye, AlertTriangle, Activity, Lock
} from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'
import AmountInput from '@/components/ui/AmountInput'
import { usePermissions, can } from '@/lib/permissions/hooks'
import {
  computeContainerStatus,
  getContainerStatusBadge,
  type ContainerStatusInput,
  normalizeSaleTypeForStatus,
} from '@/lib/utils/containerStatus'

interface Presale {
  id: string
  presale_id: string
  created_by?: string | null
  sale_type: string
  status: string
  approval_status: string
  needs_review: boolean
  last_reviewed_at: string | null
  last_reviewed_by: string | null
  warehouse_confirmed_avg_weight: number | null
  warehouse_confirmed_pieces: number | null
  supplier_loaded_pieces: number | null
  price_per_kilo: number | null
  price_per_piece: number | null
  expected_sale_revenue: number | null
  total_number_of_pallets: number | null
  created_at: string
  container: {
    id: string
    container_id: string
    tracking_number: string | null
    container_number: string | null
    pieces_purchased: number | null
    average_weight: number | null
    status: string
    trip: { trip_id: string; title: string; source_location: string | null } | null
  } | null
  created_by_profile: { full_name: string | null; email: string } | null
  last_reviewer: { full_name: string | null; email: string } | null
}

interface PalletDistribution {
  id: string
  pallet_pieces: number
  number_of_pallets: number
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600 border-gray-200' },
  confirmed: { label: 'Confirmed', color: 'bg-green-50 text-green-700 border-green-200' },
  altered:   { label: 'Altered',   color: 'bg-orange-50 text-orange-700 border-orange-200' },
  cancelled: { label: 'Cancelled', color: 'bg-red-50 text-red-600 border-red-200' },
}

export default function PresaleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const presaleId = params.id as string

  const { permissions, isSuperAdmin } = usePermissions()
  const canOverride = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*')

  const [presale, setPresale] = useState<Presale | null>(null)
  const [pallets, setPallets] = useState<PalletDistribution[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details')
  const [editField, setEditField] = useState<string | null>(null)
  const [fieldValue, setFieldValue] = useState('')

  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowType, setWorkflowType] = useState<'delete' | 'review' | 'approval' | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [submittingWorkflow, setSubmittingWorkflow] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [hasActiveSalesOrder, setHasActiveSalesOrder] = useState(false)
  const [salesOrderRef, setSalesOrderRef] = useState<string | null>(null)

  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [overriding, setOverriding] = useState(false)
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)

  const [addPalletOpen, setAddPalletOpen] = useState(false)
  const [newPalletPieces, setNewPalletPieces] = useState('')
  const [newPalletCount, setNewPalletCount] = useState('')
  const [savingPallet, setSavingPallet] = useState(false)

  const [containerStatus, setContainerStatus] = useState<ContainerStatusInput | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const [editForm, setEditForm] = useState({
    warehouse_confirmed_avg_weight: '',
    price_per_kilo: '',
    price_per_piece: '',
  })
  const [savingPricing, setSavingPricing] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: ps }, { data: pd }, { data: al }] = await Promise.all([
      supabase.from('presales')
        .select(`*,
          container:containers(id, container_id, tracking_number, container_number, pieces_purchased, average_weight, status,
            trip:trips(trip_id, title, source_location)),
          created_by_profile:profiles!presales_created_by_fkey(full_name, email),
          last_reviewer:profiles!presales_last_reviewed_by_fkey(full_name, email)
        `)
        .eq('id', presaleId)
        .single(),
      supabase.from('presale_pallet_distributions')
        .select('*')
        .eq('presale_id', presaleId)
        .order('created_at', { ascending: true }),
      supabase.from('presale_activity_log')
        .select('*, performer:profiles!presale_activity_log_performed_by_fkey(full_name, email)')
        .eq('presale_id', presaleId)
        .order('created_at', { ascending: false }),
    ])
    setPresale(ps)
    setPallets(pd ?? [])
    setActivityLogs(al ?? [])

    const presaleData = ps as { id: string; container_id?: string; container?: { id: string } | null } | null
    const cid = presaleData?.container?.id ?? presaleData?.container_id

    // Check if container has active sales order
    if (cid) {
      const { data: activeSO } = await supabase
        .from('sales_orders')
        .select('id, order_id, payment_status')
        .eq('container_id', cid)
        .neq('payment_status', 'paid')
        .limit(1)
        .single()

      setHasActiveSalesOrder(!!(activeSO))
      setSalesOrderRef((activeSO as any)?.order_id ?? null)
    } else {
      setHasActiveSalesOrder(false)
      setSalesOrderRef(null)
    }

    if (cid) {
      const [
        { data: tripData },
        { data: presaleCounts },
        { data: salesCounts },
        { data: paidCounts },
        { data: settledData },
        { data: presaleInfo },
        { data: palletDists },
      ] = await Promise.all([
        supabase.from('containers').select('trip:trips!containers_trip_id_fkey(status)').eq('id', cid).single(),
        supabase.from('presales').select('id').eq('container_id', cid),
        supabase.from('sales_orders').select('id, payment_status, outstanding_balance').eq('container_id', cid),
        supabase.from('sales_orders').select('id').eq('container_id', cid).eq('payment_status', 'paid'),
        supabase.from('sales_orders').select('outstanding_balance, write_off_status').eq('container_id', cid),
        supabase.from('presales').select('sale_type, total_number_of_pallets').eq('container_id', cid).order('created_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('presale_pallet_distributions').select('id').eq('presale_id', presaleData.id),
      ])

      const tripRaw = (tripData as { trip?: { status?: string } | { status?: string }[] } | null)?.trip
      const tripOne = Array.isArray(tripRaw) ? tripRaw[0] : tripRaw

      const totalOrders = (salesCounts ?? []).length
      const settledCount = (settledData ?? []).filter(s => Number(s.outstanding_balance) <= 0 || s.write_off_status === 'approved').length
      const totalOutstand = (settledData ?? []).reduce((s, r) => s + Number(r.outstanding_balance ?? 0), 0)

      const info = presaleInfo as { sale_type?: string | null; total_number_of_pallets?: number | null } | null
      const presaleRow = ps as Presale | null

      setContainerStatus({
        trip_status: tripOne?.status ?? 'not_started',
        presale_count: (presaleCounts ?? []).length,
        sale_type: normalizeSaleTypeForStatus(presaleRow?.sale_type ?? info?.sale_type ?? null),
        presale_pallets: Number(presaleRow?.total_number_of_pallets ?? info?.total_number_of_pallets ?? 0),
        pallet_dist_count: (palletDists ?? []).length,
        sales_order_count: totalOrders,
        fully_paid_count: (paidCounts ?? []).length,
        settled_count: settledCount,
        total_outstanding: totalOutstand,
        total_written_off: 0,
      })
    } else {
      setContainerStatus(null)
    }

    setLoading(false)
  }, [presaleId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
    supabase.from('profiles').select('id, full_name, email').eq('is_active', true)
      .then(({ data }) => setEmployees(data ?? []))
  }, [load])

  useEffect(() => {
    if (!presale) return
    setEditForm({
      warehouse_confirmed_avg_weight: presale.warehouse_confirmed_avg_weight?.toString() ?? '',
      price_per_kilo: presale.price_per_kilo?.toString() ?? '',
      price_per_piece: presale.price_per_piece?.toString() ?? '',
    })
  }, [presale])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  async function logActivity(action: string, fieldName?: string, oldValue?: string, newValue?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('presale_activity_log').insert({
      presale_id: presaleId,
      action,
      field_name: fieldName ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      performed_by: user?.id,
    })
  }

  async function updateField(field: string, value: string) {
    if (hasActiveSalesOrder && !overrideConfirmed) return
    const supabase = createClient()
    const oldValue = String((presale as unknown as Record<string, unknown>)[field] ?? '')
    const wasApproved = presale?.approval_status === 'approved'
    const wasReviewed = presale?.approval_status === 'reviewed'

    let updateData: Record<string, unknown> = { [field]: value || null }

    // Revenue from pieces × price/piece (price/piece is edited via pricing form, not derived from weight×kilo here)
    if (field === 'warehouse_confirmed_pieces') {
      const pieces = parseInt(value, 10)
      const pPerPiece = Number(presale?.price_per_piece ?? 0)
      const newRevenue = !isNaN(pieces) && pPerPiece ? pPerPiece * pieces : null
      updateData = { ...updateData, expected_sale_revenue: newRevenue }
    }

    // If approved → set status to 'altered' and needs_review = true
    if (wasApproved) {
      updateData.status = 'altered'
      updateData.needs_review = true
      updateData.approval_status = 'not_approved'
    } else if (wasReviewed) {
      // If reviewed → flag needs_review
      updateData.needs_review = true
    }

    await supabase.from('presales').update(updateData).eq('id', presaleId)
    await logActivity('Updated field', field, oldValue, value)
    setEditField(null)
    load()
    setOverrideConfirmed(false)
  }

  async function savePricingEdit() {
    if (hasActiveSalesOrder && !overrideConfirmed) return
    if (!presale) return
    setSavingPricing(true)
    try {
      const supabase = createClient()
      const wasApproved = presale.approval_status === 'approved'
      const wasReviewed = presale.approval_status === 'reviewed'

      const w = editForm.warehouse_confirmed_avg_weight.trim()
      const k = editForm.price_per_kilo.trim()
      const p = editForm.price_per_piece.trim()

      const wNum = w === '' ? null : parseFloat(w)
      const kNum = k === '' ? null : parseFloat(k)
      const pNum = p === '' ? null : parseFloat(p)

      const pieces = Number(presale.warehouse_confirmed_pieces ?? 0)
      const newRevenue = pNum != null && pieces > 0 ? pNum * pieces : null

      let updateData: Record<string, unknown> = {
        warehouse_confirmed_avg_weight: wNum,
        price_per_kilo: kNum,
        price_per_piece: pNum,
        expected_sale_revenue: newRevenue,
      }

      if (wasApproved) {
        updateData.status = 'altered'
        updateData.needs_review = true
        updateData.approval_status = 'not_approved'
      } else if (wasReviewed) {
        updateData.needs_review = true
      }

      await supabase.from('presales').update(updateData).eq('id', presaleId)
      await logActivity('Updated pricing fields', 'pricing', '', '')
      load()
      setOverrideConfirmed(false)
    } finally {
      setSavingPricing(false)
    }
  }

  async function submitWorkflow() {
    if (!assignee || !workflowType || !presale) return
    setSubmittingWorkflow(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const typeKeys = { delete: 'delete_approval', review: 'review_request', approval: 'approval_request' }
    const typeLabels = { delete: 'Delete approval', review: 'Review request', approval: 'Approval request' }

    // Build changes summary from recent activity logs
    let changesSummary: string | null = null
    if (workflowType === 'review' && activityLogs.length > 0) {
      changesSummary = activityLogs.slice(0, 5)
        .map(l => `${l.action}${l.field_name ? ` (${l.field_name})` : ''}`)
        .join(' · ')
    }

    const { data: task } = await supabase.from('tasks').insert({
      type: typeKeys[workflowType],
      title: `${typeLabels[workflowType]}: ${presale.presale_id}`,
      description: workflowNote || `${typeLabels[workflowType]} for presale ${presale.presale_id}`,
      module: 'presales',
      record_id: presaleId,
      record_ref: presale.presale_id,
      requested_by: user?.id,
      assigned_to: assignee,
      priority: workflowType === 'delete' ? 'high' : 'normal',
      changes_summary: changesSummary,
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: assignee,
      type: `task_${typeKeys[workflowType]}`,
      title: `New task: ${typeLabels[workflowType]}`,
      message: `${presale.presale_id} — ${presale.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}`,
      task_id: task?.id,
      record_id: presaleId,
      record_ref: presale.presale_id,
      module: 'presales',
    })

    await logActivity(`${typeLabels[workflowType]} requested`, 'workflow', '', assignee)

    setSubmittingWorkflow(false)
    setWorkflowOpen(false)
    setWorkflowType(null)
    setWorkflowNote('')
    setAssignee('')
    load()
  }

  async function addPalletRow(e: React.FormEvent) {
    e.preventDefault()
    if (hasActiveSalesOrder && !overrideConfirmed) return
    if (!newPalletPieces || !newPalletCount) return
    setSavingPallet(true)
    const supabase = createClient()
    await supabase.from('presale_pallet_distributions').insert({
      presale_id: presaleId,
      pallet_pieces: parseInt(newPalletPieces),
      number_of_pallets: parseInt(newPalletCount),
    })
    await logActivity('Pallet row added', 'pallets', '', `${newPalletPieces} pcs × ${newPalletCount} pallets`)
    setNewPalletPieces('')
    setNewPalletCount('')
    setSavingPallet(false)
    setAddPalletOpen(false)

    // Flag needs_review if reviewed/approved
    if (presale?.approval_status === 'approved') {
      const supabase2 = createClient()
      await supabase2.from('presales').update({ status: 'altered', needs_review: true, approval_status: 'not_approved' }).eq('id', presaleId)
    } else if (presale?.approval_status === 'reviewed') {
      const supabase2 = createClient()
      await supabase2.from('presales').update({ needs_review: true }).eq('id', presaleId)
    }
    load()
    setOverrideConfirmed(false)
  }

  async function handleOverrideEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!overrideReason.trim()) return
    setOverriding(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Log in presale activity log
    await supabase.from('presale_activity_log').insert({
      presale_id: presale?.id,
      action:     'Admin override — edit while active sales order',
      notes:      `Override reason: ${overrideReason.trim()}`,
      created_by: user?.id,
    } as any)

    // Notify presale creator
    if (presale?.created_by && presale.created_by !== user?.id) {
      await supabase.from('notifications').insert({
        user_id:   presale.created_by,
        type:      'note_mention',
        title:     `Presale details edited — ${presale?.presale_id}`,
        message:   `An administrator has modified presale ${presale?.presale_id} while your sales order is active. Reason: ${overrideReason.trim()}`,
        record_id: presale?.id,
        module:    'presales',
      })
    }

    setOverriding(false)
    setOverrideOpen(false)
    setOverrideReason('')
    setOverrideConfirmed(true)
    setEditOpen(true)
  }

  async function deletePalletRow(id: string) {
    const supabase = createClient()
    await supabase.from('presale_pallet_distributions').delete().eq('id', id)
    await logActivity('Pallet row deleted', 'pallets', '', '')
    if (presale?.approval_status === 'approved') {
      await supabase.from('presales').update({ status: 'altered', needs_review: true, approval_status: 'not_approved' }).eq('id', presaleId)
    } else if (presale?.approval_status === 'reviewed') {
      await supabase.from('presales').update({ needs_review: true }).eq('id', presaleId)
    }
    load()
    setOverrideConfirmed(false)
  }

  const EditableField = ({ fieldKey, label, value, type = 'text' }: {
    fieldKey: string; label: string; value: string; type?: string
  }) => {
    const isEmpty = !value
    const isApproved = presale?.approval_status === 'approved'
    const useAutosave = isEmpty && !isApproved

    return (
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        {editField === fieldKey ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              inputMode={type === 'number' ? 'decimal' : 'text'}
              value={type === 'number' ? fieldValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : fieldValue}
              onChange={e => {
                const raw = type === 'number' ? e.target.value.replace(/,/g, '') : e.target.value
                if (type === 'number' && raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
                setFieldValue(raw)
              }}
              onBlur={() => { if (useAutosave && fieldValue !== value) updateField(fieldKey, fieldValue) }}
              onWheel={e => { e.preventDefault(); e.currentTarget.blur() }}
              onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault() }}
              className="flex-1 px-2 py-1.5 text-sm border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0"
              autoFocus />
            {!useAutosave && (
              <>
                <button type="button" onClick={() => updateField(fieldKey, fieldValue)}
                  className="p-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shrink-0">
                  <Check size={13} />
                </button>
                <button type="button" onClick={() => setEditField(null)}
                  className="p-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors shrink-0">
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        ) : (
          <button type="button"
            onClick={() => { setEditField(fieldKey); setFieldValue(value) }}
            disabled={!editOpen || (hasActiveSalesOrder && !overrideConfirmed)}
            className="group w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-brand-50 transition-colors">
            <span className={`text-sm truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
              {value || 'Not set'}
            </span>
            <Pencil size={11} className="text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
          </button>
        )}
      </div>
    )
  }

  // Pallet validation
  const palletPiecesTotal = pallets.reduce((s, p) => s + p.pallet_pieces * p.number_of_pallets, 0)
  const palletCountTotal = pallets.reduce((s, p) => s + p.number_of_pallets, 0)
  const piecesTally = presale?.warehouse_confirmed_pieces
    ? palletPiecesTotal === presale.warehouse_confirmed_pieces : null
  const palletsTally = presale?.total_number_of_pallets
    ? palletCountTotal === presale.total_number_of_pallets : null

  const statusCfg = STATUS_CONFIG[presale?.status ?? 'draft'] ?? STATUS_CONFIG['draft']

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!presale) return <div className="text-center py-16 text-gray-400">Presale not found.</div>

  const pricingLocked = !editOpen || (hasActiveSalesOrder && !overrideConfirmed)
  const ppLive = parseFloat(editForm.price_per_piece)
  const pricingRevenueLive =
    editForm.price_per_piece.trim() !== '' && !isNaN(ppLive) && presale.warehouse_confirmed_pieces != null
      ? ppLive * Number(presale.warehouse_confirmed_pieces)
      : null

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/sales/presales"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{presale.presale_id}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${presale.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                {presale.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
              {presale.needs_review && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Modified since last review
                </span>
              )}
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mt-0.5">
              {presale.container?.tracking_number ?? presale.container?.container_id ?? 'Presale'}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-xs text-gray-400">
                Created by <span className="text-gray-600">{presale.created_by_profile?.full_name ?? presale.created_by_profile?.email ?? '—'}</span>
              </span>
              <span className="text-xs text-gray-400">on {new Date(presale.created_at).toLocaleDateString()}</span>
              {presale.last_reviewed_at && (
                <>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">
                    Last reviewed by <span className="text-gray-600">{presale.last_reviewer?.full_name ?? presale.last_reviewer?.email ?? '—'}</span>
                  </span>
                  <span className="text-xs text-gray-400">on {new Date(presale.last_reviewed_at).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium border
            ${presale.approval_status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
              presale.approval_status === 'reviewed' ? 'bg-brand-50 text-brand-700 border-brand-200' :
              'bg-amber-50 text-amber-700 border-amber-200'}`}>
            {presale.approval_status === 'approved' ? '✓ Approved' :
             presale.approval_status === 'reviewed' ? '✓ Reviewed' : 'Not approved'}
          </span>
          {hasActiveSalesOrder && !overrideConfirmed ? (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg cursor-not-allowed">
                <Lock size={14} />
                Locked — active sales order
              </div>
              {canOverride && (
                <button onClick={() => setOverrideOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">
                  <AlertTriangle size={14} /> Override & edit
                </button>
              )}
            </div>
          ) : (
            <button onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              <Pencil size={14} /> Edit presale
            </button>
          )}
          <button onClick={() => { setWorkflowType('review'); setWorkflowOpen(true) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
            <Eye size={13} /> Request review
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

      {/* Altered warning */}
      {presale.status === 'altered' && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-xl border border-orange-200">
          <AlertTriangle size={16} className="text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">This presale has been modified after approval</p>
            <p className="text-xs text-orange-600 mt-0.5">Status has been reset to <strong>Altered</strong>. A new approval request is required before this presale can be confirmed again.</p>
          </div>
        </div>
      )}

      {hasActiveSalesOrder && !overrideConfirmed && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Presale locked — active sales order exists</p>
            <p className="text-xs text-amber-600 mt-0.5">
              This container has an active sales order
              {salesOrderRef ? ` (${salesOrderRef})` : ''}.
              Presale details cannot be modified while a sales order is outstanding.
              Contact an administrator if changes are required.
            </p>
          </div>
        </div>
      )}

      <Modal open={overrideOpen} onClose={() => setOverrideOpen(false)} title="Override edit lock" size="sm">
        <form onSubmit={handleOverrideEdit} className="space-y-4">
          <div className="p-3 bg-red-50 rounded-xl border border-red-100">
            <p className="text-xs font-semibold text-red-800">Admin override — this action is logged</p>
            <p className="text-xs text-red-600 mt-1">
              This presale has an active sales order ({salesOrderRef}).
              Editing may affect ongoing sales. The presale creator will be notified.
              Your reason will be recorded in the activity log.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Reason for override <span className="text-red-400">*</span>
            </label>
            <textarea required rows={3} value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="Explain why you need to edit this presale while a sales order is active..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOverrideOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={overriding || !overrideReason.trim()}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {overriding ? <><Loader2 size={14} className="animate-spin" /> Processing…</> : 'Confirm override'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Container info */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-700">Container information</h2>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {(
            [
              { label: 'Container ID', value: presale.container?.container_id ?? '—' },
              { label: 'Tracking No.', value: presale.container?.tracking_number ?? '—' },
              { label: 'Title', value: presale.container?.container_number ?? '—' },
              { label: 'Pieces', value: presale.container?.pieces_purchased?.toLocaleString() ?? '—' },
              { label: 'Avg weight', value: presale.container?.average_weight ? `${presale.container.average_weight} kg` : '—' },
              { label: 'Status', pipeline: true as const },
              { label: 'Trip', value: presale.container?.trip?.trip_id ?? '—' },
              { label: 'Trip location', value: presale.container?.trip?.source_location ?? '—' },
            ] as (
              | { label: string; value: string; pipeline?: undefined }
              | { label: string; pipeline: true }
            )[]
          ).map(item => (
            <div key={item.label}>
              <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
              {'pipeline' in item && item.pipeline ? (
                containerStatus ? (() => {
                  const computedStatus = computeContainerStatus(containerStatus)
                  const badge = getContainerStatusBadge(computedStatus)
                  return (
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                        ${badge.stage === 'Trip' ? 'bg-blue-50 text-blue-600' :
                          badge.stage === 'Presale' ? 'bg-purple-50 text-purple-600' :
                          badge.stage === 'Sale' ? 'bg-amber-50 text-amber-600' :
                          badge.stage === 'Recovery' ? 'bg-green-50 text-green-600' :
                          'bg-gray-100 text-gray-500'}`}>
                        {badge.stage}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                    </div>
                  )
                })() : (
                  <p className="text-sm font-medium text-gray-400">—</p>
                )
              ) : (
                <p className="text-sm font-medium text-gray-900">{'value' in item ? item.value : '—'}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs — Details + Activity log */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'details', label: 'Presale details' },
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
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">W/H avg weight (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.warehouse_confirmed_avg_weight}
                  onChange={e => {
                    const weight = e.target.value
                    setEditForm(f => {
                      const piece = f.price_per_kilo && weight
                        ? (parseFloat(f.price_per_kilo) * parseFloat(weight)).toFixed(4)
                        : f.price_per_piece
                      return { ...f, warehouse_confirmed_avg_weight: weight, price_per_piece: piece }
                    })
                  }}
                  disabled={pricingLocked}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="0.00"
                />
              </div>
              <EditableField fieldKey="warehouse_confirmed_pieces" label="W/H confirmed pieces"
                value={presale.warehouse_confirmed_pieces?.toString() ?? ''} type="number" />
              <EditableField fieldKey="supplier_loaded_pieces" label="Supplier loaded pieces"
                value={presale.supplier_loaded_pieces?.toString() ?? ''} type="number" />
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Price per kilo (₦)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.price_per_kilo}
                  onChange={e => {
                    const kilo = e.target.value
                    setEditForm(f => {
                      const weight = f.warehouse_confirmed_avg_weight
                      const piece = kilo && weight
                        ? (parseFloat(kilo) * parseFloat(weight)).toFixed(4)
                        : f.price_per_piece
                      return { ...f, price_per_kilo: kilo, price_per_piece: piece }
                    })
                  }}
                  disabled={pricingLocked}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Price per piece (₦)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={editForm.price_per_piece}
                  onChange={e => {
                    const piece = e.target.value
                    setEditForm(f => {
                      const weight = f.warehouse_confirmed_avg_weight
                      const kilo = piece && weight && parseFloat(weight) > 0
                        ? (parseFloat(piece) / parseFloat(weight)).toFixed(4)
                        : f.price_per_kilo
                      return { ...f, price_per_piece: piece, price_per_kilo: kilo }
                    })
                  }}
                  disabled={pricingLocked}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="0.0000"
                />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Expected sale revenue (₦)</p>
                <div className={`px-2 py-1.5 rounded-lg text-sm border ${(pricingRevenueLive ?? presale.expected_sale_revenue) != null ? 'bg-green-50 border-green-200 text-green-700 font-semibold' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                  {(pricingRevenueLive ?? presale.expected_sale_revenue) != null
                    ? fmt((pricingRevenueLive ?? presale.expected_sale_revenue)!)
                    : '—'}
                </div>
              </div>
              <div className="col-span-2 md:col-span-3 flex justify-end">
                <button type="button"
                  disabled={pricingLocked || savingPricing}
                  onClick={() => void savePricingEdit()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
                  {savingPricing ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save pricing'}
                </button>
              </div>
              {presale.sale_type === 'split_sale' && (
                <EditableField fieldKey="total_number_of_pallets" label="Total number of pallets"
                  value={presale.total_number_of_pallets?.toString() ?? ''} type="number" />
              )}
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
                        <span className="font-medium text-gray-900">
                          {log.performer?.full_name ?? log.performer?.email ?? 'System'}
                        </span>
                        {' '}<span className="text-gray-500">{log.action}</span>
                        {log.field_name && <span className="text-xs text-gray-400 ml-1">· {log.field_name}</span>}
                      </p>
                      {(log.old_value || log.new_value) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {log.old_value && <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded line-through">{log.old_value}</span>}
                          {log.old_value && log.new_value && <span className="text-xs text-gray-400">→</span>}
                          {log.new_value && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{log.new_value}</span>}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pallet distribution — split sale only */}
      {presale.sale_type === 'split_sale' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Pallet distribution</h2>
            <button onClick={() => setAddPalletOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <Plus size={13} /> Add row
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Pallet pieces', 'No. of pallets', 'Subtotal pieces', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pallets.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No pallet rows yet.</td></tr>
                ) : pallets.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.pallet_pieces.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-gray-700">{p.number_of_pallets}</td>
                    <td className="px-4 py-2.5 font-semibold text-brand-700">{(p.pallet_pieces * p.number_of_pallets).toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => deletePalletRow(p.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {pallets.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Totals</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-700">{palletCountTotal} pallets</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-700">{palletPiecesTotal.toLocaleString()} pcs</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {pallets.length > 0 && (
            <div className="px-5 py-3 space-y-2 border-t border-gray-100">
              {presale.warehouse_confirmed_pieces && (
                piecesTally ? (
                  <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 font-medium">Pieces tally ✓ — {palletPiecesTotal.toLocaleString()} matches W/H confirmed pieces ({presale.warehouse_confirmed_pieces.toLocaleString()})</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200">
                    <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">Pallet pieces ({palletPiecesTotal.toLocaleString()}) doesn't tally with W/H confirmed pieces ({presale.warehouse_confirmed_pieces.toLocaleString()})</p>
                  </div>
                )
              )}
              {presale.total_number_of_pallets && (
                palletsTally ? (
                  <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 font-medium">Pallets tally ✓ — {palletCountTotal} matches total number of pallets ({presale.total_number_of_pallets})</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-200">
                    <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">Number of pallets ({palletCountTotal}) doesn't tally with total ({presale.total_number_of_pallets})</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Add pallet modal */}
      <Modal open={addPalletOpen} onClose={() => setAddPalletOpen(false)} title="Add pallet row" size="sm">
        <form onSubmit={addPalletRow} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pallet pieces <span className="text-red-400">*</span></label>
            <input required type="number" value={newPalletPieces} onChange={e => setNewPalletPieces(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of pallets <span className="text-red-400">*</span></label>
            <input required type="number" value={newPalletCount} onChange={e => setNewPalletCount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="0" />
          </div>
          {newPalletPieces && newPalletCount && (
            <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
              Subtotal: <span className="font-semibold text-gray-900">{(parseInt(newPalletPieces) * parseInt(newPalletCount)).toLocaleString()} pieces</span>
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setAddPalletOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={savingPallet}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {savingPallet ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Add row'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Workflow modal */}
      <Modal
        open={workflowOpen}
        onClose={() => { setWorkflowOpen(false); setWorkflowType(null); setWorkflowNote(''); setAssignee('') }}
        title={
          workflowType === 'delete' ? 'Request presale deletion' :
          workflowType === 'review' ? 'Request presale review' :
          'Request presale approval'
        }
        description="Select a user to assign this task to"
        size="sm"
      >
        <div className="space-y-4">
          {workflowType === 'delete' && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700 font-medium">The presale will only be deleted after the assigned user approves it.</p>
            </div>
          )}
          {workflowType === 'review' && (
            <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
              <p className="text-xs text-brand-700 font-medium">The reviewer will see a summary of changes and can approve or reject from the presale page.</p>
            </div>
          )}
          {workflowType === 'approval' && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <p className="text-xs text-green-700 font-medium">Once approved, this presale will be marked as <strong>Confirmed</strong>.</p>
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
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Add context for the assignee..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setWorkflowOpen(false); setWorkflowType(null) }}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={submitWorkflow} disabled={submittingWorkflow || !assignee}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2
                ${workflowType === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' :
                  workflowType === 'approval' ? 'bg-green-600 text-white hover:bg-green-700' :
                  'bg-brand-600 text-white hover:bg-brand-700'}`}>
              {submittingWorkflow ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit request'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

