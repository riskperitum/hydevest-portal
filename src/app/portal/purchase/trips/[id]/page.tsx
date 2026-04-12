'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, CheckCircle2, Clock, PlayCircle, Plus, Trash2 } from 'lucide-react'
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
  container_number: string | null
  description: string | null
  weight_kg: number | null
  quantity: number | null
  unit_price: number | null
  currency: string
  exchange_rate: number
  total_cost_ngn: number | null
  status: string
  created_at: string
}

interface Supplier { id: string; name: string }
interface ClearingAgent { id: string; name: string }

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started', icon: <Clock size={14} />, color: 'bg-gray-100 text-gray-600' },
  { value: 'in_progress', label: 'In progress', icon: <PlayCircle size={14} />, color: 'bg-blue-50 text-blue-700' },
  { value: 'completed',   label: 'Completed',   icon: <CheckCircle2 size={14} />, color: 'bg-green-50 text-green-700' },
]

const CONTAINER_STATUS = [
  { value: 'ordered',   label: 'Ordered',   color: 'bg-gray-100 text-gray-600' },
  { value: 'in_transit', label: 'In transit', color: 'bg-blue-50 text-blue-700' },
  { value: 'arrived',   label: 'Arrived',   color: 'bg-green-50 text-green-700' },
  { value: 'cleared',   label: 'Cleared',   color: 'bg-brand-50 text-brand-700' },
]

const blankExpense = { category: 'general', amount: '', currency: 'NGN', exchange_rate: '1', description: '', expense_date: new Date().toISOString().split('T')[0] }
const blankContainer = { container_number: '', description: '', weight_kg: '', quantity: '', unit_price: '', currency: 'USD', exchange_rate: '', status: 'ordered' }

export default function TripDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string

  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<TripExpense[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('expenses')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [clearingAgents, setClearingAgents] = useState<ClearingAgent[]>([])

  const [expenseOpen, setExpenseOpen] = useState(false)
  const [containerOpen, setContainerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expenseForm, setExpenseForm] = useState(blankExpense)
  const [containerForm, setContainerForm] = useState(blankContainer)

  const [editField, setEditField] = useState<string | null>(null)
  const [fieldValue, setFieldValue] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: t }, { data: exp }, { data: con }] = await Promise.all([
      supabase.from('trips').select(`*, supplier:suppliers(name), clearing_agent:clearing_agents(name), created_by_profile:profiles!trips_created_by_fkey(full_name, email)`).eq('id', tripId).single(),
      supabase.from('trip_expenses').select(`*, created_by_profile:profiles!trip_expenses_created_by_fkey(full_name, email)`).eq('trip_id', tripId).order('created_at', { ascending: false }),
      supabase.from('containers').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
    ])
    setTrip(t)
    setExpenses(exp ?? [])
    setContainers(con ?? [])
    setLoading(false)
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

  useEffect(() => { load(); loadDropdowns() }, [load, loadDropdowns])

  async function updateField(field: string, value: string) {
    const supabase = createClient()
    await supabase.from('trips').update({ [field]: value || null }).eq('id', tripId)
    setEditField(null)
    load()
  }

  async function updateStatus(status: string) {
    setUpdatingStatus(true)
    const supabase = createClient()
    await supabase.from('trips').update({ status }).eq('id', tripId)
    setUpdatingStatus(false)
    load()
  }

  async function toggleApproval() {
    if (!trip) return
    const newStatus = trip.approval_status === 'approved' ? 'not_approved' : 'approved'
    const supabase = createClient()
    await supabase.from('trips').update({ approval_status: newStatus }).eq('id', tripId)
    load()
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
    load()
  }

  async function handleContainer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const qty = parseInt(containerForm.quantity)
    const price = parseFloat(containerForm.unit_price)
    const rate = parseFloat(containerForm.exchange_rate)
    await supabase.from('containers').insert({
      trip_id: tripId,
      container_number: containerForm.container_number || null,
      description: containerForm.description || null,
      weight_kg: containerForm.weight_kg ? parseFloat(containerForm.weight_kg) : null,
      quantity: containerForm.quantity ? qty : null,
      unit_price: containerForm.unit_price ? price : null,
      currency: containerForm.currency,
      exchange_rate: rate || 1,
      total_cost_ngn: (qty && price && rate) ? qty * price * rate : null,
      status: containerForm.status,
      created_by: user?.id,
    })
    setContainerOpen(false)
    setContainerForm(blankContainer)
    setSaving(false)
    load()
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return
    const supabase = createClient()
    await supabase.from('trip_expenses').delete().eq('id', id)
    load()
  }

  async function deleteContainer(id: string) {
    if (!confirm('Delete this container?')) return
    const supabase = createClient()
    await supabase.from('containers').delete().eq('id', id)
    load()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString()}`
  const statusInfo = (s: string) => STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0]
  const containerStatusInfo = (s: string) => CONTAINER_STATUS.find(o => o.value === s) ?? CONTAINER_STATUS[0]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!trip) return (
    <div className="text-center py-16 text-gray-400">Trip not found.</div>
  )

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/portal/purchase/trips" className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{trip.trip_id}</span>
              <span className="text-xs text-gray-400">Created by {trip.created_by_profile?.full_name ?? trip.created_by_profile?.email ?? '—'}</span>
              <span className="text-xs text-gray-400">on {new Date(trip.created_at).toLocaleDateString()}</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mt-1">{trip.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Status dropdown */}
          <div className="relative group">
            <button className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${statusInfo(trip.status).color}`}>
              {statusInfo(trip.status).icon}
              {statusInfo(trip.status).label}
            </button>
            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-gray-100 shadow-lg z-10 py-1 hidden group-hover:block">
              {STATUS_OPTIONS.map(s => (
                <button key={s.value} onClick={() => updateStatus(s.value)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>
          {/* Approval button */}
          <button onClick={toggleApproval}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${trip.approval_status === 'approved' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
            {trip.approval_status === 'approved' ? '✓ Approved' : 'Not approved'}
          </button>
        </div>
      </div>

      {/* Trip details — editable fields */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="grid grid-cols-2 gap-6">
          {[
            { key: 'title', label: 'Title', value: trip.title },
            { key: 'description', label: 'Description', value: trip.description ?? '' },
            { key: 'source_location', label: 'Source location', value: trip.source_location ?? '' },
            { key: 'start_date', label: 'Start date', value: trip.start_date ?? '', type: 'date' },
            { key: 'end_date', label: 'End date', value: trip.end_date ?? '', type: 'date' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{field.label}</label>
              {editField === field.key ? (
                <div className="flex gap-2">
                  <input
                    type={field.type ?? 'text'}
                    value={fieldValue}
                    onChange={e => setFieldValue(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    autoFocus
                  />
                  <button onClick={() => updateField(field.key, fieldValue)}
                    className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">Save</button>
                  <button onClick={() => setEditField(null)}
                    className="px-3 py-1.5 border border-gray-200 text-sm rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditField(field.key); setFieldValue(field.value) }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-900 bg-gray-50 rounded-lg hover:bg-brand-50 hover:text-brand-700 transition-colors border border-transparent hover:border-brand-200"
                >
                  {field.value || <span className="text-gray-400">Click to edit</span>}
                </button>
              )}
            </div>
          ))}

          {/* Supplier display */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Supplier</label>
            <div className="px-3 py-2 text-sm text-gray-900 bg-gray-50 rounded-lg">{trip.supplier?.name ?? '—'}</div>
          </div>

          {/* Clearing agent display */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Clearing agent</label>
            <div className="px-3 py-2 text-sm text-gray-900 bg-gray-50 rounded-lg">{trip.clearing_agent?.name ?? '—'}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'expenses', label: 'Trip Expense' },
            { key: 'containers', label: 'Containers' },
            { key: 'documents', label: 'Trip Document' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* EXPENSES TAB */}
          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Total: <span className="font-semibold text-gray-900">{fmt(expenses.reduce((s, e) => s + Number(e.amount_ngn), 0))}</span>
                </div>
                <button onClick={() => setExpenseOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
                  <Plus size={14} /> Record expense
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount (₦)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created by</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">No expenses recorded yet.</td></tr>
                  ) : expenses.map(exp => (
                    <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{exp.expense_id}</span></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${exp.category === 'container' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600'}`}>
                          {exp.category === 'container' ? 'Container' : 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{Number(exp.amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500">{exp.currency}</td>
                      <td className="px-4 py-3 text-gray-500">{exp.exchange_rate}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{fmt(exp.amount_ngn)}</td>
                      <td className="px-4 py-3 text-gray-500">{exp.description ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(exp.expense_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-gray-500">{exp.created_by_profile?.full_name ?? exp.created_by_profile?.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteExpense(exp.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CONTAINERS TAB */}
          {activeTab === 'containers' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => setContainerOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
                  <Plus size={14} /> Add container
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Container No.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total (₦)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {containers.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No containers added yet.</td></tr>
                  ) : containers.map(con => (
                    <tr key={con.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded">{con.container_id}</span></td>
                      <td className="px-4 py-3 font-medium text-gray-900">{con.container_number ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{con.description ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{con.quantity ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{con.unit_price ? Number(con.unit_price).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{con.currency}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{con.total_cost_ngn ? fmt(con.total_cost_ngn) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${containerStatusInfo(con.status).color}`}>
                          {containerStatusInfo(con.status).label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteContainer(con.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* DOCUMENTS TAB */}
          {activeTab === 'documents' && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">
              Document upload coming soon.
            </div>
          )}
        </div>
      </div>

      {/* Expense modal */}
      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Record expense" size="md">
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
              <input required type="number" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
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
              <input type="number" step="0.0001" value={expenseForm.exchange_rate} onChange={e => setExpenseForm(f => ({ ...f, exchange_rate: e.target.value }))}
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
            <input type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(f => ({ ...f, expense_date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setExpenseOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Record expense'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Container modal */}
      <Modal open={containerOpen} onClose={() => setContainerOpen(false)} title="Add container" size="md">
        <form onSubmit={handleContainer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Container number</label>
              <input value={containerForm.container_number} onChange={e => setContainerForm(f => ({ ...f, container_number: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. MSCU1234567" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={containerForm.status} onChange={e => setContainerForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {CONTAINER_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input value={containerForm.description} onChange={e => setContainerForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Container contents or notes" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input type="number" value={containerForm.quantity} onChange={e => setContainerForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit price</label>
              <input type="number" step="0.01" value={containerForm.unit_price} onChange={e => setContainerForm(f => ({ ...f, unit_price: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
              <input type="number" step="0.01" value={containerForm.weight_kg} onChange={e => setContainerForm(f => ({ ...f, weight_kg: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={containerForm.currency} onChange={e => setContainerForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="USD">USD</option>
                <option value="NGN">NGN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Exchange rate (to ₦)</label>
              <input type="number" step="0.0001" value={containerForm.exchange_rate} onChange={e => setContainerForm(f => ({ ...f, exchange_rate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. 1580" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setContainerOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Add container'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
