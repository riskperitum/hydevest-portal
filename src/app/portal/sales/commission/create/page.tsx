'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Search, Calculator, DollarSign } from 'lucide-react'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'

interface SalesOrder {
  id: string
  order_id: string
  sale_type: string
  customer_payable: number
  status: string
  approval_status: string
  customer: { name: string } | null
  container: { container_id: string; tracking_number: string | null } | null
  presale: { price_per_piece: number | null } | null
  total_pieces: number
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function CreateCommissionPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)

  const [calculationType, setCalculationType] = useState<'auto' | 'flat'>('auto')
  const [excessAmount, setExcessAmount] = useState('')
  const [flatAmount, setFlatAmount] = useState('')
  const [referrerName, setReferrerName] = useState('')
  const [notes, setNotes] = useState('')
  const [selfApprove, setSelfApprove] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { permissions, isSuperAdmin } = usePermissions()
  const canSelfApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*') || can(permissions, isSuperAdmin, 'commission.approve')

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
      const emps = await getAdminProfiles()
      setEmployees(emps)

      // Load all sales orders that are approved
      const one = <T,>(v: T | T[] | null | undefined): T | null => {
        if (v == null) return null
        return Array.isArray(v) ? (v[0] ?? null) : v
      }

      const { data: salesData } = await supabase
        .from('sales_orders')
        .select(`
          id, order_id, sale_type, customer_payable, status, approval_status,
          customer:customers(name),
          container:containers(container_id, tracking_number),
          presale:presales!sales_orders_presale_id_fkey(price_per_piece)
        `)
        .order('created_at', { ascending: false })

      // Fetch pallet data to compute total pieces per order
      const orderIds = (salesData ?? []).map(o => o.id)
      const { data: palletData } = await supabase
        .from('sales_order_pallets')
        .select('order_id, pallets_sold, pieces_per_pallet, total_pieces')
        .in('order_id', orderIds)

      const piecesByOrder: Record<string, number> = {}
      for (const p of (palletData ?? [])) {
        const pieces = Number(p.total_pieces ?? (p.pallets_sold * p.pieces_per_pallet))
        piecesByOrder[p.order_id] = (piecesByOrder[p.order_id] ?? 0) + pieces
      }

      setOrders(
        (salesData ?? []).map(o => ({
          ...o,
          customer: one(o.customer),
          container: one(o.container),
          presale: one(o.presale),
          total_pieces: piecesByOrder[o.id] ?? 0,
        })) as SalesOrder[],
      )
      setLoadingOrders(false)
    }
    init()
  }, [])

  const filteredOrders = orders.filter(o => {
    if (search === '') return true
    const s = search.toLowerCase()
    return (
      o.order_id.toLowerCase().includes(s) ||
      (o.customer?.name ?? '').toLowerCase().includes(s) ||
      (o.container?.tracking_number ?? '').toLowerCase().includes(s) ||
      (o.container?.container_id ?? '').toLowerCase().includes(s)
    )
  })

  // Auto-calculated commission
  const autoCommissionAmount = selectedOrder && excessAmount
    ? Number(excessAmount) * selectedOrder.total_pieces
    : 0

  const finalCommissionAmount = calculationType === 'auto'
    ? autoCommissionAmount
    : Number(flatAmount || 0)

  async function submit() {
    if (!selectedOrder) {
      setError('Please select a sales order')
      return
    }
    if (!referrerName.trim()) {
      setError('Referrer name is required')
      return
    }
    if (calculationType === 'auto' && (!excessAmount || Number(excessAmount) <= 0)) {
      setError('Excess amount is required')
      return
    }
    if (calculationType === 'flat' && (!flatAmount || Number(flatAmount) <= 0)) {
      setError('Commission amount is required')
      return
    }
    if (finalCommissionAmount <= 0) {
      setError('Commission amount must be greater than 0')
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

    const pricePerPiece = selectedOrder.presale?.price_per_piece
      ?? (selectedOrder.total_pieces > 0 ? selectedOrder.customer_payable / selectedOrder.total_pieces : 0)

    const commissionData = {
      sales_order_id: selectedOrder.id,
      referrer_name: referrerName.trim(),
      calculation_type: calculationType,
      excess_amount: calculationType === 'auto' ? Number(excessAmount) : null,
      total_pieces: calculationType === 'auto' ? selectedOrder.total_pieces : null,
      sale_price_per_piece: calculationType === 'auto' ? pricePerPiece : null,
      commission_amount: finalCommissionAmount,
      notes: notes.trim() || null,
      status: (selfApprove && canSelfApprove) ? 'approved' : 'pending_approval',
      approved_at: (selfApprove && canSelfApprove) ? new Date().toISOString() : null,
      approved_by: (selfApprove && canSelfApprove) ? user?.id : null,
      created_by: user?.id,
    }

    const { data: commission, error: insertError } = await supabase
      .from('commissions')
      .insert(commissionData)
      .select()
      .single()

    if (insertError || !commission) {
      setError(insertError?.message ?? 'Failed to create commission')
      setSaving(false)
      return
    }

    // Log activity
    await supabase.from('commission_activity_log').insert({
      commission_id: commission.id,
      action: (selfApprove && canSelfApprove) ? 'Commission created (self-approved)' : 'Commission created',
      performed_by: user?.id,
    })

    // Create task for approval workflow (unless self-approved)
    if (!selfApprove || !canSelfApprove) {
      const { data: task } = await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `Commission approval: ${commission.commission_id}`,
        description: notes.trim() || `Commission approval for ${selectedOrder.order_id}`,
        module: 'commission',
        record_id: commission.id,
        record_ref: commission.commission_id,
        requested_by: user?.id,
        assigned_to: assignee,
        priority: 'normal',
      }).select().single()

      if (assignee) {
        await supabase.from('notifications').insert({
          user_id: assignee,
          type: 'task_approval_request',
          title: 'New task: Commission approval',
          message: `${commission.commission_id} — ${referrerName}`,
          task_id: task?.id,
          record_id: commission.id,
          record_ref: commission.commission_id,
          module: 'commission',
        })
      }
    } else {
      // Self-approved: log the task as already approved
      await supabase.from('tasks').insert({
        type: 'approval_request',
        title: `Commission approval: ${commission.commission_id} (self-approved)`,
        description: notes.trim() || `Commission approval for ${selectedOrder.order_id}`,
        module: 'commission',
        record_id: commission.id,
        record_ref: commission.commission_id,
        requested_by: user?.id,
        assigned_to: user?.id,
        status: 'approved',
        priority: 'normal',
        review_note: 'Self-approved by ' + (user?.email ?? 'admin'),
      })
    }

    router.push('/portal/sales/commission')
  }

  return (
    <PermissionGate permKey="commission.create">
      <div className="space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Record commission</h1>
            <p className="text-sm text-gray-400 mt-0.5">Add a commission against a sales order</p>
          </div>
        </div>

        {/* Step 1: Select sales order */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">1. Select sales order</h2>
            {selectedOrder && (
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Change order
              </button>
            )}
          </div>

          {!selectedOrder ? (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by order ID, customer, or container..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                {loadingOrders ? (
                  <div className="p-4 text-center text-sm text-gray-400">Loading orders...</div>
                ) : filteredOrders.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">No orders found</div>
                ) : (
                  filteredOrders.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOrder(o)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">
                            {o.order_id}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{o.customer?.name ?? '—'}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${o.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                            {o.sale_type?.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {o.container?.tracking_number ?? o.container?.container_id ?? '—'} · {o.total_pieces} pieces
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{fmt(o.customer_payable)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-white text-brand-700 px-2 py-0.5 rounded">
                      {selectedOrder.order_id}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{selectedOrder.customer?.name ?? '—'}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {selectedOrder.container?.tracking_number ?? selectedOrder.container?.container_id ?? '—'} · {selectedOrder.total_pieces} pieces · {selectedOrder.sale_type?.replace('_', ' ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Customer payable</p>
                  <p className="text-sm font-bold text-gray-900">{fmt(selectedOrder.customer_payable)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Commission calculation */}
        {selectedOrder && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">2. Commission calculation</h2>

            {/* Calculation type toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCalculationType('auto')}
                className={`flex-1 px-4 py-3 text-sm font-medium rounded-lg border transition-colors ${
                  calculationType === 'auto'
                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Calculator size={14} className="inline mr-2" />
                Auto calculate
              </button>
              <button
                type="button"
                onClick={() => setCalculationType('flat')}
                className={`flex-1 px-4 py-3 text-sm font-medium rounded-lg border transition-colors ${
                  calculationType === 'flat'
                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <DollarSign size={14} className="inline mr-2" />
                Flat amount
              </button>
            </div>

            {calculationType === 'auto' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Excess amount per piece (₦) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={excessAmount}
                    onChange={e => setExcessAmount(e.target.value)}
                    placeholder="e.g., 100"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Formula: Excess amount × Total pieces = Commission
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Excess amount per piece</span>
                    <span className="font-semibold">{fmt(Number(excessAmount || 0))}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Total pieces</span>
                    <span className="font-semibold">{selectedOrder.total_pieces}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">Commission amount</span>
                    <span className="font-bold text-brand-700">{fmt(autoCommissionAmount)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Commission amount (₦) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={flatAmount}
                  onChange={e => setFlatAmount(e.target.value)}
                  placeholder="e.g., 50000"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 3: Referrer and notes */}
        {selectedOrder && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">3. Referrer details</h2>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Referrer name <span className="text-red-400">*</span>
              </label>
              <input
                value={referrerName}
                onChange={e => setReferrerName(e.target.value)}
                placeholder="Full name of the referrer"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any additional notes..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 4: Approval */}
        {selectedOrder && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">4. Approval</h2>

            {canSelfApprove && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selfApprove}
                    onChange={e => setSelfApprove(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium text-amber-900">Self-approve this commission</span>
                    <p className="text-xs text-amber-700 mt-0.5">
                      As an admin, you can create this commission as already approved, skipping the approval workflow.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {!selfApprove && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Assign approval to <span className="text-red-400">*</span>
                </label>
                <select
                  value={assignee}
                  onChange={e => setAssignee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  <option value="">Select approver...</option>
                  {employees.filter(e => e.id !== currentUserId).map(e => (
                    <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {selectedOrder && (
          <>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || finalCommissionAmount <= 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {selfApprove ? 'Record & approve' : 'Record commission'}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </PermissionGate>
  )
}
