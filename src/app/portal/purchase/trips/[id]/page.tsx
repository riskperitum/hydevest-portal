'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, CheckCircle2, Clock, PlayCircle,
  Plus, Trash2, ChevronDown, Pencil, Check, X,
  TrendingUp, Package, DollarSign, Activity, Zap, Eye, RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'

interface Trip {
  id: string
  trip_id: string
  title: string
  description: string | null
  source_location: string | null
  supplier_id: string | null
  clearing_agent_id: string | null
  start_date: string | null
  end_date: string | null
  status: string
  approval_status: string
  source_port: string | null
  destination_port: string | null
  created_at: string
  supplier: { name: string } | null
  clearing_agent: { name: string } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

interface TripExpense {
  id: string
  expense_id: string
  category: string
  amount: number
  currency: string
  exchange_rate: number
  amount_ngn: number
  description: string | null
  expense_date: string
  created_by_profile: { full_name: string | null; email: string } | null
}

interface Container {
  id: string
  container_id: string
  trip_id: string
  container_number: string | null
  tracking_number: string | null
  description: string | null
  average_weight: number | null
  max_weight: number | null
  unit_price_usd: number | null
  shipping_amount_usd: number | null
  quoted_price_usd: number | null
  surcharge_ngn: number | null
  estimated_landing_cost: number | null
  pieces_purchased: number | null
  approval_status: string
  status: string
  created_at: string
  created_by_profile: { full_name: string | null; email: string } | null
}

interface Supplier { id: string; name: string }
interface ClearingAgent { id: string; name: string }

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started', icon: <Clock size={13} />, color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { value: 'in_progress', label: 'In progress', icon: <PlayCircle size={13} />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'completed',   label: 'Completed',   icon: <CheckCircle2 size={13} />, color: 'bg-green-50 text-green-700 border-green-200' },
]

const CONTAINER_STATUS = [
  { value: 'ordered',    label: 'Ordered',    color: 'bg-gray-100 text-gray-600' },
  { value: 'in_transit', label: 'In transit', color: 'bg-blue-50 text-blue-700' },
  { value: 'arrived',    label: 'Arrived',    color: 'bg-green-50 text-green-700' },
  { value: 'cleared',    label: 'Cleared',    color: 'bg-brand-50 text-brand-700' },
]

const blankExpense = { category: 'general', amount: '', currency: 'NGN', exchange_rate: '1', description: '', expense_date: new Date().toISOString().split('T')[0] }
const blankContainer = { container_number: '', tracking_number: '' }

export default function TripDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string

  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<TripExpense[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('containers')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [clearingAgents, setClearingAgents] = useState<ClearingAgent[]>([])
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [containerOpen, setContainerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expenseForm, setExpenseForm] = useState(blankExpense)
  const [containerForm, setContainerForm] = useState(blankContainer)
  const [editField, setEditField] = useState<string | null>(null)
  const [fieldValue, setFieldValue] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)
  const [activityLogs, setActivityLogs] = useState<{ id: string; action: string; field_name: string | null; old_value: string | null; new_value: string | null; created_at: string; performer: { full_name: string | null; email: string } | null }[]>([])
  const [activeBottomTab, setActiveBottomTab] = useState('containers')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const recalculateLandingCosts = useCallback(async (
    currentContainers: Container[],
    currentExpenses: TripExpense[]
  ) => {
    if (currentContainers.length === 0) return

    const supabase = createClient()

    // WAER = Total NGN container payments ÷ Total USD container purchase subtotal
    const containerExpensesNGN = currentExpenses
      .filter(e => e.category === 'container')
      .reduce((s, e) => s + Number(e.amount_ngn), 0)

    const containersTotalUSD = currentContainers.reduce((s, c) => {
      const purchaseAmt = (c.unit_price_usd && c.pieces_purchased)
        ? Number(c.unit_price_usd) * Number(c.pieces_purchased)
        : 0
      return s + purchaseAmt + Number(c.shipping_amount_usd ?? 0)
    }, 0)

    const waer = containersTotalUSD > 0 ? containerExpensesNGN / containersTotalUSD : 0

    // General expenses split equally across containers
    const generalExpensesNGN = currentExpenses
      .filter(e => e.category === 'general')
      .reduce((s, e) => s + Number(e.amount_ngn), 0)
    const generalPerContainer = currentContainers.length > 0
      ? generalExpensesNGN / currentContainers.length
      : 0

    // Calculate and save landing cost for each container
    for (const con of currentContainers) {
      const purchaseAmt = (con.unit_price_usd && con.pieces_purchased)
        ? Number(con.unit_price_usd) * Number(con.pieces_purchased)
        : 0
      const containerUSD = purchaseAmt + Number(con.shipping_amount_usd ?? 0)
      const containerNGN = waer > 0 ? containerUSD * waer : 0
      const landingCost = containerNGN + generalPerContainer

      if (landingCost > 0) {
        await supabase
          .from('containers')
          .update({ estimated_landing_cost: Math.round(landingCost * 100) / 100 })
          .eq('id', con.id)
      }
    }
  }, [tripId])

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: t }, { data: exp }, { data: con }] = await Promise.all([
      supabase.from('trips').select(`*, supplier:suppliers(name), clearing_agent:clearing_agents(name), created_by_profile:profiles!trips_created_by_fkey(full_name, email)`).eq('id', tripId).single(),
      supabase.from('trip_expenses').select(`*, created_by_profile:profiles!trip_expenses_created_by_fkey(full_name, email)`).eq('trip_id', tripId).order('created_at', { ascending: false }),
      supabase.from('containers').select('*, created_by_profile:profiles!containers_created_by_fkey(full_name, email)').eq('trip_id', tripId).order('created_at', { ascending: false }),
    ])
    setTrip(t)
    setExpenses(exp ?? [])
    setContainers(con ?? [])
    setLoading(false)

    if ((con ?? []).length > 0 && (exp ?? []).length > 0) {
      await recalculateLandingCosts(con ?? [], exp ?? [])
      const { data: conFresh } = await supabase
        .from('containers')
        .select('*, created_by_profile:profiles!containers_created_by_fkey(full_name, email)')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false })
      setContainers(conFresh ?? [])
    }
  }, [tripId, recalculateLandingCosts])

  const loadActivity = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('trip_activity_log')
      .select('*, performer:profiles!trip_activity_log_performed_by_fkey(full_name, email)')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    setActivityLogs(data ?? [])
  }, [tripId])

  const loadDropdowns = useCallback(async () => {
    const supabase = createClient()
    const [{ data: sup }, { data: clr }] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('is_active', true),
      supabase.from('clearing_agents').select('id, name').eq('is_active', true),
    ])
    setSuppliers(sup ?? [])
    setClearingAgents(clr ?? [])
  }, [])

  async function logTripActivity(action: string, fieldName?: string, oldValue?: string, newValue?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('trip_activity_log').insert({
      trip_id: tripId,
      action,
      field_name: fieldName ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      performed_by: user?.id,
    })
    loadActivity()
  }

  useEffect(() => {
    load()
    loadDropdowns()
    loadActivity()
  }, [load, loadDropdowns, loadActivity])

  async function updateField(field: string, value: string) {
    const supabase = createClient()
    const oldValue = String((trip as unknown as Record<string, unknown>)[field] ?? '')
    await supabase.from('trips').update({ [field]: value || null }).eq('id', tripId)
    await logTripActivity('Updated field', field, oldValue, value)
    setEditField(null)
    load()
  }

  async function updateStatus(status: string) {
    const supabase = createClient()
    await supabase.from('trips').update({ status }).eq('id', tripId)
    await logTripActivity('Status changed', 'status', trip?.status, status)
    setStatusOpen(false)
    load()
  }

  async function toggleApproval() {
    if (!trip) return
    const newStatus = trip.approval_status === 'approved' ? 'not_approved' : 'approved'
    const supabase = createClient()
    await supabase.from('trips').update({ approval_status: newStatus }).eq('id', tripId)
    await logTripActivity('Approval status changed', 'approval_status', trip.approval_status, newStatus)
    load()
  }

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await logTripActivity('Trip deleted', 'trip', trip?.title, '')
    await supabase.from('trips').delete().eq('id', tripId)
    router.push('/portal/purchase/trips')
  }

  async function handleExpense(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const amount = parseFloat(expenseForm.amount)
    const rate = parseFloat(expenseForm.exchange_rate)
    await supabase.from('trip_expenses').insert({
      trip_id: tripId,
      category: expenseForm.category,
      amount,
      currency: expenseForm.currency,
      exchange_rate: rate,
      amount_ngn: amount * rate,
      description: expenseForm.description || null,
      expense_date: expenseForm.expense_date,
      created_by: user?.id,
    })
    setExpenseOpen(false)
    setExpenseForm(blankExpense)
    setSaving(false)
    await logTripActivity('Expense recorded', 'expenses', '', `${expenseForm.category} — ${expenseForm.amount} ${expenseForm.currency}`)
    await load()
  }

  async function handleContainer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('containers').insert({
      trip_id: tripId,
      container_number: containerForm.container_number || null,
      tracking_number: containerForm.tracking_number || null,
      created_by: user?.id,
    })
    setContainerOpen(false)
    setContainerForm(blankContainer)
    setSaving(false)
    await logTripActivity('Container added', 'containers', '', containerForm.container_number || 'New container')
    load()
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return
    const supabase = createClient()
    await supabase.from('trip_expenses').delete().eq('id', id)
    await load()
  }

  async function deleteContainer(id: string) {
    if (!confirm('Delete this container?')) return
    const supabase = createClient()
    await supabase.from('containers').delete().eq('id', id)
    load()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const statusInfo = (s: string) => STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0]
  const containerStatusInfo = (s: string) => CONTAINER_STATUS.find(o => o.value === s) ?? CONTAINER_STATUS[0]

  // Step 1: Total NGN paid for container expenses (category = 'container')
  const containerExpensesNGN = expenses
    .filter(e => e.category === 'container')
    .reduce((s, e) => s + Number(e.amount_ngn), 0)

  // Step 2: Total USD purchase subtotal across all containers (unit price × pieces + shipping)
  const containersTotalUSD = containers.reduce((s, c) => {
    const purchaseAmt = (c.unit_price_usd && c.pieces_purchased)
      ? Number(c.unit_price_usd) * Number(c.pieces_purchased)
      : 0
    return s + purchaseAmt + Number(c.shipping_amount_usd ?? 0)
  }, 0)

  // Step 3: WAER = Total NGN container payments ÷ Total USD
  const waer = containersTotalUSD > 0 ? containerExpensesNGN / containersTotalUSD : 0

  // General expenses (NGN + USD converted) split equally across containers
  const generalExpensesNGN = expenses
    .filter(e => e.category === 'general')
    .reduce((s, e) => s + Number(e.amount_ngn), 0)
  const generalPerContainer = containers.length > 0 ? generalExpensesNGN / containers.length : 0

  // Total landing = all container expenses NGN + all general expenses NGN
  const containerPaymentNGN = containerExpensesNGN
  const otherExpenses = generalExpensesNGN
  const totalLanding = containerPaymentNGN + otherExpenses

  // Total USD = sum of all container purchase subtotals
  const containerPaymentUSD = containersTotalUSD

  const metrics = [
    { label: 'Total landing amount (₦)', value: fmt(totalLanding), icon: <TrendingUp size={16} />, color: 'text-brand-600 bg-brand-50' },
    { label: 'Total container payment ($)', value: `$${containerPaymentUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: <DollarSign size={16} />, color: 'text-green-600 bg-green-50' },
    { label: 'Total container payment (₦)', value: fmt(containerPaymentNGN), icon: <Package size={16} />, color: 'text-blue-600 bg-blue-50' },
    { label: 'General expenses (₦)', value: fmt(generalExpensesNGN), icon: <Activity size={16} />, color: 'text-amber-600 bg-amber-50' },
    { label: 'WAER', value: waer > 0 ? waer.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—', icon: <Zap size={16} />, color: 'text-purple-600 bg-purple-50' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!trip) return (
    <div className="text-center py-16 text-gray-400">Trip not found.</div>
  )

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/purchase/trips"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{trip.trip_id}</span>
              <span className="text-xs text-gray-400">
                Created by <span className="text-gray-600">{trip.created_by_profile?.full_name ?? trip.created_by_profile?.email ?? '—'}</span>
              </span>
              <span className="text-xs text-gray-400">on {new Date(trip.created_at).toLocaleDateString()}</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mt-0.5">{trip.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status */}
          <div className="relative">
            <button onClick={() => setStatusOpen(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${statusInfo(trip.status).color}`}>
              {statusInfo(trip.status).icon}
              {statusInfo(trip.status).label}
              <ChevronDown size={13} />
            </button>
            {statusOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-gray-100 shadow-lg z-20 py-1">
                  {STATUS_OPTIONS.map(s => (
                    <button key={s.value} onClick={() => updateStatus(s.value)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors
                        ${trip.status === s.value ? 'font-medium text-brand-600' : 'text-gray-700'}`}>
                      {s.icon} {s.label}
                      {trip.status === s.value && <Check size={12} className="ml-auto" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Approval */}
          <button onClick={toggleApproval}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
              ${trip.approval_status === 'approved'
                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}>
            {trip.approval_status === 'approved' ? <span className="flex items-center gap-1"><CheckCircle2 size={13} /> Approved</span> : 'Not approved'}
          </button>

          {/* Delete */}
          <button onClick={() => setDeleteOpen(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center gap-1.5">
            <Trash2 size={13} /> Delete trip
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            WAER: <span className="font-semibold text-gray-700">
              {waer > 0 ? waer.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—'}
            </span>
            {containers.length > 0 && waer > 0 && (
              <span className="ml-2 text-gray-300">· General share per container: {fmt(generalPerContainer)}</span>
            )}
          </p>
          <button
            onClick={() => recalculateLandingCosts(containers, expenses)}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-brand-600 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors">
            <RefreshCw size={11} /> Recalculate landing costs
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className={`inline-flex p-1.5 rounded-lg ${m.color} mb-2`}>
              {m.icon}
            </div>
            <p className="text-xs text-gray-500 mb-1 truncate">{m.label}</p>
            <p className="text-base font-semibold text-gray-900 truncate">{m.value}</p>
          </div>
        ))}
        </div>
      </div>

      {/* Trip details */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Trip information</h2>
          <span className="text-xs text-gray-400">Click any field to edit</span>
        </div>

        {/* Compact grid — 3 columns for short fields */}
        <div className="divide-y divide-gray-50">

          {/* Row 1: Title + Source Location + Status readonly */}
          <div className="grid grid-cols-3 divide-x divide-gray-50">
            {[
              { key: 'title', label: 'Title', value: trip.title },
              { key: 'source_location', label: 'Source location', value: trip.source_location ?? '' },
            ].map(field => (
              <div key={field.key} className="px-4 py-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{field.label}</p>
                {editField === field.key ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={fieldValue}
                      onChange={e => setFieldValue(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-brand-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0"
                      autoFocus
                    />
                    <button onClick={() => updateField(field.key, fieldValue)}
                      className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors shrink-0">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditField(null)}
                      className="p-1.5 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition-colors shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditField(field.key); setFieldValue(field.value) }}
                    className="group w-full text-left flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${field.value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
                      {field.value || 'Not set'}
                    </span>
                    <Pencil size={11} className="text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
                  </button>
                )}
              </div>
            ))}

            {/* Supplier — read only */}
            <div className="px-4 py-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Supplier</p>
              <p className="text-sm font-medium text-gray-900 truncate">{trip.supplier?.name ?? <span className="text-gray-400 italic font-normal">Not set</span>}</p>
            </div>
          </div>

          {/* Row 2: Start Date + End Date + Clearing Agent */}
          <div className="grid grid-cols-3 divide-x divide-gray-50">
            {[
              { key: 'start_date', label: 'Start date', value: trip.start_date ?? '', type: 'date' },
              { key: 'end_date', label: 'End date', value: trip.end_date ?? '', type: 'date' },
            ].map(field => (
              <div key={field.key} className="px-4 py-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{field.label}</p>
                {editField === field.key ? (
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={fieldValue}
                      onChange={e => setFieldValue(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-brand-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0"
                      autoFocus
                    />
                    <button onClick={() => updateField(field.key, fieldValue)}
                      className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors shrink-0">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditField(null)}
                      className="p-1.5 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition-colors shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditField(field.key); setFieldValue(field.value) }}
                    className="group w-full text-left flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${field.value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
                      {field.value ? new Date(field.value).toLocaleDateString() : 'Not set'}
                    </span>
                    <Pencil size={11} className="text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
                  </button>
                )}
              </div>
            ))}

            {/* Clearing agent — read only */}
            <div className="px-4 py-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Clearing agent</p>
              <p className="text-sm font-medium text-gray-900 truncate">{trip.clearing_agent?.name ?? <span className="text-gray-400 italic font-normal">Not set</span>}</p>
            </div>
          </div>

          {/* Row 3: Source Port + Destination Port */}
          <div className="grid grid-cols-3 divide-x divide-gray-50">
            {[
              { key: 'source_port', label: 'Source port', value: trip.source_port ?? '' },
              { key: 'destination_port', label: 'Destination port', value: trip.destination_port ?? '' },
            ].map(field => (
              <div key={field.key} className="px-4 py-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{field.label}</p>
                {editField === field.key ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={fieldValue}
                      onChange={e => setFieldValue(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-brand-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0"
                      placeholder={field.key === 'source_port' ? 'e.g. Barranquilla' : 'e.g. Apapa, Lagos'}
                      autoFocus
                    />
                    <button onClick={() => updateField(field.key, fieldValue)}
                      className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors shrink-0">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditField(null)}
                      className="p-1.5 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition-colors shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditField(field.key); setFieldValue(field.value) }}
                    className="group w-full text-left flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${field.value ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
                      {field.value || 'Not set'}
                    </span>
                    <Pencil size={11} className="text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
                  </button>
                )}
              </div>
            ))}
            <div className="px-4 py-3" />
          </div>

          {/* Row 4: Description — full width */}
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Description</p>
            {editField === 'description' ? (
              <div className="flex gap-1.5">
                <textarea
                  rows={2}
                  value={fieldValue}
                  onChange={e => setFieldValue(e.target.value)}
                  className="flex-1 px-2 py-1 text-sm border border-brand-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  autoFocus
                />
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => updateField('description', fieldValue)}
                    className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors">
                    <Check size={12} />
                  </button>
                  <button onClick={() => setEditField(null)}
                    className="p-1.5 border border-gray-200 text-gray-500 rounded-md hover:bg-gray-50 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setEditField('description'); setFieldValue(trip.description ?? '') }}
                className="group w-full text-left flex items-center justify-between gap-2">
                <span className={`text-sm ${trip.description ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                  {trip.description || 'No description — click to add'}
                </span>
                <Pencil size={11} className="text-gray-300 group-hover:text-brand-400 shrink-0 transition-colors" />
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center border-b border-gray-100">
          <div className="flex flex-1">
            {[
              { key: 'expenses', label: 'Trip Expense', count: expenses.length },
              { key: 'containers', label: 'Containers', count: containers.length },
              { key: 'documents', label: 'Trip Document', count: 0 },
              { key: 'activity', label: 'Activity log', count: activityLogs.length },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px flex items-center gap-2
                  ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                    ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="px-4 pb-1">
            {activeTab === 'expenses' && (
              <button onClick={() => setExpenseOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
                <Plus size={14} /> Record expense
              </button>
            )}
            {activeTab === 'containers' && (
              <button onClick={() => setContainerOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
                <Plus size={14} /> Add container
              </button>
            )}
          </div>
        </div>

        <div className="p-5">
          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                  General: <span className="font-medium text-gray-900">{fmt(expenses.filter(e => e.category === 'general').reduce((s, e) => s + Number(e.amount_ngn), 0))}</span>
                </span>
                <span className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                  Container: <span className="font-medium text-gray-900">{fmt(expenses.filter(e => e.category === 'container').reduce((s, e) => s + Number(e.amount_ngn), 0))}</span>
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['ID', 'Category', 'Amount', 'Currency', 'Rate', 'Amount (₦)', 'Description', 'Date', 'Created by', ''].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">No expenses recorded yet.</td></tr>
                    ) : expenses.map(exp => (
                      <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-3"><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{exp.expense_id}</span></td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${exp.category === 'container' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600'}`}>
                            {exp.category === 'container' ? 'Container' : 'General'}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{Number(exp.amount).toLocaleString()}</td>
                        <td className="px-3 py-3 text-gray-500">{exp.currency}</td>
                        <td className="px-3 py-3 text-gray-500">{exp.exchange_rate}</td>
                        <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(exp.amount_ngn)}</td>
                        <td className="px-3 py-3 text-gray-500 max-w-[180px] truncate">{exp.description ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{new Date(exp.expense_date).toLocaleDateString()}</td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{exp.created_by_profile?.full_name ?? exp.created_by_profile?.email ?? '—'}</td>
                        <td className="px-3 py-3">
                          <button onClick={() => deleteExpense(exp.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'containers' && (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[
                      'Container ID', 'Status', 'Title', 'Tracking No.',
                      'Pieces', 'Avg Weight', 'Unit Price ($)', 'Landing Cost (₦)',
                      'Max Weight', 'Shipping ($)', 'Surcharge (₦)',
                      'Purchase Amt ($)', 'Purchase Subtotal ($)',
                      'Quoted Price ($)', 'Quoted Amt ($)', 'Quoted Subtotal ($)',
                      'Created', 'Created by', 'Actions'
                    ].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {containers.length === 0 ? (
                    <tr>
                      <td colSpan={19} className="px-4 py-12 text-center text-sm text-gray-400">
                        No containers added yet.
                      </td>
                    </tr>
                  ) : containers.map(con => {
                    const purchaseAmt = (con.unit_price_usd && con.pieces_purchased)
                      ? Number(con.unit_price_usd) * Number(con.pieces_purchased)
                      : null
                    const quotedAmt = (con.quoted_price_usd && Number(con.quoted_price_usd) > 0 && con.pieces_purchased)
                      ? Number(con.quoted_price_usd) * Number(con.pieces_purchased)
                      : null
                    return (
                      <tr key={con.id}
                        className="border-b border-gray-50 hover:bg-brand-50/40 transition-colors group cursor-pointer"
                        onClick={() => router.push(`/portal/purchase/trips/${tripId}/containers/${con.id}`)}>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded">{con.container_id}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${containerStatusInfo(con.status).color}`}>
                            {containerStatusInfo(con.status).label}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{con.container_number ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{con.tracking_number ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-600 text-center">{con.pieces_purchased ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{con.average_weight ? `${con.average_weight} kg` : '—'}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{con.unit_price_usd ? `$${Number(con.unit_price_usd).toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{con.estimated_landing_cost ? fmt(con.estimated_landing_cost) : '—'}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{con.max_weight ? `${con.max_weight} kg` : '—'}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{con.shipping_amount_usd ? `$${Number(con.shipping_amount_usd).toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{con.surcharge_ngn ? fmt(con.surcharge_ngn) : '—'}</td>
                        <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{purchaseAmt ? `$${purchaseAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                        <td className="px-3 py-3 font-semibold text-brand-700 whitespace-nowrap">
                          {purchaseAmt != null
                            ? `$${(purchaseAmt + Number(con.shipping_amount_usd ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{con.quoted_price_usd ? `$${Number(con.quoted_price_usd).toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {quotedAmt != null && quotedAmt > 0
                            ? `$${quotedAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 font-semibold text-brand-700 whitespace-nowrap">
                          {quotedAmt != null && quotedAmt > 0
                            ? `$${(quotedAmt + Number(con.shipping_amount_usd ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{new Date(con.created_at).toLocaleDateString()}</td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{con.created_by_profile?.full_name ?? con.created_by_profile?.email ?? '—'}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => router.push(`/portal/purchase/trips/${tripId}/containers/${con.id}`)}
                              title="View container"
                              className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={async () => {
                                const supabase = createClient()
                                const newStatus = con.approval_status === 'approved' ? 'not_approved' : 'approved'
                                await supabase.from('containers').update({ approval_status: newStatus }).eq('id', con.id)
                                await logTripActivity('Container approval changed', 'containers', con.container_number ?? con.container_id, newStatus)
                                load()
                              }}
                              title={con.approval_status === 'approved' ? 'Unapprove' : 'Approve'}
                              className={`p-1.5 rounded-lg transition-colors ${con.approval_status === 'approved' ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'}`}>
                              <CheckCircle2 size={14} />
                            </button>
                            <button
                              onClick={() => deleteContainer(con.id)}
                              title="Delete container"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={6} className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Totals</td>
                    <td className="px-3 py-3 text-xs text-gray-400">—</td>
                    <td className="px-3 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">
                      {(() => {
                        const total = containers.reduce((s, c) => s + Number(c.estimated_landing_cost ?? 0), 0)
                        return total > 0 ? fmt(total) : '—'
                      })()}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400">—</td>
                    <td className="px-3 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">
                      ${containers.reduce((s, c) => s + Number(c.shipping_amount_usd ?? 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">
                      {fmt(containers.reduce((s, c) => s + Number(c.surcharge_ngn ?? 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">
                      ${containers.reduce((s, c) => {
                        const pa = (c.unit_price_usd && c.pieces_purchased) ? Number(c.unit_price_usd) * Number(c.pieces_purchased) : 0
                        return s + pa
                      }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-brand-700 whitespace-nowrap">
                      ${containers.reduce((s, c) => {
                        const pa = (c.unit_price_usd && c.pieces_purchased) ? Number(c.unit_price_usd) * Number(c.pieces_purchased) : 0
                        return s + pa + Number(c.shipping_amount_usd ?? 0)
                      }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">
                      {(() => {
                        const total = containers.reduce((s, c) => s + (Number(c.quoted_price_usd ?? 0) > 0 ? Number(c.quoted_price_usd) : 0), 0)
                        return total > 0 ? `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
                      })()}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-gray-700 whitespace-nowrap">
                      {(() => {
                        const total = containers.reduce((s, c) => {
                          const qa = (c.quoted_price_usd && Number(c.quoted_price_usd) > 0 && c.pieces_purchased)
                            ? Number(c.quoted_price_usd) * Number(c.pieces_purchased) : 0
                          return s + qa
                        }, 0)
                        return total > 0 ? `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
                      })()}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-brand-700 whitespace-nowrap">
                      {(() => {
                        const hasQuoted = containers.some(c => c.quoted_price_usd && Number(c.quoted_price_usd) > 0)
                        if (!hasQuoted) return '—'
                        const total = containers.reduce((s, c) => {
                          const qa = (c.quoted_price_usd && Number(c.quoted_price_usd) > 0 && c.pieces_purchased)
                            ? Number(c.quoted_price_usd) * Number(c.pieces_purchased) : 0
                          return s + qa + (qa > 0 ? Number(c.shipping_amount_usd ?? 0) : 0)
                        }, 0)
                        return `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      })()}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <Package size={20} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No documents yet</p>
              <p className="text-xs text-gray-400">Document upload will be available soon</p>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-1">
              {activityLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <p className="text-sm text-gray-400">No activity recorded yet.</p>
                  <p className="text-xs text-gray-300">Actions like edits, status changes and approvals will appear here.</p>
                </div>
              ) : (
                activityLogs.map(log => (
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
                        {log.field_name && (
                          <span className="text-xs text-gray-400 ml-1">· {log.field_name}</span>
                        )}
                      </p>
                      {(log.old_value || log.new_value) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {log.old_value && (
                            <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded line-through">{log.old_value}</span>
                          )}
                          {log.old_value && log.new_value && (
                            <span className="text-xs text-gray-400">→</span>
                          )}
                          {log.new_value && (
                            <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{log.new_value}</span>
                          )}
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

      {/* Expense modal */}
      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Record expense" description="Add an expense to this trip" size="md">
        <form onSubmit={handleExpense} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="general">General payment</option>
              <option value="container">Container payment</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount <span className="text-red-400">*</span></label>
              <input required type="number" step="0.01" value={expenseForm.amount}
                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={expenseForm.currency} onChange={e => setExpenseForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Exchange rate</label>
              <input type="number" step="0.0001" value={expenseForm.exchange_rate}
                onChange={e => setExpenseForm(f => ({ ...f, exchange_rate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="1.0" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="What is this expense for?" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expense date</label>
            <input type="date" value={expenseForm.expense_date}
              onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setExpenseOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Record expense'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Container modal */}
      <Modal open={containerOpen} onClose={() => setContainerOpen(false)} title="Create container" description="Enter the details of the new container" size="md">
        <form onSubmit={handleContainer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title / Label</label>
              <input
                value={containerForm.container_number}
                onChange={e => setContainerForm(f => ({ ...f, container_number: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter title" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Container tracking number</label>
              <input
                value={containerForm.tracking_number}
                onChange={e => setContainerForm(f => ({ ...f, tracking_number: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter tracking number" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setContainerOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete trip" description="This action cannot be undone" size="sm">
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-100">
            <p className="text-sm text-red-700">
              You are about to permanently delete <span className="font-semibold">{trip.title}</span> ({trip.trip_id}) along with all its expenses, containers and documents.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {deleting ? <><Loader2 size={14} className="animate-spin" /> Deleting…</> : 'Delete trip'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
