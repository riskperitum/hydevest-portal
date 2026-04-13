'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Loader2, X, CheckCircle2, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'

interface Container {
  id: string
  container_id: string
  tracking_number: string | null
  container_number: string | null
  trip: { trip_id: string; title: string } | null
}

interface Presale {
  id: string
  presale_id: string
  sale_type: string
  status: string
  warehouse_confirmed_avg_weight: number | null
  warehouse_confirmed_pieces: number | null
  price_per_kilo: number | null
  price_per_piece: number | null
  expected_sale_revenue: number | null
  total_number_of_pallets: number | null
  pallet_distributions: PalletDistribution[]
}

interface PalletDistribution {
  id: string
  pallet_pieces: number
  number_of_pallets: number
  pallets_sold: number
}

interface Customer {
  id: string
  customer_id: string
  name: string
  phone: string | null
}

interface PalletLine {
  distribution_id: string
  pallet_pieces: number
  available_pallets: number
  pallets_to_sell: string
  selling_price_per_piece: string
}

type Step = 'container' | 'customer' | 'details'

export default function CreateSalesOrderPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>('container')
  const [saving, setSaving] = useState(false)

  const [containers, setContainers] = useState<Container[]>([])
  const [containerSearch, setContainerSearch] = useState('')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [selectedPresale, setSelectedPresale] = useState<Presale | null>(null)
  const [loadingPresale, setLoadingPresale] = useState(false)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' })
  const [savingCustomer, setSavingCustomer] = useState(false)

  const [saleAmount, setSaleAmount] = useState('')
  const [discount, setDiscount] = useState('')
  const [overages, setOverages] = useState('')
  const [amountPaid, setAmountPaid] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [palletLines, setPalletLines] = useState<PalletLine[]>([])
  const [presaleOpen, setPresaleOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('presales')
        .select('container_id, sale_type')
        .in('status', ['draft', 'confirmed', 'altered']),
      supabase.from('sales_orders')
        .select('container_id, sale_type')
        .eq('sale_type', 'box_sale'),
    ]).then(([{ data: presales }, { data: boxSales }]) => {
      const soldBoxIds = new Set((boxSales ?? []).map(o => o.container_id))
      const availablePresales = (presales ?? []).filter(p => {
        if (p.sale_type === 'box_sale' && soldBoxIds.has(p.container_id)) return false
        return true
      })
      const ids = [...new Set(availablePresales.map(p => p.container_id))]
      if (!ids.length) { setContainers([]); return }
      supabase.from('containers')
        .select('*, trip:trips(trip_id, title)')
        .in('id', ids)
        .then(({ data: c }) => setContainers(c ?? []))
    })
    supabase.from('customers')
      .select('id, customer_id, name, phone')
      .eq('is_active', true)
      .then(({ data }) => setCustomers(data ?? []))
  }, [])

  async function selectContainer(c: Container) {
    setSelectedContainer(c)
    setSelectedPresale(null)
    setPalletLines([])
    setLoadingPresale(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('presales')
      .select('*, pallet_distributions:presale_pallet_distributions(*)')
      .eq('container_id', c.id)
      .in('status', ['draft', 'confirmed', 'altered'])
      .single()
    setSelectedPresale(data)
    if (data?.sale_type === 'split_sale') {
      setPalletLines((data.pallet_distributions ?? []).map((pd: PalletDistribution) => ({
        distribution_id: pd.id,
        pallet_pieces: pd.pallet_pieces,
        available_pallets: pd.number_of_pallets - pd.pallets_sold,
        pallets_to_sell: '',
        selling_price_per_piece: '',
      })))
    }
    setLoadingPresale(false)
    setCurrentStep('customer')
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    setSavingCustomer(true)
    const supabase = createClient()
    const { data } = await supabase.from('customers').insert({
      name: newCustomer.name,
      phone: newCustomer.phone || null,
      address: newCustomer.address || null,
    }).select().single()
    if (data) { setCustomers(p => [data, ...p]); setSelectedCustomer(data) }
    setSavingCustomer(false)
    setAddCustomerOpen(false)
    setNewCustomer({ name: '', phone: '', address: '' })
  }

  const splitSaleAmount = palletLines.reduce((s, l) =>
    s + (parseInt(l.pallets_to_sell) || 0) * l.pallet_pieces * (parseFloat(l.selling_price_per_piece) || 0), 0)

  const effectiveSaleAmount = selectedPresale?.sale_type === 'split_sale'
    ? splitSaleAmount : parseFloat(saleAmount) || 0
  const customerPayable = effectiveSaleAmount - (parseFloat(discount) || 0) + (parseFloat(overages) || 0)
  const outstandingBalance = Math.max(customerPayable - (parseFloat(amountPaid) || 0), 0)

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filteredContainers = containers.filter(c =>
    containerSearch === '' ||
    (c.tracking_number ?? '').toLowerCase().includes(containerSearch.toLowerCase()) ||
    c.container_id.toLowerCase().includes(containerSearch.toLowerCase())
  )

  const filteredCustomers = customers.filter(c =>
    customerSearch === '' ||
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone ?? '').includes(customerSearch) ||
    c.customer_id.toLowerCase().includes(customerSearch.toLowerCase())
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedContainer || !selectedPresale || !selectedCustomer) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const paidAmount = parseFloat(amountPaid) || 0
    const paymentStatus = paidAmount <= 0 ? 'outstanding' : outstandingBalance <= 0 ? 'paid' : 'partial'

    const { data: order, error } = await supabase.from('sales_orders').insert({
      container_id: selectedContainer.id,
      presale_id: selectedPresale.id,
      customer_id: selectedCustomer.id,
      sale_type: selectedPresale.sale_type,
      sale_amount: effectiveSaleAmount,
      discount: parseFloat(discount) || 0,
      overages: parseFloat(overages) || 0,
      customer_payable: customerPayable,
      amount_paid: paidAmount,
      outstanding_balance: outstandingBalance,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      approval_status: 'pending',
      needs_approval: true,
      created_by: user?.id,
    }).select().single()

    if (!error && order && selectedPresale.sale_type === 'split_sale') {
      for (const line of palletLines.filter(l => parseInt(l.pallets_to_sell) > 0 && parseFloat(l.selling_price_per_piece) > 0)) {
        const palletsSold = parseInt(line.pallets_to_sell)
        const totalPieces = palletsSold * line.pallet_pieces
        await supabase.from('sales_order_pallets').insert({
          order_id: order.id,
          pallet_distribution_id: line.distribution_id,
          pallets_sold: palletsSold,
          pieces_per_pallet: line.pallet_pieces,
          total_pieces: totalPieces,
          selling_price_per_piece: parseFloat(line.selling_price_per_piece),
          line_total: totalPieces * parseFloat(line.selling_price_per_piece),
        })
        const { data: dist } = await supabase.from('presale_pallet_distributions')
          .select('pallets_sold').eq('id', line.distribution_id).single()
        await supabase.from('presale_pallet_distributions')
          .update({ pallets_sold: (dist?.pallets_sold ?? 0) + palletsSold })
          .eq('id', line.distribution_id)
      }
    }
    if (!error && order) {
      await supabase.from('sales_order_activity_log').insert({
        order_id: order.id,
        action: 'Sale recorded',
        performed_by: user?.id,
      })
    }
    setSaving(false)
    if (!error) router.push('/portal/sales/orders')
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'container', label: 'Container' },
    { key: 'customer', label: 'Customer' },
    { key: 'details', label: 'Sale details' },
  ]

  const stepDone = (s: Step) => {
    if (s === 'container') return !!selectedContainer
    if (s === 'customer') return !!selectedCustomer
    return false
  }

  const CollapsiblePresale = () => {
    if (!selectedPresale) return null
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button type="button"
          onClick={() => setPresaleOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">Presale summary</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${selectedPresale.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
              {selectedPresale.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}
            </span>
          </div>
          <ChevronRight size={15} className={`text-gray-400 transition-transform ${presaleOpen ? 'rotate-90' : ''}`} />
        </button>
        {presaleOpen && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
              {[
                { label: 'Presale ID', value: selectedPresale.presale_id },
                { label: 'Type', value: selectedPresale.sale_type === 'box_sale' ? 'Box sale' : 'Split sale' },
                { label: 'Status', value: selectedPresale.status },
                { label: 'W/H avg weight', value: selectedPresale.warehouse_confirmed_avg_weight ? `${selectedPresale.warehouse_confirmed_avg_weight} kg` : '—' },
                { label: 'W/H pieces', value: selectedPresale.warehouse_confirmed_pieces?.toLocaleString() ?? '—' },
                { label: 'Price / kilo', value: selectedPresale.price_per_kilo ? `₦${Number(selectedPresale.price_per_kilo).toLocaleString()}` : '—' },
                { label: 'Price / piece', value: selectedPresale.price_per_piece ? `₦${Number(selectedPresale.price_per_piece).toLocaleString()}` : '—' },
                { label: 'Expected revenue', value: selectedPresale.expected_sale_revenue ? fmt(selectedPresale.expected_sale_revenue) : '—' },
                ...(selectedPresale.sale_type === 'split_sale' ? [{ label: 'Total pallets', value: selectedPresale.total_number_of_pallets?.toString() ?? '—' }] : []),
              ].map(item => (
                <div key={item.label}>
                  <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                  <p className="text-sm font-medium text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href="/portal/sales/orders"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Record sale</h1>
          <p className="text-sm text-gray-400">Complete all steps to record a customer sale</p>
        </div>
      </div>

      {/* Step tracker */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => {
                  if (s.key === 'container') setCurrentStep('container')
                  if (s.key === 'customer' && selectedContainer) setCurrentStep('customer')
                  if (s.key === 'details' && selectedContainer && selectedCustomer) setCurrentStep('details')
                }}
                className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
                  ${currentStep === s.key ? 'bg-brand-50 text-brand-700' : stepDone(s.key) ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors
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

        {/* Selected summary */}
        {(selectedContainer || selectedCustomer) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            {selectedContainer && (
              <div className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                <CheckCircle2 size={11} />
                <span className="font-medium">{selectedContainer.tracking_number ?? selectedContainer.container_id}</span>
                <button type="button" onClick={() => { setSelectedContainer(null); setSelectedPresale(null); setSelectedCustomer(null); setCurrentStep('container') }}
                  className="ml-0.5 text-green-500 hover:text-green-700">
                  <X size={11} />
                </button>
              </div>
            )}
            {selectedCustomer && (
              <div className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                <CheckCircle2 size={11} />
                <span className="font-medium">{selectedCustomer.name}</span>
                <button type="button" onClick={() => { setSelectedCustomer(null); setCurrentStep('customer') }}
                  className="ml-0.5 text-green-500 hover:text-green-700">
                  <X size={11} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 1 — Container */}
      {currentStep === 'container' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Select container</h2>
            <p className="text-xs text-gray-400 mt-0.5">Only containers with an active presale are shown</p>
          </div>
          <div className="p-4">
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={containerSearch} onChange={e => setContainerSearch(e.target.value)}
                placeholder="Search by tracking number..."
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {filteredContainers.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">No presaled containers available</p>
            ) : filteredContainers.map(c => (
              <button key={c.id} type="button" onClick={() => selectContainer(c)}
                className="w-full text-left px-5 py-3.5 hover:bg-brand-50/50 transition-colors flex items-center justify-between gap-3 group">
                <div>
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">{c.tracking_number ?? c.container_id}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.container_id} · {c.trip?.trip_id} — {c.trip?.title}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-400 shrink-0" />
              </button>
            ))}
          </div>
          {loadingPresale && (
            <div className="px-5 py-4 flex items-center gap-2 text-sm text-gray-400 border-t border-gray-100">
              <Loader2 size={14} className="animate-spin" /> Loading presale...
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — Customer */}
      {currentStep === 'customer' && selectedPresale && (
        <div className="space-y-4">
          <CollapsiblePresale />

          {/* Customer selection */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Select customer</h2>
                <p className="text-xs text-gray-400 mt-0.5">Search by name, phone number or customer ID</p>
              </div>
              <button type="button" onClick={() => setAddCustomerOpen(true)}
                className="text-xs text-brand-600 hover:underline font-medium">+ New customer</button>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Search customer..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {filteredCustomers.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">No customers found</p>
              ) : filteredCustomers.map(c => (
                <button key={c.id} type="button"
                  onClick={() => { setSelectedCustomer(c); setCurrentStep('details') }}
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
        </div>
      )}

      {/* STEP 3 — Sale details */}
      {currentStep === 'details' && selectedPresale && selectedCustomer && (
        <form onSubmit={handleSubmit} className="space-y-5">

          <CollapsiblePresale />

          {/* Split sale pallet selection */}
          {selectedPresale.sale_type === 'split_sale' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Pallet selection</h2>
                <p className="text-xs text-gray-400 mt-0.5">Enter pallets purchased and selling price per piece for each pallet type</p>
              </div>
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Pallet type', 'Available pallets', 'Pallets purchased', 'Selling price / piece (₦)', 'Total pieces', 'Line total'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {palletLines.map((line, idx) => {
                      const pallets = parseInt(line.pallets_to_sell) || 0
                      const price = parseFloat(line.selling_price_per_piece) || 0
                      const totalPieces = pallets * line.pallet_pieces
                      const lineTotal = totalPieces * price
                      const exceedsAvailable = pallets > line.available_pallets
                      const belowPresalePrice = price > 0 && selectedPresale?.price_per_piece && price < Number(selectedPresale.price_per_piece)
                      return (
                        <tr key={idx} className="border-b border-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{line.pallet_pieces.toLocaleString()} pcs/pallet</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{line.available_pallets}</td>
                          <td className="px-4 py-3">
                            <input type="number" min="0" max={line.available_pallets}
                              value={line.pallets_to_sell}
                              onChange={e => setPalletLines(lines => lines.map((l, i) => i === idx ? { ...l, pallets_to_sell: e.target.value } : l))}
                              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                                ${exceedsAvailable ? 'border-red-300 focus:ring-red-400 bg-red-50' : 'border-gray-200 focus:ring-brand-500'}`}
                              placeholder="0" />
                            {exceedsAvailable && (
                              <p className="text-xs text-red-500 mt-1 font-medium">Max {line.available_pallets} available</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <input type="number" step="0.01"
                              value={line.selling_price_per_piece}
                              onChange={e => setPalletLines(lines => lines.map((l, i) => i === idx ? { ...l, selling_price_per_piece: e.target.value } : l))}
                              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                                ${belowPresalePrice ? 'border-amber-300 focus:ring-amber-400 bg-amber-50' : 'border-gray-200 focus:ring-brand-500'}`}
                              placeholder="₦0.00" />
                            {belowPresalePrice && (
                              <p className="text-xs text-amber-600 mt-1 font-medium">
                                Below presale price (₦{Number(selectedPresale?.price_per_piece).toLocaleString()})
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{totalPieces > 0 ? totalPieces.toLocaleString() : '—'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-brand-700">{lineTotal > 0 ? fmt(lineTotal) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Total</td>
                      <td className="px-4 py-2.5 text-xs font-bold text-gray-700">
                        {palletLines.reduce((s, l) => s + (parseInt(l.pallets_to_sell) || 0) * l.pallet_pieces, 0).toLocaleString()} pcs
                      </td>
                      <td className="px-4 py-2.5 text-xs font-bold text-brand-700">{splitSaleAmount > 0 ? fmt(splitSaleAmount) : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Sale details */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Sale details</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {selectedPresale.sale_type === 'box_sale' && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Sale amount (₦) <span className="text-red-400">*</span></label>
                  <input type="number" step="0.01" value={saleAmount} onChange={e => setSaleAmount(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="Enter sale amount" />
                  {selectedPresale.expected_sale_revenue && parseFloat(saleAmount) > 0 && parseFloat(saleAmount) < Number(selectedPresale.expected_sale_revenue) && (
                    <p className="text-xs text-amber-600 mt-1.5 font-medium flex items-center gap-1">
                      <span>{'\u26A0'}</span> Sale amount is below the expected presale revenue (��{Number(selectedPresale.expected_sale_revenue).toLocaleString()})
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Discount (₦)</label>
                <input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Overages (₦)</label>
                <input type="number" step="0.01" value={overages} onChange={e => setOverages(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount paid / deposit (₦)</label>
                <input type="number" step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0.00" />
              </div>
            </div>

            {/* Payment summary */}
            {effectiveSaleAmount > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Payment summary</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Sale amount</span>
                  <span className="font-medium text-gray-900">{fmt(effectiveSaleAmount)}</span>
                </div>
                {parseFloat(discount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Discount</span>
                    <span className="text-red-500 font-medium">-{fmt(parseFloat(discount))}</span>
                  </div>
                )}
                {parseFloat(overages) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Overages</span>
                    <span className="text-green-600 font-medium">+{fmt(parseFloat(overages))}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                  <span className="font-semibold text-gray-700">Customer payable</span>
                  <span className="font-bold text-gray-900">{fmt(customerPayable)}</span>
                </div>
                {parseFloat(amountPaid) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount paid</span>
                    <span className="text-green-600 font-medium">-{fmt(parseFloat(amountPaid))}</span>
                  </div>
                )}
                <div className={`flex justify-between text-sm pt-2 border-t border-gray-200`}>
                  <span className="font-semibold text-gray-700">Outstanding balance</span>
                  <span className={`font-bold text-base ${outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmt(outstandingBalance)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button type="button" onClick={() => setCurrentStep('customer')}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
              Back
            </button>
            <button type="submit" disabled={saving || effectiveSaleAmount <= 0 || palletLines.some(l => parseInt(l.pallets_to_sell) > l.available_pallets)}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Recording…</> : 'Record sale'}
            </button>
          </div>
        </form>
      )}

      {/* Add customer modal */}
      <Modal open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} title="Add new customer" size="sm">
        <form onSubmit={handleAddCustomer} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-400">*</span></label>
            <input required value={newCustomer.name} onChange={e => setNewCustomer(c => ({ ...c, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Full name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input value={newCustomer.phone} onChange={e => setNewCustomer(c => ({ ...c, phone: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="+234 800 000 0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input value={newCustomer.address} onChange={e => setNewCustomer(c => ({ ...c, address: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Address" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setAddCustomerOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={savingCustomer}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {savingCustomer ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Add customer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
