'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Search, ChevronRight, CheckCircle2, X,
  Loader2, Upload, Eye, Trash2, ChevronDown
} from 'lucide-react'
import Link from 'next/link'

interface Customer {
  id: string
  customer_id: string
  name: string
  phone: string | null
}

interface SalesOrder {
  id: string
  order_id: string
  sale_type: string
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  payment_status: string
  created_at: string
  container: { tracking_number: string | null; container_id: string } | null
  pallet_lines: PalletLine[]
  total_recovered: number
}

interface PalletLine {
  id: string
  pallets_sold: number
  pieces_per_pallet: number
  total_pieces: number
  selling_price_per_piece: number
  line_total: number
}

type Step = 'customer' | 'order' | 'payment'

export default function CreateRecoveryPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>('customer')
  const [saving, setSaving] = useState(false)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [orderInfoOpen, setOrderInfoOpen] = useState(false)

  const [amountPaid, setAmountPaid] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [comments, setComments] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<{ url: string; name: string; type: string } | null>(null)

  const steps: { key: Step; label: string }[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'order', label: 'Sale order' },
    { key: 'payment', label: 'Payment' },
  ]

  const stepDone = (s: Step) => {
    if (s === 'customer') return !!selectedCustomer
    if (s === 'order') return !!selectedOrder
    return false
  }

  useEffect(() => {
    const supabase = createClient()
    // Only customers with outstanding balance
    supabase.from('sales_orders')
      .select('customer_id')
      .in('payment_status', ['outstanding', 'partial'])
      .then(({ data: orders }) => {
        const ids = [...new Set((orders ?? []).map(o => o.customer_id))]
        if (!ids.length) { setCustomers([]); return }
        supabase.from('customers')
          .select('id, customer_id, name, phone')
          .in('id', ids)
          .eq('is_active', true)
          .then(({ data }) => setCustomers(data ?? []))
      })
  }, [])

  async function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setLoadingOrders(true)
    setOrders([])
    const supabase = createClient()

    const { data: salesOrders } = await supabase
      .from('sales_orders')
      .select(`
        id, order_id, sale_type, customer_payable, amount_paid,
        outstanding_balance, payment_status, created_at,
        container:containers(tracking_number, container_id)
      `)
      .eq('customer_id', c.id)
      .in('payment_status', ['outstanding', 'partial'])
      .order('created_at', { ascending: false })

    // Get pallet lines for split sales
    const { data: recoveryTotals } = await supabase
      .from('recoveries')
      .select('sales_order_id, amount_paid')
      .in('sales_order_id', (salesOrders ?? []).map(o => o.id))

    const totalsByOrder = (recoveryTotals ?? []).reduce((acc, r) => {
      acc[r.sales_order_id] = (acc[r.sales_order_id] ?? 0) + Number(r.amount_paid)
      return acc
    }, {} as Record<string, number>)

    const one = <T,>(v: T | T[] | null | undefined): T | null => {
      if (v == null) return null
      return Array.isArray(v) ? (v[0] ?? null) : v
    }

    const ordersWithPallets = await Promise.all(
      (salesOrders ?? []).map(async o => {
        let palletLines: PalletLine[] = []
        if (o.sale_type === 'split_sale') {
          const { data: pl } = await supabase
            .from('sales_order_pallets')
            .select('*')
            .eq('order_id', o.id)
          palletLines = (pl ?? []) as PalletLine[]
        }
        return {
          ...o,
          container: one(o.container),
          pallet_lines: palletLines,
          total_recovered: totalsByOrder[o.id] ?? 0,
        } as SalesOrder
      })
    )

    setOrders(ordersWithPallets)
    setLoadingOrders(false)
    setCurrentStep('order')
  }

  async function handleUpload() {
    if (!uploadFile) return
    setUploading(true)
    const supabase = createClient()
    const ext = uploadFile.name.split('.').pop()
    const path = `recoveries/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(path, uploadFile, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      setUploadedFile({ url: publicUrl, name: uploadFile.name, type: uploadFile.type })
    }
    setUploading(false)
    setUploadFile(null)
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filteredCustomers = customers.filter(c =>
    customerSearch === '' ||
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone ?? '').includes(customerSearch) ||
    c.customer_id.toLowerCase().includes(customerSearch.toLowerCase())
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedOrder || !selectedCustomer || !amountPaid) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const paid = parseFloat(amountPaid)

    // Insert recovery record
    await supabase.from('recoveries').insert({
      sales_order_id: selectedOrder.id,
      customer_id: selectedCustomer.id,
      payment_type: 'recovery',
      amount_paid: paid,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      comments: comments || null,
      file_url: uploadedFile?.url ?? null,
      file_name: uploadedFile?.name ?? null,
      file_type: uploadedFile?.type ?? null,
      approval_status: 'approved',
      created_by: user?.id,
    })

    // Update sales order amount_paid and outstanding_balance
    const newAmountPaid = Number(selectedOrder.amount_paid) + paid
    const newOutstanding = Math.max(Number(selectedOrder.customer_payable) - newAmountPaid, 0)
    const newPaymentStatus = newOutstanding <= 0 ? 'paid' : 'partial'

    await supabase.from('sales_orders').update({
      amount_paid: newAmountPaid,
      outstanding_balance: newOutstanding,
      payment_status: newPaymentStatus,
    }).eq('id', selectedOrder.id)

    // Log activity on sales order
    await supabase.from('sales_order_activity_log').insert({
      order_id: selectedOrder.id,
      action: 'Recovery payment recorded',
      field_name: 'amount_paid',
      old_value: fmt(selectedOrder.amount_paid),
      new_value: fmt(newAmountPaid),
      performed_by: user?.id,
    })

    setSaving(false)
    router.push('/portal/recoveries')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">

      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href="/portal/recoveries"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Record recovery</h1>
          <p className="text-sm text-gray-400">Select customer, sale order, then record payment</p>
        </div>
      </div>

      {/* Step tracker */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <button type="button"
                onClick={() => {
                  if (s.key === 'customer') setCurrentStep('customer')
                  if (s.key === 'order' && selectedCustomer) setCurrentStep('order')
                  if (s.key === 'payment' && selectedOrder) setCurrentStep('payment')
                }}
                className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
                  ${currentStep === s.key ? 'bg-brand-50 text-brand-700' : stepDone(s.key) ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  ${stepDone(s.key) ? 'bg-green-100 text-green-600' : currentStep === s.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {stepDone(s.key) ? '✓' : i + 1}
                </div>
                <span className="hidden sm:block">{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <ChevronRight size={14} className={`shrink-0 ${stepDone(s.key) ? 'text-green-400' : 'text-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        {(selectedCustomer || selectedOrder) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            {selectedCustomer && (
              <div className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                <CheckCircle2 size={11} />
                <span className="font-medium">{selectedCustomer.name}</span>
                <button type="button" onClick={() => { setSelectedCustomer(null); setSelectedOrder(null); setCurrentStep('customer') }}
                  className="ml-0.5 text-green-500 hover:text-green-700"><X size={11} /></button>
              </div>
            )}
            {selectedOrder && (
              <div className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                <CheckCircle2 size={11} />
                <span className="font-medium">{selectedOrder.order_id}</span>
                <button type="button" onClick={() => { setSelectedOrder(null); setCurrentStep('order') }}
                  className="ml-0.5 text-green-500 hover:text-green-700"><X size={11} /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 1 — Customer */}
      {currentStep === 'customer' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Select customer</h2>
            <p className="text-xs text-gray-400 mt-0.5">Only customers with outstanding balances are shown</p>
          </div>
          <div className="p-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search by name, phone or ID..."
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">No customers with outstanding balances</p>
            ) : filteredCustomers.map(c => (
              <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                className="w-full text-left px-5 py-3.5 hover:bg-brand-50/50 transition-colors flex items-center justify-between gap-3 group">
                <div>
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.customer_id}{c.phone ? ` · ${c.phone}` : ''}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2 — Order selection */}
      {currentStep === 'order' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Select sale order</h2>
            <p className="text-xs text-gray-400 mt-0.5">All outstanding orders for {selectedCustomer?.name}</p>
          </div>
          {loadingOrders ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No outstanding orders found</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {orders.map(o => (
                <button key={o.id} type="button" onClick={() => { setSelectedOrder(o); setCurrentStep('payment') }}
                  className="w-full text-left px-5 py-4 hover:bg-brand-50/50 transition-colors group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{o.order_id}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {o.sale_type === 'box_sale' ? 'Box' : 'Split'}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-400 shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-gray-400">Tracking No.</p>
                      <p className="font-medium text-gray-900">{o.container?.tracking_number ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Total payable</p>
                      <p className="font-medium text-gray-900">{fmt(o.customer_payable)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Paid so far</p>
                      <p className="font-medium text-green-600">{fmt(o.total_recovered)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Outstanding</p>
                      <p className="font-semibold text-red-500">{fmt(o.outstanding_balance)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 3 — Payment details */}
      {currentStep === 'payment' && selectedOrder && (
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Sale order info — collapsible */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button type="button" onClick={() => setOrderInfoOpen(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Sale information</span>
                <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{selectedOrder.order_id}</span>
              </div>
              <ChevronDown size={15} className={`text-gray-400 transition-transform ${orderInfoOpen ? 'rotate-180' : ''}`} />
            </button>
            {orderInfoOpen && (
              <div className="px-5 pb-5 border-t border-gray-100">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                  {[
                    { label: 'Tracking No.', value: selectedOrder.container?.tracking_number ?? '—' },
                    { label: 'Sale type', value: selectedOrder.sale_type === 'box_sale' ? 'Box sale' : 'Split sale' },
                    { label: 'Sale date', value: new Date(selectedOrder.created_at).toLocaleDateString() },
                    { label: 'Total payable', value: fmt(selectedOrder.customer_payable) },
                    { label: 'Paid so far', value: fmt(selectedOrder.total_recovered) },
                    { label: 'Outstanding', value: fmt(selectedOrder.outstanding_balance) },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                      <p className="text-sm font-medium text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Pallet breakdown for split sales */}
                {selectedOrder.sale_type === 'split_sale' && selectedOrder.pallet_lines.length > 0 && (
                  <div className="mt-4 rounded-lg overflow-hidden border border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {['Pallet type', 'Pallets', 'Total pieces', 'Price/pc', 'Line total'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.pallet_lines.map(l => (
                          <tr key={l.id} className="border-b border-gray-50">
                            <td className="px-3 py-2 font-medium">{l.pieces_per_pallet.toLocaleString()} pcs/pallet</td>
                            <td className="px-3 py-2">{l.pallets_sold}</td>
                            <td className="px-3 py-2">{l.total_pieces.toLocaleString()}</td>
                            <td className="px-3 py-2">{fmt(l.selling_price_per_piece)}</td>
                            <td className="px-3 py-2 font-semibold text-brand-700">{fmt(l.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment details */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Payment details</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount paid (₦) <span className="text-red-400">*</span></label>
                <input required type="number" step="0.01" value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="₦0.00" />
                {parseFloat(amountPaid) > Number(selectedOrder.outstanding_balance) && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">⚠ Amount exceeds outstanding balance ({fmt(selectedOrder.outstanding_balance)})</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment date</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Comments</label>
                <textarea rows={2} value={comments} onChange={e => setComments(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="Add any notes about this payment..." />
              </div>
            </div>

            {/* Remaining balance preview */}
            {parseFloat(amountPaid) > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">After this payment</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Outstanding before</span>
                  <span className="font-medium text-red-500">{fmt(selectedOrder.outstanding_balance)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">This payment</span>
                  <span className="font-medium text-green-600">-{fmt(parseFloat(amountPaid))}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                  <span className="font-semibold text-gray-700">Remaining balance</span>
                  <span className={`font-bold ${Math.max(Number(selectedOrder.outstanding_balance) - parseFloat(amountPaid), 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmt(Math.max(Number(selectedOrder.outstanding_balance) - parseFloat(amountPaid), 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Attachment */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Attachment (receipt)</label>
              {uploadedFile ? (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{uploadedFile.name}</p>
                    <p className="text-xs text-gray-400">Uploaded successfully</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={uploadedFile.url} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                      <Eye size={14} />
                    </a>
                    <label className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors cursor-pointer">
                      <Upload size={14} />
                      <input type="file" className="hidden" onChange={e => { setUploadFile(e.target.files?.[0] ?? null); setUploadedFile(null) }} />
                    </label>
                    <button type="button" onClick={() => setUploadedFile(null)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-colors cursor-pointer">
                    <Upload size={16} />
                    <span>{uploadFile ? uploadFile.name : 'Click to upload receipt'}</span>
                    <input type="file" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                  </label>
                  {uploadFile && (
                    <button type="button" onClick={handleUpload} disabled={uploading}
                      className="px-4 py-3 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0">
                      {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : 'Upload'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pb-8">
            <button type="button" onClick={() => setCurrentStep('order')}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
              Back
            </button>
            <button type="submit" disabled={saving || !amountPaid || parseFloat(amountPaid) <= 0}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Recording…</> : 'Record recovery'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
