'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, ChevronDown, Loader2, ArrowLeft } from 'lucide-react'
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
  const [containerDropdownOpen, setContainerDropdownOpen] = useState(false)
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [selectedPresale, setSelectedPresale] = useState<Presale | null>(null)
  const [loadingPresale, setLoadingPresale] = useState(false)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
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

  const loadContainers = useCallback(async () => {
    const supabase = createClient()
    const { data: presales } = await supabase
      .from('presales')
      .select('container_id')
      .in('status', ['draft', 'confirmed', 'altered'])
    const presaledIds = [...new Set((presales ?? []).map(p => p.container_id))]
    if (presaledIds.length === 0) { setContainers([]); return }
    const { data } = await supabase
      .from('containers')
      .select('*, trip:trips(trip_id, title)')
      .in('id', presaledIds)
    setContainers(data ?? [])
  }, [])

  const loadCustomers = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('customers').select('id, customer_id, name, phone').eq('is_active', true)
    setCustomers(data ?? [])
  }, [])

  useEffect(() => {
    loadContainers()
    loadCustomers()
  }, [loadContainers, loadCustomers])

  async function loadPresaleForContainer(containerId: string) {
    setLoadingPresale(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('presales')
      .select('*, pallet_distributions:presale_pallet_distributions(*)')
      .eq('container_id', containerId)
      .in('status', ['draft', 'confirmed', 'altered'])
      .single()
    setSelectedPresale(data)
    if (data?.sale_type === 'split_sale' && data.pallet_distributions) {
      setPalletLines(data.pallet_distributions.map((pd: PalletDistribution) => ({
        distribution_id: pd.id,
        pallet_pieces: pd.pallet_pieces,
        available_pallets: pd.number_of_pallets - pd.pallets_sold,
        pallets_to_sell: '',
        selling_price_per_piece: '',
      })))
    } else {
      setPalletLines([])
    }
    setLoadingPresale(false)
  }

  const splitSaleAmount = palletLines.reduce((s, line) => {
    const pallets = parseInt(line.pallets_to_sell) || 0
    const price = parseFloat(line.selling_price_per_piece) || 0
    return s + (pallets * line.pallet_pieces * price)
  }, 0)

  const effectiveSaleAmount = selectedPresale?.sale_type === 'split_sale'
    ? splitSaleAmount
    : parseFloat(saleAmount) || 0

  const customerPayable = effectiveSaleAmount - (parseFloat(discount) || 0) + (parseFloat(overages) || 0)
  const outstandingBalance = customerPayable - (parseFloat(amountPaid) || 0)

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    setSavingCustomer(true)
    const supabase = createClient()
    const { data } = await supabase.from('customers').insert({
      name: newCustomer.name,
      phone: newCustomer.phone || null,
      address: newCustomer.address || null,
    }).select().single()
    if (data) {
      setCustomers(prev => [data, ...prev])
      setSelectedCustomer(data)
    }
    setSavingCustomer(false)
    setAddCustomerOpen(false)
    setNewCustomer({ name: '', phone: '', address: '' })
  }

  async function handleCreate(e: React.FormEvent) {
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

    if (error || !order) {
      setSaving(false)
      return
    }

    if (selectedPresale.sale_type === 'split_sale') {
      const linesToInsert = palletLines
        .filter(l => parseInt(l.pallets_to_sell) > 0 && parseFloat(l.selling_price_per_piece) > 0)
      for (const line of linesToInsert) {
        const palletsSold = parseInt(line.pallets_to_sell)
        const totalPieces = palletsSold * line.pallet_pieces
        const lineTotal = totalPieces * parseFloat(line.selling_price_per_piece)
        await supabase.from('sales_order_pallets').insert({
          order_id: order.id,
          pallet_distribution_id: line.distribution_id,
          pallets_sold: palletsSold,
          pieces_per_pallet: line.pallet_pieces,
          total_pieces: totalPieces,
          selling_price_per_piece: parseFloat(line.selling_price_per_piece),
          line_total: lineTotal,
        })
        await supabase.from('presale_pallet_distributions')
          .update({ pallets_sold: ((await supabase.from('presale_pallet_distributions').select('pallets_sold').eq('id', line.distribution_id).single()).data?.pallets_sold ?? 0) + palletsSold })
          .eq('id', line.distribution_id)
      }
    }

    setSaving(false)
    router.push('/portal/sales/orders')
  }

  const filteredContainers = containers.filter(c =>
    containerSearch === '' ||
    (c.tracking_number ?? '').toLowerCase().includes(containerSearch.toLowerCase()) ||
    (c.container_id ?? '').toLowerCase().includes(containerSearch.toLowerCase())
  )

  const filteredCustomers = customers.filter(c =>
    customerSearch === '' ||
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone ?? '').toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.customer_id.toLowerCase().includes(customerSearch.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        <Link href="/portal/sales/orders"
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Record sale</h1>
          <p className="text-sm text-gray-400 mt-0.5">Select container and customer, then fill in sale details</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 space-y-5">

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Container (tracking number) <span className="text-red-400">*</span></label>
            <div className="relative">
              <button type="button" onClick={() => setContainerDropdownOpen(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm hover:border-brand-300 focus:outline-none bg-white transition-colors">
                <span className={selectedContainer ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                  {selectedContainer ? `${selectedContainer.tracking_number ?? selectedContainer.container_id}` : 'Search by tracking number...'}
                </span>
                <ChevronDown size={15} className="text-gray-400" />
              </button>
              {containerDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setContainerDropdownOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-20 overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={containerSearch} onChange={e => setContainerSearch(e.target.value)}
                          placeholder="Search tracking number..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          autoFocus onClick={e => e.stopPropagation()} />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                      {filteredContainers.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-gray-400 text-center">No presaled containers found</p>
                      ) : filteredContainers.map(c => (
                        <button key={c.id} type="button"
                          onClick={() => {
                            setSelectedContainer(c)
                            setContainerDropdownOpen(false)
                            setContainerSearch('')
                            loadPresaleForContainer(c.id)
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-brand-50 transition-colors">
                          <p className="text-sm font-medium text-gray-900">{c.tracking_number ?? c.container_id}</p>
                          <p className="text-xs text-gray-400">{c.container_number ?? ''} · {c.trip?.trip_id} — {c.trip?.title}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {loadingPresale && <div className="mt-3 flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Loading presale...</div>}
            {selectedPresale && !loadingPresale && (
              <div className="mt-3 bg-gray-50 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Presale information</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Presale ID', value: selectedPresale.presale_id },
                    { label: 'Type', value: selectedPresale.sale_type === 'box_sale' ? 'Box sale' : 'Split sale' },
                    { label: 'Status', value: selectedPresale.status },
                    { label: 'W/H avg weight', value: selectedPresale.warehouse_confirmed_avg_weight ? `${selectedPresale.warehouse_confirmed_avg_weight} kg` : '—' },
                    { label: 'W/H pieces', value: selectedPresale.warehouse_confirmed_pieces?.toLocaleString() ?? '—' },
                                        { label: 'Price / kilo', value: selectedPresale.price_per_kilo ? `₦${Number(selectedPresale.price_per_kilo).toLocaleString()}` : '—' },
                    { label: 'Price / piece', value: selectedPresale.price_per_piece ? `₦${Number(selectedPresale.price_per_piece).toLocaleString()}` : '—' },
                    { label: 'Expected revenue', value: selectedPresale.expected_sale_revenue ? `₦${Number(selectedPresale.expected_sale_revenue).toLocaleString()}` : '—' },
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

          {selectedPresale && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-gray-700">Customer <span className="text-red-400">*</span></label>
                <button type="button" onClick={() => setAddCustomerOpen(true)}
                  className="text-xs text-brand-600 hover:underline font-medium">+ Add new customer</button>
              </div>
              <div className="relative">
                <button type="button" onClick={() => setCustomerDropdownOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm hover:border-brand-300 focus:outline-none bg-white transition-colors">
                  <span className={selectedCustomer ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                    {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.customer_id})` : 'Search customer by name, phone or ID...'}
                  </span>
                  <ChevronDown size={15} className="text-gray-400" />
                </button>
                {customerDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCustomerDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-20 overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                            placeholder="Search by name, phone or ID..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                            autoFocus onClick={e => e.stopPropagation()} />
                        </div>
                      </div>
                      <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                        {filteredCustomers.length === 0 ? (
                          <div className="px-3 py-4 text-center">
                            <p className="text-sm text-gray-400 mb-2">No customers found</p>
                            <button type="button" onClick={() => { setCustomerDropdownOpen(false); setAddCustomerOpen(true) }}
                              className="text-xs text-brand-600 font-medium hover:underline">+ Add new customer</button>
                          </div>
                        ) : filteredCustomers.map(c => (
                          <button key={c.id} type="button"
                            onClick={() => { setSelectedCustomer(c); setCustomerDropdownOpen(false); setCustomerSearch('') }}
                            className="w-full text-left px-3 py-2.5 hover:bg-brand-50 transition-colors flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">{c.name}</span>
                            <span className="text-xs text-gray-400">{c.customer_id} {c.phone ? `· ${c.phone}` : ''}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {selectedPresale?.sale_type === 'split_sale' && selectedCustomer && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-100" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pallet selection</p>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-5 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide gap-2">
                  <span className="col-span-1">Pallet type</span>
                  <span className="col-span-1">Available</span>
                  <span className="col-span-1">Pallets to sell</span>
                  <span className="col-span-1">Sell price/pc (₦)</span>
                  <span className="col-span-1">Line total</span>
                </div>
                {palletLines.map((line, idx) => {
                  const pallets = parseInt(line.pallets_to_sell) || 0
                  const price = parseFloat(line.selling_price_per_piece) || 0
                  const lineTotal = pallets * line.pallet_pieces * price
                  return (
                    <div key={idx} className="grid grid-cols-5 gap-2 px-3 py-2.5 border-t border-gray-50 items-center">
                      <span className="text-sm text-gray-700 col-span-1">{line.pallet_pieces.toLocaleString()} pcs/pallet</span>
                      <span className="text-sm text-gray-500 col-span-1">{line.available_pallets} pallets</span>
                      <input type="number" min="0" max={line.available_pallets}
                        value={line.pallets_to_sell}
                        onChange={e => setPalletLines(lines => lines.map((l, i) => i === idx ? { ...l, pallets_to_sell: e.target.value } : l))}
                        className="col-span-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="0" />
                      <input type="number" step="0.01"
                        value={line.selling_price_per_piece}
                        onChange={e => setPalletLines(lines => lines.map((l, i) => i === idx ? { ...l, selling_price_per_piece: e.target.value } : l))}
                        className="col-span-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="₦0" />
                      <span className="col-span-1 text-sm font-semibold text-brand-700">
                        {lineTotal > 0 ? fmt(lineTotal) : '—'}
                      </span>
                    </div>
                  )
                })}
                <div className="grid grid-cols-5 gap-2 px-3 py-2.5 border-t border-gray-200 bg-gray-50">
                  <span className="col-span-3 text-xs font-bold text-gray-500 uppercase">Total</span>
                  <span className="col-span-1 text-xs font-bold text-gray-700">
                    {palletLines.reduce((s, l) => s + (parseInt(l.pallets_to_sell) || 0) * l.pallet_pieces, 0).toLocaleString()} pcs
                  </span>
                  <span className="col-span-1 text-xs font-bold text-brand-700">{splitSaleAmount > 0 ? fmt(splitSaleAmount) : '—'}</span>
                </div>
              </div>
            </div>
          )}

          {selectedPresale && selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-100" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sale details</p>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {selectedPresale.sale_type === 'box_sale' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Sale amount (₦) <span className="text-red-400">*</span></label>
                    <input required type="number" step="0.01" value={saleAmount} onChange={e => setSaleAmount(e.target.value)}
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
                  <input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="₦0.00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Overages (₦)</label>
                  <input type="number" step="0.01" value={overages} onChange={e => setOverages(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="₦0.00" />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Payment summary</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Sale amount</span>
                  <span className="font-medium text-gray-900">{effectiveSaleAmount > 0 ? fmt(effectiveSaleAmount) : '—'}</span>
                </div>
                {parseFloat(discount) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Discount</span>
                    <span className="font-medium text-red-500">-{fmt(parseFloat(discount))}</span>
                  </div>
                )}
                {parseFloat(overages) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Overages</span>
                    <span className="font-medium text-green-600">+{fmt(parseFloat(overages))}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
                  <span className="font-semibold text-gray-700">Customer payable</span>
                  <span className="font-bold text-gray-900">{customerPayable > 0 ? fmt(customerPayable) : '—'}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount paid / deposit (₦)</label>
                <input type="number" step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="₦0.00" />
              </div>

              <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${outstandingBalance > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <span className="text-sm font-semibold text-gray-700">Outstanding balance</span>
                <span className={`text-lg font-bold ${outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(Math.max(outstandingBalance, 0))}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <Link href="/portal/sales/orders"
            className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors text-center">
            Cancel
          </Link>
          <button type="submit"
            disabled={saving || !selectedContainer || !selectedPresale || !selectedCustomer || effectiveSaleAmount <= 0}
            className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Recording…</> : 'Record sale'}
          </button>
        </div>
      </form>

      <Modal open={addCustomerOpen} onClose={() => setAddCustomerOpen(false)} title="Add new customer" size="sm">
        <form onSubmit={handleAddCustomer} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer name <span className="text-red-400">*</span></label>
            <input required value={newCustomer.name} onChange={e => setNewCustomer(c => ({ ...c, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Full name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input value={newCustomer.phone} onChange={e => setNewCustomer(c => ({ ...c, phone: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="+234 800 000 0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input value={newCustomer.address} onChange={e => setNewCustomer(c => ({ ...c, address: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Customer address" />
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
