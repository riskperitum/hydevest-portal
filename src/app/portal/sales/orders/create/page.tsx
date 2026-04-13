'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, Loader2, X, CheckCircle2 } from 'lucide-react'
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

export default function CreateSalesOrderPage() {
  const router = useRouter()
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
  const [discount, setDiscount] = useState('0')
  const [overages, setOverages] = useState('0')
  const [amountPaid, setAmountPaid] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [palletLines, setPalletLines] = useState<PalletLine[]>([])

  // Step tracking
  const step = !selectedContainer ? 1 : !selectedCustomer ? 2 : 3

  useEffect(() => {
    const supabase = createClient()
    supabase.from('presales')
      .select('container_id')
      .in('status', ['draft', 'confirmed', 'altered'])
      .then(({ data }) => {
        const ids = [...new Set((data ?? []).map(p => p.container_id))]
        if (!ids.length) return
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

  const splitSaleAmount = palletLines.reduce((s, l) => {
    return s + (parseInt(l.pallets_to_sell) || 0) * l.pallet_pieces * (parseFloat(l.selling_price_per_piece) || 0)
  }, 0)

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

    const { data: order, error } = await supabase.from('sales_orders').insert({
      container_id: selectedContainer.id,
      presale_id: selectedPresale.id,
      customer_id: selectedCustomer.id,
      sale_type: selectedPresale.sale_type,
      sale_amount: effectiveSaleAmount,
      discount: parseFloat(discount) || 0,
      overages: parseFloat(overages) || 0,
      customer_payable: customerPayable,
      amount_paid: parseFloat(amountPaid) || 0,
      outstanding_balance: outstandingBalance,
      payment_method: paymentMethod,
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
    setSaving(false)
    if (!error) router.push('/portal/sales/orders')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/portal/sales/orders"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Record sale</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {[
                { n: 1, label: 'Container' },
                { n: 2, label: 'Customer' },
                { n: 3, label: 'Details' },
              ].map((s, i) => (
                <div key={s.n} className="flex items-center gap-1.5">
                  {i > 0 && <div className={`w-8 h-px ${step > i ? 'bg-brand-400' : 'bg-gray-200'}`} />}
                  <div className={`flex items-center gap-1 text-xs font-medium ${step === s.n ? 'text-brand-600' : step > s.n ? 'text-green-600' : 'text-gray-400'}`}>
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-xs
                      ${step > s.n ? 'bg-green-100 text-green-600' : step === s.n ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>
                      {step > s.n ? '✓' : s.n}
                    </div>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Link href="/portal/sales/orders"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          Cancel
        </Link>
      </div>

      <div className="flex h-[calc(100vh-73px)]">

        {/* LEFT PANEL — Selections */}
        <div className="w-96 bg-white border-r border-gray-100 flex flex-col shrink-0">

          {/* Step 1: Container */}
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              1 · Select container
            </p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={containerSearch}
                onChange={e => setContainerSearch(e.target.value)}
                placeholder="Search tracking number..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filteredContainers.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No presaled containers available</div>
            ) : filteredContainers.map(c => (
              <button key={c.id} type="button"
                onClick={() => selectContainer(c)}
                className={`w-full text-left px-4 py-3 hover:bg-brand-50/50 transition-colors flex items-center justify-between gap-2
                  ${selectedContainer?.id === c.id ? 'bg-brand-50 border-l-2 border-brand-600' : ''}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.tracking_number ?? c.container_id}</p>
                  <p className="text-xs text-gray-400 truncate">{c.container_id} · {c.trip?.trip_id}</p>
                </div>
                {selectedContainer?.id === c.id && (
                  <CheckCircle2 size={16} className="text-brand-600 shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Step 2: Customer */}
          {selectedContainer && (
            <>
              <div className="p-4 border-t border-gray-200 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">2 · Select customer</p>
                  <button type="button" onClick={() => setAddCustomerOpen(true)}
                    className="text-xs text-brand-600 hover:underline font-medium">+ New</button>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Search name, phone or ID..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-gray-50 border-t border-gray-100">
                {filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">No customers found</div>
                ) : filteredCustomers.map(c => (
                  <button key={c.id} type="button"
                    onClick={() => setSelectedCustomer(c)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-brand-50/50 transition-colors flex items-center justify-between gap-2
                      ${selectedCustomer?.id === c.id ? 'bg-brand-50 border-l-2 border-brand-600' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.customer_id}{c.phone ? ` · ${c.phone}` : ''}</p>
                    </div>
                    {selectedCustomer?.id === c.id && (
                      <CheckCircle2 size={15} className="text-brand-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL — Details */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedContainer && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                <Search size={24} className="text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium">Select a container to start</p>
              <p className="text-sm text-gray-400">Search and select a presaled container from the left panel</p>
            </div>
          )}

          {selectedContainer && loadingPresale && (
            <div className="flex items-center justify-center h-32 gap-2 text-gray-400">
              <Loader2 size={18} className="animate-spin" /> Loading presale information...
            </div>
          )}

          {selectedContainer && selectedPresale && !loadingPresale && (
            <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">

              {/* Presale info */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Presale information</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: 'Presale ID', value: selectedPresale.presale_id },
                    { label: 'Type', value: selectedPresale.sale_type === 'box_sale' ? 'Box sale' : 'Split sale' },
                    { label: 'Status', value: selectedPresale.status },
                    { label: 'W/H avg weight', value: selectedPresale.warehouse_confirmed_avg_weight ? `${selectedPresale.warehouse_confirmed_avg_weight} kg` : '—' },
                    { label: 'W/H pieces', value: selectedPresale.warehouse_confirmed_pieces?.toLocaleString() ?? '—' },
                    { label: 'Price / piece', value: selectedPresale.price_per_piece ? fmt(selectedPresale.price_per_piece) : '—' },
                    { label: 'Price / kilo', value: selectedPresale.price_per_kilo ? fmt(selectedPresale.price_per_kilo) : '—' },
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

              {/* Customer selected info */}
              {selectedCustomer && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Customer</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedCustomer.name}</p>
                    <p className="text-xs text-gray-400">{selectedCustomer.customer_id}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedCustomer(null)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              )}

              {!selectedCustomer && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 font-medium">
                  ← Select a customer from the left panel to continue
                </div>
              )}

              {/* Split sale pallet selection */}
              {selectedCustomer && selectedPresale.sale_type === 'split_sale' && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-sm font-semibold text-gray-700">Pallet selection</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Enter pallets to sell and selling price per piece</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {['Pallet type', 'Available', 'Pallets to sell', 'Sell price/pc (₦)', 'Total pieces', 'Line total'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {palletLines.map((line, idx) => {
                          const pallets = parseInt(line.pallets_to_sell) || 0
                          const price = parseFloat(line.selling_price_per_piece) || 0
                          const totalPieces = pallets * line.pallet_pieces
                          const lineTotal = totalPieces * price
                          return (
                            <tr key={idx} className="border-b border-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{line.pallet_pieces.toLocaleString()} pcs</td>
                              <td className="px-4 py-3 text-sm text-gray-500">{line.available_pallets}</td>
                              <td className="px-4 py-3">
                                <input type="number" min="0" max={line.available_pallets}
                                  value={line.pallets_to_sell}
                                  onChange={e => setPalletLines(lines => lines.map((l, i) => i === idx ? { ...l, pallets_to_sell: e.target.value } : l))}
                                  className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  placeholder="0" />
                              </td>
                              <td className="px-4 py-3">
                                <input type="number" step="0.01"
                                  value={line.selling_price_per_piece}
                                  onChange={e => setPalletLines(lines => lines.map((l, i) => i === idx ? { ...l, selling_price_per_piece: e.target.value } : l))}
                                  className="w-28 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  placeholder="0" />
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
              {selectedCustomer && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-gray-700">Sale details</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedPresale.sale_type === 'box_sale' && (
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Sale amount (₦) <span className="text-red-400">*</span></label>
                        <input required type="number" step="0.01" value={saleAmount}
                          onChange={e => setSaleAmount(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="₦0.00" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment method</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                        <option value="cash">Cash</option>
                        <option value="transfer">Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Discount (₦)</label>
                      <input type="number" step="0.01" value={discount}
                        onChange={e => setDiscount(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="₦0.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Overages (₦)</label>
                      <input type="number" step="0.01" value={overages}
                        onChange={e => setOverages(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="₦0.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount paid / deposit (₦)</label>
                      <input type="number" step="0.01" value={amountPaid}
                        onChange={e => setAmountPaid(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="₦0.00" />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment summary</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Sale amount</span>
                      <span className="font-medium">{effectiveSaleAmount > 0 ? fmt(effectiveSaleAmount) : '—'}</span>
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
                      <span className="font-bold text-lg text-gray-900">{customerPayable > 0 ? fmt(customerPayable) : '—'}</span>
                    </div>
                    <div className={`flex justify-between text-sm pt-2 border-t border-gray-200`}>
                      <span className="font-semibold text-gray-700">Outstanding balance</span>
                      <span className={`font-bold ${outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(outstandingBalance)}
                      </span>
                    </div>
                  </div>

                  <button type="submit"
                    disabled={saving || effectiveSaleAmount <= 0}
                    className="w-full px-4 py-3 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Recording sale…</> : 'Record sale'}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>

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
