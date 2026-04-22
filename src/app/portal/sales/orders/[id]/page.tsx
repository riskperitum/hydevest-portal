'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, FileText, CheckCircle2, Trash2,
  Loader2, Check, X, Pencil, Eye, Activity, AlertTriangle, ChevronDown,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { usePermissions, can } from '@/lib/permissions/hooks'

interface SalesOrder {
  id: string
  order_id: string
  sale_type: string
  sale_amount: number
  discount: number
  overages: number
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  payment_method: string
  payment_status: string
  approval_status: string
  needs_approval: boolean
  last_approved_at: string | null
  last_approved_by: string | null
  status: string
  created_at: string
  write_off_status: string | null
  written_off_amount: number | null
  written_off_note: string | null
  written_off_by: string | null
  written_off_at: string | null
  container: {
    container_id: string
    tracking_number: string | null
    container_number: string | null
    trip: { trip_id: string; title: string; source_location: string | null } | null
  } | null
  presale: {
    presale_id: string
    sale_type: string
    warehouse_confirmed_avg_weight: number | null
    warehouse_confirmed_pieces: number | null
    price_per_kilo: number | null
    price_per_piece: number | null
    expected_sale_revenue: number | null
    total_number_of_pallets: number | null
  } | null
  customer: { id: string; name: string; customer_id: string; phone: string | null } | null
  created_by_profile: { full_name: string | null; email: string } | null
  last_approver: { full_name: string | null; email: string } | null
}

interface PalletLine {
  id: string
  pallets_sold: number
  pieces_per_pallet: number
  total_pieces: number
  selling_price_per_piece: number
  line_total: number
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

const PAYMENT_STATUS_CONFIG = {
  paid:        { label: 'Fully paid',   color: 'bg-green-50 text-green-700 border-green-200' },
  partial:     { label: 'Partial',      color: 'bg-amber-50 text-amber-700 border-amber-200' },
  outstanding: { label: 'Outstanding',  color: 'bg-red-50 text-red-600 border-red-200' },
}

const APPROVAL_STATUS_CONFIG = {
  approved: { label: 'Approved',       color: 'bg-green-50 text-green-700 border-green-200' },
  pending:  { label: 'Pending approval', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  rejected: { label: 'Rejected',       color: 'bg-red-50 text-red-600 border-red-200' },
}

export default function SalesOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [palletLines, setPalletLines] = useState<PalletLine[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details')
  const [presaleOpen, setPresaleOpen] = useState(false)

  const [editField, setEditField] = useState<string | null>(null)
  const [fieldValue, setFieldValue] = useState('')

  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [workflowType, setWorkflowType] = useState<'delete' | 'approval' | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [submittingWorkflow, setSubmittingWorkflow] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const { permissions, isSuperAdmin } = usePermissions()
  const canViewActivity = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*')
  const canEditOrder    = isSuperAdmin || can(permissions, isSuperAdmin, 'sales_orders.edit')
  const canDeleteOrder  = isSuperAdmin || can(permissions, isSuperAdmin, 'sales_orders.delete')
  const canApproveOrder = isSuperAdmin || can(permissions, isSuperAdmin, 'sales_orders.approve')
  const canWriteOff     = isSuperAdmin || can(permissions, isSuperAdmin, 'sales_orders.write_off')

  const [writeOffOpen, setWriteOffOpen] = useState(false)
  const [writeOffNote, setWriteOffNote] = useState('')
  const [writeOffAmount, setWriteOffAmount] = useState('')
  const [writeOffSaving, setWriteOffSaving] = useState(false)
  const [writeOffError, setWriteOffError] = useState('')
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string | null } | null>(null)

  const displayedTab: 'details' | 'activity' =
    !canViewActivity && activeTab === 'activity' ? 'details' : activeTab

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: o }, { data: pl }, { data: al }] = await Promise.all([
      // * includes write_off_status, written_off_amount, written_off_note, written_off_by, written_off_at when present on sales_orders
      supabase.from('sales_orders')
        .select(`*,
          container:containers(container_id, tracking_number, container_number,
            trip:trips(trip_id, title, source_location)),
          presale:presales(presale_id, sale_type, warehouse_confirmed_avg_weight,
            warehouse_confirmed_pieces, price_per_kilo, price_per_piece,
            expected_sale_revenue, total_number_of_pallets),
          customer:customers(id, name, customer_id, phone),
          created_by_profile:profiles!sales_orders_created_by_fkey(full_name, email),
          last_approver:profiles!sales_orders_last_approved_by_fkey(full_name, email)
        `)
        .eq('id', orderId)
        .single(),
      supabase.from('sales_order_pallets')
        .select('*')
        .eq('order_id', orderId),
      supabase.from('sales_order_activity_log')
        .select('*, performer:profiles!sales_order_activity_log_performed_by_fkey(full_name, email)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false }),
    ])
    setOrder(o)
    setPalletLines(pl ?? [])
    setActivityLogs(al ?? [])
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    load()
    const supabase = createClient()
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)
      if (!user) return
      const { data } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single()
      setCurrentUser(data)
    })
    void getAdminProfiles().then(data => setEmployees(data))
  }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  async function logActivity(action: string, fieldName?: string, oldValue?: string, newValue?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('sales_order_activity_log').insert({
      order_id: orderId,
      action, field_name: fieldName ?? null,
      old_value: oldValue ?? null, new_value: newValue ?? null,
      performed_by: user?.id,
    })
  }

  async function submitWriteOff(e: React.FormEvent) {
    e.preventDefault()
    if (!order || !currentUser) return
    setWriteOffError('')
    const amount = parseFloat(writeOffAmount)
    if (!amount || amount <= 0) { setWriteOffError('Enter a valid amount.'); return }
    if (amount > order.outstanding_balance) { setWriteOffError('Amount cannot exceed outstanding balance.'); return }
    if (!writeOffNote.trim()) { setWriteOffError('A note is required for write-offs.'); return }
    setWriteOffSaving(true)
    const supabase = createClient()

    try {
      const bdSeq = Date.now().toString().slice(-5)
      const taskSeq = Date.now().toString().slice(-4) + Math.floor(Math.random() * 10)

      let containerUuid: string | null = null
      if (order.container?.container_id) {
        const { data: conRow } = await supabase
          .from('containers')
          .select('id')
          .eq('container_id', order.container.container_id)
          .maybeSingle()
        containerUuid = conRow?.id ?? null
      }

      await supabase.from('bad_debts').insert({
        bad_debt_id:    `BD-${bdSeq}`,
        sales_order_id: order.id,
        container_id:   containerUuid,
        customer_id:    order.customer?.id ?? null,
        amount_ngn:     amount,
        note:           writeOffNote.trim(),
        status:         'pending',
        requested_by:   currentUser.id,
      })

      await supabase.from('sales_orders').update({
        write_off_status:    'pending_approval',
        written_off_amount:  amount,
        written_off_note:    writeOffNote.trim(),
        written_off_by:      currentUser.id,
      }).eq('id', order.id)

      await supabase.from('tasks').insert({
        task_id:      `TASK-${taskSeq}`,
        title:        `Approve write-off — ${order.order_id} (${order.customer?.name ?? 'Customer'})`,
        module:       'sales_orders',
        record_id:    order.id,
        record_ref:   order.order_id,
        status:       'pending',
        priority:     'high',
        requested_by: currentUser.id,
        type:         'write_off',
        description:  `Write-off of ₦${amount.toLocaleString()} — ${writeOffNote.trim()}`,
      })

      const { data: adminRows } = await supabase
        .from('user_roles')
        .select('user_id, roles(name)')
      for (const admin of adminRows ?? []) {
        const roleName = (admin.roles as { name?: string } | null)?.name
        if (roleName === 'admin' || roleName === 'super_admin') {
          await supabase.from('notifications').insert({
            user_id:   admin.user_id,
            type:      'task_assigned',
            title:     `Write-off request — ${order.order_id}`,
            message:   `₦${amount.toLocaleString()} write-off requested for ${order.customer?.name ?? 'Customer'}`,
            record_id: order.id,
            module:    'sales_orders',
          })
        }
      }

      setWriteOffOpen(false)
      setWriteOffNote('')
      setWriteOffAmount('')
      await load()
    } catch (err) {
      console.error(err)
      setWriteOffError('Something went wrong. Please try again.')
    } finally {
      setWriteOffSaving(false)
    }
  }

  async function approveWriteOff() {
    if (!order || !currentUser) return
    const supabase = createClient()
    const written = Number(order.written_off_amount ?? 0)
    const newOutstanding = Math.max(0, order.outstanding_balance - written)
    const newPaymentStatus = newOutstanding <= 0 ? 'paid' : order.payment_status

    await supabase.from('sales_orders').update({
      write_off_status:   'approved',
      written_off_at:     new Date().toISOString(),
      outstanding_balance: newOutstanding,
      payment_status:     newPaymentStatus,
    }).eq('id', order.id)

    await supabase.from('bad_debts').update({
      status:      'approved',
      approved_by: currentUser.id,
      approved_at: new Date().toISOString(),
    }).eq('sales_order_id', order.id).eq('status', 'pending')

    await supabase.from('tasks').update({ status: 'actioned' })
      .eq('record_id', order.id)
      .eq('type', 'write_off')
      .eq('status', 'pending')

    if (order.written_off_by) {
      await supabase.from('notifications').insert({
        user_id:   order.written_off_by,
        type:      'task_approved',
        title:     `Write-off approved — ${order.order_id}`,
        message:   `₦${written.toLocaleString()} write-off has been approved.`,
        record_id: order.id,
        module:    'sales_orders',
      })
    }

    await load()
  }

  async function rejectWriteOff() {
    if (!order || !currentUser) return
    const supabase = createClient()

    await supabase.from('sales_orders').update({
      write_off_status:   'rejected',
      written_off_amount: 0,
      written_off_note:   null,
    }).eq('id', order.id)

    await supabase.from('bad_debts').update({ status: 'rejected' })
      .eq('sales_order_id', order.id).eq('status', 'pending')

    await supabase.from('tasks').update({ status: 'rejected' })
      .eq('record_id', order.id)
      .eq('type', 'write_off')
      .eq('status', 'pending')

    await load()
  }

  async function updateField(field: string, value: string) {
    const supabase = createClient()
    const oldValue = String((order as unknown as Record<string, unknown>)[field] ?? '')
    const wasApproved = order?.approval_status === 'approved'

    let updateData: Record<string, unknown> = { [field]: value || null }

    // Recalculate financials if relevant fields change
    const newSaleAmount = field === 'sale_amount' ? parseFloat(value) || 0 : Number(order?.sale_amount ?? 0)
    const newDiscount = field === 'discount' ? parseFloat(value) || 0 : Number(order?.discount ?? 0)
    const newOverages = field === 'overages' ? parseFloat(value) || 0 : Number(order?.overages ?? 0)
    const newAmountPaid = field === 'amount_paid' ? parseFloat(value) || 0 : Number(order?.amount_paid ?? 0)

    if (['sale_amount', 'discount', 'overages', 'amount_paid'].includes(field)) {
      const newPayable = newSaleAmount - newDiscount + newOverages
      const newOutstanding = Math.max(newPayable - newAmountPaid, 0)
      const newPaymentStatus = newAmountPaid <= 0 ? 'outstanding' : newOutstanding <= 0 ? 'paid' : 'partial'
      updateData = {
        ...updateData,
        customer_payable: newPayable,
        outstanding_balance: newOutstanding,
        payment_status: newPaymentStatus,
      }

      // If amount_paid was changed, handle recovery entries
      if (field === 'amount_paid') {
        const oldAmountPaid = Number(order?.amount_paid ?? 0)
        const delta = newAmountPaid - oldAmountPaid

        // Check if an initial recovery exists
        const { data: existingInitial } = await supabase
          .from('recoveries')
          .select('id, amount_paid')
          .eq('sales_order_id', orderId)
          .eq('payment_type', 'initial')
          .maybeSingle()

        const { data: { user: currentUser } } = await supabase.auth.getUser()

        if (existingInitial) {
          // Update existing initial recovery to new amount
          await supabase.from('recoveries').update({
            amount_paid: newAmountPaid,
          }).eq('id', existingInitial.id)
        } else if (delta > 0) {
          // No initial recovery exists yet — create one with the full new amount
          await supabase.from('recoveries').insert({
            sales_order_id: orderId,
            customer_id: order?.customer?.id,
            payment_type: 'initial',
            amount_paid: newAmountPaid,
            payment_date: new Date().toISOString().split('T')[0],
            payment_method: 'transfer',
            approval_status: 'approved',
            created_by: currentUser?.id,
          })
        }

        // Also update initial_payment field on sales_order to keep it in sync
        updateData.initial_payment = newAmountPaid
      }
    }

    // Flag needs approval if was approved
    if (wasApproved) {
      updateData.needs_approval = true
      updateData.approval_status = 'pending'
    }

    await supabase.from('sales_orders').update(updateData).eq('id', orderId)
    await logActivity('Updated field', field, oldValue, value)
    setEditField(null)
    load()
  }

  async function submitWorkflow() {
    if (!assignee || !workflowType || !order) return
    setSubmittingWorkflow(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const typeKeys = { delete: 'delete_approval', approval: 'approval_request' }
    const typeLabels = { delete: 'Delete approval', approval: 'Approval request' }

    const { data: task } = await supabase.from('tasks').insert({
      type: typeKeys[workflowType],
      title: `${typeLabels[workflowType]}: ${order.order_id}`,
      description: workflowNote || `${typeLabels[workflowType]} for sales order ${order.order_id}`,
      module: 'sales_orders',
      record_id: orderId,
      record_ref: order.order_id,
      requested_by: user?.id,
      assigned_to: assignee,
      priority: workflowType === 'delete' ? 'high' : 'normal',
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: assignee,
      type: `task_${typeKeys[workflowType]}`,
      title: `New task: ${typeLabels[workflowType]}`,
      message: `${order.order_id} — ${order.customer?.name ?? ''}`,
      task_id: task?.id,
      record_id: orderId,
      record_ref: order.order_id,
      module: 'sales_orders',
    })

    await logActivity(`${typeLabels[workflowType]} requested`, 'workflow', '', assignee)
    setSubmittingWorkflow(false)
    setWorkflowOpen(false)
    setWorkflowType(null)
    setWorkflowNote('')
    setAssignee('')
    load()
  }

  const EditableField = ({ fieldKey, label, value, type = 'text' }: {
    fieldKey: string; label: string; value: string; type?: string
  }) => (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      {editField === fieldKey ? (
        <div className="flex gap-1.5">
          <input type={type} value={fieldValue}
            onChange={e => setFieldValue(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            autoFocus />
          {canEditOrder && (
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
      ) : canEditOrder ? (
        <button type="button"
          onClick={() => { setEditField(fieldKey); setFieldValue(value) }}
          className="group w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-brand-50 transition-colors">
          <span className={`text-sm truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
            {value || 'Not set'}
          </span>
          <Pencil size={11} className="text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
        </button>
      ) : (
        <div className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg">
          <span className={`text-sm truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
            {value || 'Not set'}
          </span>
        </div>
      )}
    </div>
  )

  const AmountEditableField = ({ fieldKey, label, value }: {
    fieldKey: string; label: string; value: string
  }) => {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [localRaw, setLocalRaw] = useState(value)
    const [localDisplay, setLocalDisplay] = useState(formatAmount(value))

    function formatAmount(raw: string): string {
      if (!raw) return ''
      const clean = String(raw).replace(/[^0-9.]/g, '')
      if (!clean) return ''
      const parts = clean.split('.')
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      if (parts.length > 1) return `${intPart}.${parts[1]}`
      return intPart
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const input = e.target
      const cursorPos = input.selectionStart ?? 0
      const oldDisplay = localDisplay
      const rawTyped = input.value.replace(/,/g, '')
      if (rawTyped !== '' && !/^\d*\.?\d*$/.test(rawTyped)) return
      const newDisplay = formatAmount(rawTyped)
      setLocalDisplay(newDisplay)
      setLocalRaw(rawTyped)
      requestAnimationFrame(() => {
        if (!inputRef.current) return
        const addedCommas = (newDisplay.slice(0, cursorPos).match(/,/g) ?? []).length
        const oldCommas = (oldDisplay.slice(0, cursorPos).match(/,/g) ?? []).length
        const diff = addedCommas - oldCommas
        const newCursor = cursorPos + diff
        inputRef.current.setSelectionRange(newCursor, newCursor)
      })
    }

    function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
      e.preventDefault()
      inputRef.current?.blur()
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
    }

    function formatDisplayValue(raw: string): string {
      if (!raw) return ''
      const clean = String(raw).replace(/[^0-9.]/g, '')
      if (!clean) return ''
      const parts = clean.split('.')
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      if (parts.length > 1) return `${intPart}.${parts[1]}`
      return intPart
    }

    return (
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        {editField === fieldKey ? (
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={localDisplay}
              onChange={handleChange}
              onWheel={handleWheel}
              onKeyDown={handleKeyDown}
              autoFocus
              className="flex-1 px-2 py-1.5 text-sm border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0"
            />
            {canEditOrder && (
              <>
                <button type="button" onClick={() => updateField(fieldKey, localRaw)}
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
        ) : canEditOrder ? (
          <button type="button"
            onClick={() => {
              setLocalRaw(value)
              setLocalDisplay(formatDisplayValue(value))
              setEditField(fieldKey)
            }}
            className="group w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-brand-50 transition-colors">
            <span className={`text-sm truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
              {value ? `₦${formatDisplayValue(value)}` : 'Not set'}
            </span>
            <Pencil size={11} className="text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
          </button>
        ) : (
          <div className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg">
            <span className={`text-sm truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
              {value ? `₦${formatDisplayValue(value)}` : 'Not set'}
            </span>
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!order) return <div className="text-center py-16 text-gray-400">Order not found.</div>

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">{order.order_id}</h1>
          </div>
          <p className="text-sm text-gray-500 ml-8 mb-1.5">
            {order.customer?.name ?? '—'} · {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {/* Status badges below the customer name */}
          <div className="flex items-center gap-2 flex-wrap ml-8">
            {/* Payment status */}
            {(() => {
              const cfg = PAYMENT_STATUS_CONFIG[order.payment_status as keyof typeof PAYMENT_STATUS_CONFIG] ?? PAYMENT_STATUS_CONFIG.outstanding
              return (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}>
                  {cfg.label}
                </span>
              )
            })()}
            {/* Approval status */}
            {(() => {
              const cfg = APPROVAL_STATUS_CONFIG[order.approval_status as keyof typeof APPROVAL_STATUS_CONFIG] ?? APPROVAL_STATUS_CONFIG.pending
              return (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}>
                  {cfg.label}
                </span>
              )
            })()}
            {/* Write-off status */}
            {order.write_off_status === 'pending_approval' && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-red-50 text-red-600 border-red-200">
                Write-off pending
              </span>
            )}
            {order.write_off_status === 'approved' && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-gray-100 text-gray-500 border-gray-200">
                Written off
              </span>
            )}
            {/* Needs review flag */}
            {order.needs_approval && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                Modified — needs approval
              </span>
            )}
          </div>
        </div>

        {/* Action buttons — always top right */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => router.push(`/portal/sales/orders/${params.id}/invoice`)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
            style={{ background: '#55249E' }}>
            <FileText size={14} /> View invoice
          </button>
          {order.approval_status !== 'approved' && (
            <button onClick={() => { setWorkflowType('approval'); setWorkflowOpen(true) }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100">
              <CheckCircle2 size={14} /> Request approval
            </button>
          )}
          {canDeleteOrder && (
            <button onClick={() => { setWorkflowType('delete'); setWorkflowOpen(true) }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Needs approval warning */}
      {order.needs_approval && order.approval_status !== 'approved' && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">This sale requires approval</p>
            <p className="text-xs text-amber-600 mt-0.5">Use the Request approval button to send this for review.</p>
          </div>
        </div>
      )}

      {/* Container + Presale info */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-700">Container information</h2>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Container ID', value: order.container?.container_id ?? '—' },
            { label: 'Tracking No.', value: order.container?.tracking_number ?? '—' },
            { label: 'Trip', value: order.container?.trip?.trip_id ?? '—' },
            { label: 'Trip location', value: order.container?.trip?.source_location ?? '—' },
          ].map(item => (
            <div key={item.label}>
              <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
              <p className="text-sm font-medium text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Collapsible presale summary */}
        <div className="border-t border-gray-100">
          <button onClick={() => setPresaleOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
            <span className="text-sm font-semibold text-gray-700">Presale summary</span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${presaleOpen ? 'rotate-180' : ''}`} />
          </button>
          {presaleOpen && order.presale && (
            <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-50">
              {[
                { label: 'Presale ID', value: order.presale.presale_id },
                { label: 'W/H avg weight', value: order.presale.warehouse_confirmed_avg_weight ? `${order.presale.warehouse_confirmed_avg_weight} kg` : '—' },
                { label: 'W/H pieces', value: order.presale.warehouse_confirmed_pieces?.toLocaleString() ?? '—' },
                { label: 'Price / kilo', value: order.presale.price_per_kilo ? fmt(order.presale.price_per_kilo) : '—' },
                { label: 'Price / piece', value: order.presale.price_per_piece ? fmt(order.presale.price_per_piece) : '—' },
                { label: 'Expected revenue', value: order.presale.expected_sale_revenue ? fmt(order.presale.expected_sale_revenue) : '—' },
                { label: 'Total pallets', value: order.presale.total_number_of_pallets?.toString() ?? '—' },
              ].map(item => (
                <div key={item.label} className="mt-4">
                  <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-medium text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pallet lines — split sale */}
      {order.sale_type === 'split_sale' && palletLines.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-sm font-semibold text-gray-700">Pallet breakdown</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Pallet type', 'Pallets purchased', 'Total pieces', 'Sell price / piece', 'Line total'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {palletLines.map(l => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{l.pieces_per_pallet.toLocaleString()} pcs/pallet</td>
                  <td className="px-4 py-3 text-gray-700">{l.pallets_sold}</td>
                  <td className="px-4 py-3 text-gray-700">{l.total_pieces.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-700">{fmt(l.selling_price_per_piece)}</td>
                  <td className="px-4 py-3 font-semibold text-brand-700">{fmt(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Total</td>
                <td className="px-4 py-2.5 text-xs font-bold text-gray-700">{palletLines.reduce((s, l) => s + l.total_pieces, 0).toLocaleString()} pcs</td>
                <td />
                <td className="px-4 py-2.5 text-xs font-bold text-brand-700">{fmt(palletLines.reduce((s, l) => s + l.line_total, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tabs — Sale details + Activity */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'details' as const, label: 'Sale details' },
            ...(canViewActivity ? [{ key: 'activity' as const, label: 'Activity log', count: activityLogs.length }] : []),
          ].map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${displayedTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              {'count' in tab && tab.count != null && tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${displayedTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {displayedTab === 'details' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Customer</p>
                <button type="button" onClick={() => router.push(`/portal/accounts/customers/${order.customer?.id}`)}
                  className="text-sm font-semibold text-brand-600 hover:underline text-left">
                  {order.customer?.name ?? '—'}
                </button>
                <p className="text-xs text-gray-400">{order.customer?.customer_id} {order.customer?.phone ? `· ${order.customer.phone}` : ''}</p>
              </div>
              {order.sale_type === 'box_sale' && (
                <AmountEditableField fieldKey="sale_amount" label="Sale amount (₦)"
                  value={order.sale_amount?.toString() ?? ''} />
              )}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payment method</p>
                {canEditOrder ? (
                  <select value={order.payment_method}
                    onChange={async e => {
                      const supabase = createClient()
                      await supabase.from('sales_orders').update({ payment_method: e.target.value }).eq('id', orderId)
                      await logActivity('Updated field', 'payment_method', order.payment_method, e.target.value)
                      load()
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                    <option value="transfer">Bank transfer</option>
                    <option value="cash">Cash</option>
                  </select>
                ) : (
                  <p className="text-sm font-medium text-gray-900">
                    {order.payment_method === 'cash' ? 'Cash' : 'Bank transfer'}
                  </p>
                )}
              </div>
              <AmountEditableField fieldKey="discount" label="Discount (₦)"
                value={order.discount?.toString() ?? '0'} />
              <AmountEditableField fieldKey="overages" label="Overages (₦)"
                value={order.overages?.toString() ?? '0'} />
              <AmountEditableField fieldKey="amount_paid" label="Amount paid (₦)"
                value={order.amount_paid?.toString() ?? '0'} />
            </div>

            {/* Financial summary */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2.5 mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Financial summary</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sale amount</span>
                <span className="font-medium">{fmt(order.sale_amount)}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <span className="text-red-500 font-medium">-{fmt(order.discount)}</span>
                </div>
              )}
              {Number(order.overages) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Overages</span>
                  <span className="text-green-600 font-medium">+{fmt(order.overages)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                <span className="font-semibold text-gray-700">Customer payable</span>
                <span className="font-bold text-gray-900">{fmt(order.customer_payable)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Amount paid</span>
                <span className="text-green-600 font-medium">{fmt(order.amount_paid)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                <span className="font-semibold text-gray-700">Outstanding balance</span>
                <span className={`font-bold text-base ${Number(order.outstanding_balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(order.outstanding_balance)}
                </span>
              </div>
            </div>

            {/* Write-off panel */}
            {order.outstanding_balance > 0 && order.write_off_status !== 'approved' && (
              <div className={`p-4 rounded-xl border ${
                order.write_off_status === 'pending_approval'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-gray-50 border-gray-100'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {order.write_off_status === 'pending_approval'
                        ? 'Write-off pending approval'
                        : 'Outstanding balance'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.write_off_status === 'pending_approval'
                        ? `₦${Number(order.written_off_amount ?? 0).toLocaleString()} requested — ${order.written_off_note}`
                        : `₦${order.outstanding_balance.toLocaleString()} remaining`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.write_off_status === 'pending_approval' && canApproveOrder && (
                      <>
                        <button type="button" onClick={() => void approveWriteOff()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700">
                          <Check size={12} /> Approve write-off
                        </button>
                        <button type="button" onClick={() => void rejectWriteOff()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">
                          <X size={12} /> Reject
                        </button>
                      </>
                    )}
                    {!order.write_off_status || order.write_off_status === 'rejected' ? (
                      canWriteOff && (
                        <button type="button" onClick={() => {
                          setWriteOffAmount(order.outstanding_balance.toString())
                          setWriteOffOpen(true)
                        }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100">
                          <AlertTriangle size={12} /> Write off as bad debt
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {order.write_off_status === 'approved' && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">₦{Number(order.written_off_amount ?? 0).toLocaleString()}</span> written off as bad debt
                  {order.written_off_note && <span> — {order.written_off_note}</span>}
                </p>
              </div>
            )}
          </div>
        )}

        {canViewActivity && activeTab === 'activity' && (
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
                        <div className="flex items-center gap-2 mt-0.5">
                          {log.old_value && <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded line-through">{log.old_value}</span>}
                          {log.old_value && log.new_value && <span className="text-xs text-gray-400">→</span>}
                          {log.new_value && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{log.new_value}</span>}
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

      {/* Workflow modal */}
      <Modal
        open={workflowOpen}
        onClose={() => { setWorkflowOpen(false); setWorkflowType(null); setWorkflowNote(''); setAssignee('') }}
        title={workflowType === 'delete' ? 'Request deletion' : 'Request approval'}
        size="md"
      >
        <div className="space-y-4">
          {workflowType === 'delete' && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700 font-medium">The order will only be deleted after the assigned user approves it.</p>
            </div>
          )}
          {workflowType === 'approval' && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <p className="text-xs text-green-700 font-medium">Once approved, this order will be marked as approved and the needs approval flag will be cleared.</p>
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
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setWorkflowOpen(false); setWorkflowType(null) }}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={submitWorkflow} disabled={submittingWorkflow || !assignee}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2
                ${workflowType === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}>
              {submittingWorkflow ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit request'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={writeOffOpen} onClose={() => { setWriteOffOpen(false); setWriteOffError('') }} title="Write off as bad debt" size="sm">
        {order && (
          <form onSubmit={submitWriteOff} className="space-y-4">
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-xs font-semibold text-red-800">This action pushes the outstanding balance to bad debt.</p>
              <p className="text-xs text-red-600 mt-1">
                It requires admin approval. Once approved, the outstanding balance will be reduced by the written-off amount
                and the recovery can be closed.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Amount to write off (NGN) <span className="text-red-400">*</span>
              </label>
              <input type="number" step="0.01" min="0.01"
                max={order.outstanding_balance}
                required value={writeOffAmount}
                onChange={e => setWriteOffAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <p className="text-xs text-gray-400 mt-1">
                Outstanding: ₦{order.outstanding_balance.toLocaleString()}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Reason <span className="text-red-400">*</span>
              </label>
              <textarea required rows={3} value={writeOffNote}
                onChange={e => setWriteOffNote(e.target.value)}
                placeholder="Explain why this amount is being written off (e.g. customer insolvent, uncontactable, disputed amount agreed to be waived)..."
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            {writeOffError && (
              <p className="text-xs text-red-600 font-medium">{writeOffError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setWriteOffOpen(false); setWriteOffError('') }}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={writeOffSaving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {writeOffSaving ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit for approval'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
