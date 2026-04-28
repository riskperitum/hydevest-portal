'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Search, DollarSign, Calculator } from 'lucide-react'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'
import Modal from '@/components/ui/Modal'

interface Customer {
  id: string
  customer_id: string
  name: string
  phone: string | null
}

const TYPES = ['ISINLE', 'BAYA', 'BLEACHING'] as const

const TYPE_COLORS: Record<string, string> = {
  ISINLE:    'bg-blue-50 text-blue-700 border-blue-200',
  BAYA:      'bg-purple-50 text-purple-700 border-purple-200',
  BLEACHING: 'bg-amber-50 text-amber-700 border-amber-200',
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function CreateOutlierSalePage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [stockByType, setStockByType] = useState<Record<string, number>>({ ISINLE: 0, BAYA: 0, BLEACHING: 0 })
  const [type, setType] = useState<typeof TYPES[number] | ''>('')
  const [quantity, setQuantity] = useState('')
  const [pricingMode, setPricingMode] = useState<'gross' | 'per_piece'>('gross')
  const [pricePerPiece, setPricePerPiece] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [amountPaid, setAmountPaid] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')

  // New customer modal
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', address: '' })
  const [creatingCustomer, setCreatingCustomer] = useState(false)

  const [selfApprove, setSelfApprove] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { permissions, isSuperAdmin } = usePermissions()
  const canSelfApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*') || can(permissions, isSuperAdmin, 'outlier.approve')

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
      const emps = await getAdminProfiles()
      setEmployees(emps)

      const [{ data: customerData }, { data: recordData }, { data: saleData }] = await Promise.all([
        supabase.from('customers').select('id, customer_id, name, phone').order('name'),
        supabase.from('outlier_records').select('type, quantity, status').in('status', ['approved', 'modified_pending']),
        supabase.from('outlier_sales').select('type, quantity_sold, status').in('status', ['approved', 'modified_pending']),
      ])
      setCustomers((customerData ?? []) as Customer[])

      const stock: Record<string, number> = { ISINLE: 0, BAYA: 0, BLEACHING: 0 }
      for (const r of (recordData ?? [])) stock[r.type] = (stock[r.type] ?? 0) + Number(r.quantity)
      for (const s of (saleData ?? [])) stock[s.type] = (stock[s.type] ?? 0) - Number(s.quantity_sold)
      setStockByType(stock)
      setLoadingCustomers(false)
    }
    init()
  }, [])

  const filteredCustomers = customers.filter(c => {
    if (search === '') return true
    const s = search.toLowerCase()
    return c.name.toLowerCase().includes(s) || c.customer_id.toLowerCase().includes(s) || (c.phone ?? '').includes(search)
  })

  const computedTotal = pricingMode === 'per_piece'
    ? Number(pricePerPiece || 0) * Number(quantity || 0)
    : Number(grossAmount || 0)

  const availableStock = type ? (stockByType[type] ?? 0) : 0

  async function createCustomer() {
    if (!newCustomerForm.name.trim()) {
      setError('Customer name is required')
      return
    }
    setCreatingCustomer(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: newCust, error: custErr } = await supabase.from('customers').insert({
      name: newCustomerForm.name.trim(),
      phone: newCustomerForm.phone.trim() || null,
      email: newCustomerForm.email.trim() || null,
      address: newCustomerForm.address.trim() || null,
      created_by: user?.id,
    }).select('id, customer_id, name, phone').single()

    if (custErr || !newCust) {
      setError(custErr?.message ?? 'Failed to create customer')
      setCreatingCustomer(false)
      return
    }

    setCustomers(prev => [newCust as Customer, ...prev])
    setSelectedCustomer(newCust as Customer)
    setNewCustomerOpen(false)
    setNewCustomerForm({ name: '', phone: '', email: '', address: '' })
    setCreatingCustomer(false)
  }

  async function submit() {
    if (!selectedCustomer) {
      setError('Please select a customer')
      return
    }
    if (!type) {
      setError('Please select an outlier type')
      return
    }
    if (!quantity || Number(quantity) <= 0) {
      setError('Quantity must be greater than 0')
      return
    }
    if (Number(quantity) > availableStock) {
      setError(`Quantity exceeds available stock (${availableStock})`)
      return
    }
    if (computedTotal <= 0) {
      setError('Total price must be greater than 0')
      return
    }
    if (!selfApprove && !assignee) {
      setError('Please select an approver or use self-approve')
      return
    }

    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const status = (selfApprove && canSelfApprove) ? 'approved' : 'pending_approval'
    const approvedAt = (selfApprove && canSelfApprove) ? new Date().toISOString() : null
    const approvedBy = (selfApprove && canSelfApprove) ? user?.id : null

    const { data: sale, error: insertError } = await supabase.from('outlier_sales').insert({
      customer_id: selectedCustomer.id,
      type,
      quantity_sold: Number(quantity),
      pricing_mode: pricingMode,
      price_per_piece: pricingMode === 'per_piece' ? Number(pricePerPiece) : null,
      total_price: computedTotal,
      notes: notes.trim() || null,
      status,
      approved_at: approvedAt,
      approved_by: approvedBy,
      created_by: user?.id,
    }).select().single()

    // Record initial payment if any
    const initialPayment = Number(amountPaid || 0)
    if (sale && initialPayment > 0) {
      const paymentStatus = (selfApprove && canSelfApprove) ? 'approved' : 'pending_approval'
      const paymentApprovedAt = (selfApprove && canSelfApprove) ? new Date().toISOString() : null
      const paymentApprovedBy = (selfApprove && canSelfApprove) ? user?.id : null

      await supabase.from('outlier_sale_payments').insert({
        outlier_sale_id: sale.id,
        amount_paid: initialPayment,
        payment_method: paymentMethod || null,
        notes: 'Initial payment at point of sale',
        status: paymentStatus,
        approved_at: paymentApprovedAt,
        approved_by: paymentApprovedBy,
        created_by: user?.id,
      })
    }

    if (insertError || !sale) {
      setError(insertError?.message ?? 'Failed to create sale')
      setSaving(false)
      return
    }

    await supabase.from('outlier_sale_activity_log').insert({
      outlier_sale_id: sale.id,
      action: (selfApprove && canSelfApprove) ? 'Sale created (self-approved)' : 'Sale created',
      performed_by: user?.id,
    })

    if (selfApprove && canSelfApprove) {
      await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `Outlier sale approval: ${sale.sale_id} (self-approved)`,
        description: `${sale.type} × ${sale.quantity_sold} for ${selectedCustomer.name}`,
        module: 'outlier_sales',
        record_id: sale.id,
        record_ref: sale.sale_id,
        requested_by: user?.id,
        assigned_to: user?.id,
        status: 'approved',
        priority: 'normal',
        review_note: 'Self-approved by ' + (user?.email ?? 'admin'),
      })
    } else {
      const { data: task } = await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `Outlier sale approval: ${sale.sale_id}`,
        description: `${sale.type} × ${sale.quantity_sold} for ${selectedCustomer.name}`,
        module: 'outlier_sales',
        record_id: sale.id,
        record_ref: sale.sale_id,
        requested_by: user?.id,
        assigned_to: assignee,
        priority: 'normal',
      }).select().single()

      await supabase.from('notifications').insert({
        user_id: assignee,
        type: 'task_approval_request',
        title: 'New task: Outlier sale approval',
        message: `${sale.sale_id} — ${sale.type} × ${sale.quantity_sold}`,
        task_id: task?.id,
        record_id: sale.id,
        record_ref: sale.sale_id,
        module: 'outlier_sales',
      })
    }

    router.push('/portal/inventory/outlier')
  }

  return (
    <PermissionGate permKey="outlier.create">
      <div className="space-y-5 max-w-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Sell outliers</h1>
            <p className="text-sm text-gray-400 mt-0.5">Record an outlier sale to a customer</p>
          </div>
        </div>

        {/* Stock display */}
        <div className="grid grid-cols-3 gap-3">
          {TYPES.map(t => (
            <div key={t} className={`rounded-xl border p-3 ${TYPE_COLORS[t]}`}>
              <p className="text-xs uppercase tracking-wide font-semibold mb-0.5">{t}</p>
              <p className="text-lg font-bold">{(stockByType[t] ?? 0).toLocaleString()}</p>
              <p className="text-xs opacity-80">in stock</p>
            </div>
          ))}
        </div>

        {/* Step 1: Select customer */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">1. Select customer</h2>
            {!selectedCustomer ? (
              <button type="button" onClick={() => { setNewCustomerOpen(true); setError('') }}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium">Add new customer</button>
            ) : (
              <button type="button" onClick={() => setSelectedCustomer(null)}
                className="text-xs text-red-500 hover:text-red-700 font-medium">Change customer</button>
            )}
          </div>

          {!selectedCustomer ? (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, ID, phone..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                {loadingCustomers ? (
                  <div className="p-4 text-center text-sm text-gray-400">Loading...</div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">No customers found</div>
                ) : filteredCustomers.map(c => (
                  <button key={c.id} type="button" onClick={() => setSelectedCustomer(c)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{c.customer_id}</span>
                      <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    </div>
                    {c.phone && <p className="text-xs text-gray-400 mt-0.5">{c.phone}</p>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
              <span className="font-mono text-xs bg-white text-brand-700 px-2 py-0.5 rounded">{selectedCustomer.customer_id}</span>
              <span className="text-sm font-semibold text-gray-900 ml-2">{selectedCustomer.name}</span>
              {selectedCustomer.phone && <p className="text-xs text-gray-600 mt-1">{selectedCustomer.phone}</p>}
            </div>
          )}
        </div>

        {/* Step 2: Sale details */}
        {selectedCustomer && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">2. Sale details</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Type <span className="text-red-400">*</span></label>
                <select value={type} onChange={e => setType(e.target.value as typeof TYPES[number] | '')}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white ${type ? TYPE_COLORS[type] : 'border-gray-200'}`}>
                  <option value="">Select type...</option>
                  {TYPES.map(t => <option key={t} value={t}>{t} ({stockByType[t] ?? 0} available)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity <span className="text-red-400">*</span></label>
                <input type="number" min="1" max={availableStock} value={quantity} onChange={e => setQuantity(e.target.value)}
                  placeholder="0" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                {type && <p className="text-xs text-gray-400 mt-1">Max: {availableStock}</p>}
              </div>
            </div>

            {/* Pricing mode */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Pricing mode</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPricingMode('gross')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    pricingMode === 'gross' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <DollarSign size={13} className="inline mr-1" /> Gross total
                </button>
                <button type="button" onClick={() => setPricingMode('per_piece')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    pricingMode === 'per_piece' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <Calculator size={13} className="inline mr-1" /> Per piece
                </button>
              </div>
            </div>

            {pricingMode === 'gross' ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Total price (₦) <span className="text-red-400">*</span></label>
                <input type="number" step="0.01" value={grossAmount} onChange={e => setGrossAmount(e.target.value)}
                  placeholder="0.00" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Price per piece (₦) <span className="text-red-400">*</span></label>
                  <input type="number" step="0.01" value={pricePerPiece} onChange={e => setPricePerPiece(e.target.value)}
                    placeholder="0.00" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price per piece</span>
                    <span className="font-semibold">{fmt(Number(pricePerPiece || 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Quantity</span>
                    <span className="font-semibold">{Number(quantity || 0)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200 text-sm">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="font-bold text-brand-700">{fmt(computedTotal)}</span>
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Amount paid now (₦)</label>
                <input type="number" step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                  placeholder="0.00" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment method</label>
                <input value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  placeholder="Cash / Transfer / POS..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
          </div>
        )}

        {/* Step 3: Approval */}
        {selectedCustomer && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">3. Approval</h2>

            {canSelfApprove && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={selfApprove} onChange={e => setSelfApprove(e.target.checked)} className="mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-amber-900">Self-approve this sale</span>
                    <p className="text-xs text-amber-700 mt-0.5">As an admin, you can record this sale as already approved.</p>
                  </div>
                </label>
              </div>
            )}

            {!selfApprove && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Assign approval to <span className="text-red-400">*</span></label>
                <select value={assignee} onChange={e => setAssignee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="">Select approver...</option>
                  {employees.filter(e => e.id !== currentUserId).map(e => (
                    <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {selectedCustomer && (
          <>
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg"><p className="text-sm text-red-700">{error}</p></div>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => router.back()}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={submit} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {selfApprove ? 'Save & approve' : 'Submit for approval'}</>}
              </button>
            </div>
          </>
        )}

        <Modal open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} title="Add new customer" size="md">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Name <span className="text-red-400">*</span></label>
              <input value={newCustomerForm.name} onChange={e => setNewCustomerForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone</label>
                <input value={newCustomerForm.phone} onChange={e => setNewCustomerForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                <input value={newCustomerForm.email} onChange={e => setNewCustomerForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Address</label>
              <textarea rows={2} value={newCustomerForm.address} onChange={e => setNewCustomerForm(f => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setNewCustomerOpen(false)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={createCustomer} disabled={creatingCustomer}
                className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-2">
                {creatingCustomer ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create customer'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </PermissionGate>
  )
}
