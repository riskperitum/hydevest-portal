'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Eye, Trash2, Loader2, X, ChevronDown,
  Filter, Download, FileText, Package, AlertTriangle, CheckCircle2
} from 'lucide-react'
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
  status: string
  created_at: string
  container: { container_id: string; tracking_number: string | null } | null
  presale: { presale_id: string } | null
  customer: { name: string; customer_id: string } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

interface PalletLine {
  distribution_id: string
  pallet_pieces: number
  available_pallets: number
  pallets_to_sell: string
  selling_price_per_piece: string
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
  completed: 'bg-brand-50 text-brand-700',
}

export default function SalesOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Create order state
  const [step, setStep] = useState<'container' | 'details'>('container')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Container selection
  const [containers, setContainers] = useState<Container[]>([])
  const [containerSearch, setContainerSearch] = useState('')
  const [containerDropdownOpen, setContainerDropdownOpen] = useState(false)
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [selectedPresale, setSelectedPresale] = useState<Presale | null>(null)
  const [loadingPresale, setLoadingPresale] = useState(false)

  // Customer
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' })
  const [savingCustomer, setSavingCustomer] = useState(false)

  // Order details
  const [saleAmount, setSaleAmount] = useState('')
  const [discount, setDiscount] = useState('0')
  const [overages, setOverages] = useState('0')
  const [amountPaid, setAmountPaid] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // Split sale pallet lines
  const [palletLines, setPalletLines] = useState<PalletLine[]>([])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('sales_orders')
      .select(`*,
        container:containers(container_id, tracking_number),
        presale:presales(presale_id),
        customer:customers(name, customer_id),
        created_by_profile:profiles!sales_orders_created_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
    setLoading(false)
  }, [])

  const loadContainers = useCallback(async () => {
    const supabase = createClient()
    // Only containers that have a confirmed/draft presale
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

  useEffect(() => { load(); loadContainers(); loadCustomers() }, [load, loadContainers, loadCustomers])

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
    // Init pallet lines for split sale
    if (data?.sale_type === 'split_sale' && data.pallet_distributions) {
      setPalletLines(data.pallet_distributions.map((pd: PalletDistribution) => ({
        distribution_id: pd.id,
        pallet_pieces: pd.pallet_pieces,
        available_pallets: pd.number_of_pallets - pd.pallets_sold,
        pallets_to_sell: '',
        selling_price_per_piece: '',
      })))
    }
    setLoadingPresale(false)
  }

  // Auto-calculations
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

    if (!error && order) {
      // Insert pallet lines for split sale
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
          // Update pallets_sold on distribution
          await supabase.from('presale_pallet_distributions')
            .update({ pallets_sold: (await supabase.from('presale_pallet_distributions').select('pallets_sold').eq('id', line.distribution_id).single()).data?.pallets_sold + palletsSold })
            .eq('id', line.distribution_id)
        }
      }
    }

    setSaving(false)
    setModalOpen(false)
    resetForm()
    load()
  }

  function resetForm() {
    setStep('container')
    setSelectedContainer(null)
    setSelectedPresale(null)
    setSelectedCustomer(null)
    setContainerSearch('')
    setCustomerSearch('')
    setSaleAmount('')
    setDiscount('0')
    setOverages('0')
    setAmountPaid('0')
    setPaymentMethod('cash')
    setPalletLines([])
  }

  const filteredOrders = orders.filter(o => {
    const matchSearch = search === '' ||
      o.order_id.toLowerCase().includes(search.toLowerCase()) ||
      (o.container?.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.customer?.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || o.status === statusFilter
    const matchType = saleTypeFilter === '' || o.sale_type === saleTypeFilter
    const matchFrom = dateFrom === '' || new Date(o.created_at) >= new Date(dateFrom)
    const matchTo = dateTo === '' || new Date(o.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchType && matchFrom && matchTo
  })

  const activeFilters = [statusFilter, saleTypeFilter, dateFrom, dateTo].filter(Boolean).length
  const totalRevenue = filteredOrders.reduce((s, o) => s + Number(o.customer_payable), 0)
  const totalOutstanding = filteredOrders.reduce((s, o) => s + Number(o.outstanding_balance), 0)
  const totalCollected = filteredOrders.reduce((s, o) => s + Number(o.amount_paid), 0)

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
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Orders</h1>
          <p className="text-sm text-gray-400 mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''} recorded</p>
        </div>
        <button onClick={() => { resetForm(); setModalOpen(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Record sale</span>
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total orders', value: filteredOrders.length.toString(), color: 'text-brand-600' },
          { label: 'Total revenue (₦)', value: totalRevenue > 0 ? fmt(totalRevenue) : '—', color: 'text-green-600' },
          { label: 'Total collected (₦)', value: totalCollected > 0 ? fmt(totalCollected) : '—', color: 'text-blue-600' },
          { label: 'Outstanding (₦)', value: totalOutstanding > 0 ? fmt(totalOutstanding) : '—', color: totalOutstanding > 0 ? 'text-red-500' : 'text-gray-400' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-lg font-semibold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by order ID, tracking number or customer..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
                ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={15} /> Filters
              {activeFilters > 0 && <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>}
            </button>
            <button onClick={() => {
              const headers = ['Order ID', 'Sale Type', 'Container', 'Tracking No.', 'Customer', 'Sale Amount', 'Discount', 'Overages', 'Customer Payable', 'Amount Paid', 'Outstanding', 'Payment Method', 'Status', 'Date']
              const rows = filteredOrders.map(o => [o.order_id, o.sale_type, o.container?.container_id ?? '', o.container?.tracking_number ?? '', o.customer?.name ?? '', o.sale_amount, o.discount, o.overages, o.customer_payable, o.amount_paid, o.outstanding_balance, o.payment_method, o.status, new Date(o.created_at).toLocaleDateString()])
              const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sales-orders.csv'; a.click()
            }} className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <Download size={15} /> Export
            </button>
          </div>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sale type</label>
              <select value={saleTypeFilter} onChange={e => setSaleTypeFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All types</option>
                <option value="box_sale">Box sale</option>
                <option value="split_sale">Split sale</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Date from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Date to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {activeFilters > 0 && (
              <div className="col-span-2 md:col-span-4 flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">{filteredOrders.length} result{filteredOrders.length !== 1 ? 's' : ''}</p>
                <button onClick={() => { setStatusFilter(''); setSaleTypeFilter(''); setDateFrom(''); setDateTo('') }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Order ID', 'Sale Type', 'Tracking No.', 'Customer', 'Sale Amount', 'Discount', 'Overages', 'Payable', 'Paid', 'Outstanding', 'Method', 'Status', 'Date', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 14 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Package size={20} className="text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400">No sales orders yet. Record your first sale.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.map(order => (
                <tr key={order.id}
                  onClick={() => router.push(`/portal/sales/orders/${order.id}`)}
                  className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors cursor-pointer group">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{order.order_id}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${order.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {order.sale_type === 'box_sale' ? 'Box' : 'Split'}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{order.container?.tracking_number ?? '—'}</td>
                  <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap group-hover:text-brand-700">{order.customer?.name ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{fmt(order.sale_amount)}</td>
                  <td className="px-3 py-3 text-red-500 whitespace-nowrap">{order.discount > 0 ? `-${fmt(order.discount)}` : '—'}</td>
                  <td className="px-3 py-3 text-green-600 whitespace-nowrap">{order.overages > 0 ? `+${fmt(order.overages)}` : '—'}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(order.customer_payable)}</td>
                  <td className="px-3 py-3 text-green-600 whitespace-nowrap">{fmt(order.amount_paid)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={order.outstanding_balance > 0 ? 'text-red-500 font-medium' : 'text-green-600 font-medium'}>
                      {fmt(order.outstanding_balance)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap capitalize">{order.payment_method}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-400 whitespace-nowrap text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => router.push(`/portal/sales/orders/${order.id}`)}
                      className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filteredOrders.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-brand-100">
                  <td colSpan={4} className="px-3 py-3 text-xs font-bold text-gray-500 uppercase">Totals</td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">{fmt(filteredOrders.reduce((s, o) => s + Number(o.sale_amount), 0))}</td>
                  <td className="px-3 py-3 text-xs font-bold text-red-500 whitespace-nowrap">-{fmt(filteredOrders.reduce((s, o) => s + Number(o.discount), 0))}</td>
                  <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">+{fmt(filteredOrders.reduce((s, o) => s + Number(o.overages), 0))}</td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-900 whitespace-nowrap">{fmt(totalRevenue)}</td>
                  <td className="px-3 py-3 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(totalCollected)}</td>
                  <td className="px-3 py-3 text-xs font-bold text-red-500 whitespace-nowrap">{fmt(totalOutstanding)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Record sale modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Record sale</h2>
                <p className="text-xs text-gray-400 mt-0.5">Select container and customer, then fill in sale details</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="px-6 py-5 space-y-5 max-h-[78vh] overflow-y-auto">

                {/* Container selection */}
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

                  {/* Presale info */}
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

                {/* Customer selection */}
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

                {/* Split sale pallet selection */}
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

                {/* Sale details */}
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

                    {/* Summary */}
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

                    {/* Deposit */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount paid / deposit (₦)</label>
                      <input type="number" step="0.01" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="₦0.00" />
                    </div>

                    {/* Outstanding */}
                    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${outstandingBalance > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <span className="text-sm font-semibold text-gray-700">Outstanding balance</span>
                      <span className={`text-lg font-bold ${outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(Math.max(outstandingBalance, 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  disabled={saving || !selectedContainer || !selectedPresale || !selectedCustomer || effectiveSaleAmount <= 0}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Recording…</> : 'Record sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add customer modal */}
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
