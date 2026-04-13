'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Eye, Trash2, Loader2, X, ChevronDown,
  Package, AlertTriangle, CheckCircle2, Download, Filter
} from 'lucide-react'

interface Container {
  id: string
  container_id: string
  tracking_number: string | null
  container_number: string | null
  pieces_purchased: number | null
  average_weight: number | null
  status: string
  trip_id: string
  trip: { title: string; source_location: string | null; trip_id: string } | null
}

interface Presale {
  id: string
  presale_id: string
  sale_type: string
  status: string
  created_at: string
  warehouse_confirmed_pieces: number | null
  warehouse_confirmed_avg_weight: number | null
  price_per_kilo: number | null
  price_per_piece: number | null
  expected_sale_revenue: number | null
  total_number_of_pallets: number | null
  container: {
    container_id: string
    tracking_number: string | null
    container_number: string | null
  } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

interface PalletRow {
  pallet_pieces: string
  number_of_pallets: string
}

const blankPallet: PalletRow = { pallet_pieces: '', number_of_pallets: '' }

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
}

export default function PresalesPage() {
  const router = useRouter()
  const [presales, setPresales] = useState<Presale[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [containerSearch, setContainerSearch] = useState('')
  const [containerDropdownOpen, setContainerDropdownOpen] = useState(false)

  // Form state
  const [saleType, setSaleType] = useState<'box_sale' | 'split_sale'>('box_sale')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [warehouseAvgWeight, setWarehouseAvgWeight] = useState('')
  const [warehousePieces, setWarehousePieces] = useState('')
  const [supplierLoadedPieces, setSupplierLoadedPieces] = useState('')
  const [pricePerKilo, setPricePerKilo] = useState('')
  const [totalPallets, setTotalPallets] = useState('')
  const [palletRows, setPalletRows] = useState<PalletRow[]>([{ ...blankPallet }])
  const [palletWarning, setPalletWarning] = useState<string | null>(null)

  // Auto-calculated
  const pricePerPiece = warehouseAvgWeight && pricePerKilo
    ? parseFloat(warehouseAvgWeight) * parseFloat(pricePerKilo)
    : null
  const expectedRevenue = pricePerPiece && warehousePieces
    ? pricePerPiece * parseFloat(warehousePieces)
    : null

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: ps }, { data: con }] = await Promise.all([
      supabase.from('presales')
        .select(`*, container:containers(container_id, tracking_number, container_number), created_by_profile:profiles!presales_created_by_fkey(full_name, email)`)
        .order('created_at', { ascending: false }),
      supabase.from('containers')
        .select(`*, trip:trips(title, source_location, trip_id)`)
        .order('created_at', { ascending: false }),
    ])
    setPresales(ps ?? [])
    setContainers(con ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setSaleType('box_sale')
    setSelectedContainer(null)
    setContainerSearch('')
    setWarehouseAvgWeight('')
    setWarehousePieces('')
    setSupplierLoadedPieces('')
    setPricePerKilo('')
    setTotalPallets('')
    setPalletRows([{ ...blankPallet }])
    setPalletWarning(null)
  }

  function validatePallets(): string | null {
    if (saleType !== 'split_sale') return null
    if (palletRows.length === 0) return 'Add at least one pallet distribution row.'

    const totalPalletCount = palletRows.reduce((s, r) => s + (parseInt(r.number_of_pallets) || 0), 0)
    const totalPalletPieces = palletRows.reduce((s, r) => {
      const pieces = parseInt(r.pallet_pieces) || 0
      const pallets = parseInt(r.number_of_pallets) || 0
      return s + (pieces * pallets)
    }, 0)
    const warehousePiecesNum = parseInt(warehousePieces) || 0
    const totalPalletsNum = parseInt(totalPallets) || 0

    if (totalPalletPieces !== warehousePiecesNum) {
      return `Pallet pieces (${totalPalletPieces.toLocaleString()}) doesn't tally with warehouse confirmed pieces (${warehousePiecesNum.toLocaleString()})`
    }
    if (totalPalletCount !== totalPalletsNum) {
      return `Number of pallets (${totalPalletCount}) doesn't tally with total number of pallets (${totalPalletsNum})`
    }
    return null
  }

  useEffect(() => {
    if (saleType === 'split_sale') {
      setPalletWarning(validatePallets())
    } else {
      setPalletWarning(null)
    }
  }, [palletRows, warehousePieces, totalPallets, saleType])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedContainer) return

    if (saleType === 'split_sale') {
      const warning = validatePallets()
      if (warning) { setPalletWarning(warning); return }
    }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: presale, error } = await supabase.from('presales').insert({
      sale_type: saleType,
      container_id: selectedContainer.id,
      trip_id: selectedContainer.trip_id,
      warehouse_confirmed_avg_weight: warehouseAvgWeight ? parseFloat(warehouseAvgWeight) : null,
      warehouse_confirmed_pieces: warehousePieces ? parseInt(warehousePieces) : null,
      supplier_loaded_pieces: supplierLoadedPieces ? parseInt(supplierLoadedPieces) : null,
      price_per_kilo: pricePerKilo ? parseFloat(pricePerKilo) : null,
      price_per_piece: pricePerPiece,
      expected_sale_revenue: expectedRevenue,
      total_number_of_pallets: saleType === 'split_sale' && totalPallets ? parseInt(totalPallets) : null,
      created_by: user?.id,
    }).select().single()

    if (!error && presale && saleType === 'split_sale') {
      await supabase.from('presale_pallet_distributions').insert(
        palletRows
          .filter(r => r.pallet_pieces && r.number_of_pallets)
          .map(r => ({
            presale_id: presale.id,
            pallet_pieces: parseInt(r.pallet_pieces),
            number_of_pallets: parseInt(r.number_of_pallets),
          }))
      )
    }

    setSaving(false)
    setModalOpen(false)
    resetForm()
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this presale? This cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('presales').delete().eq('id', id)
    load()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filteredContainers = containers.filter(c =>
    containerSearch === '' ||
    (c.tracking_number ?? '').toLowerCase().includes(containerSearch.toLowerCase()) ||
    (c.container_id ?? '').toLowerCase().includes(containerSearch.toLowerCase())
  )

  const filteredPresales = presales.filter(p =>
    search === '' ||
    p.presale_id.toLowerCase().includes(search.toLowerCase()) ||
    (p.container?.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.container?.container_id ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalRevenue = filteredPresales.reduce((s, p) => s + Number(p.expected_sale_revenue ?? 0), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pre-sales</h1>
          <p className="text-sm text-gray-400 mt-0.5">{presales.length} presale{presales.length !== 1 ? 's' : ''} created</p>
        </div>
        <button onClick={() => { resetForm(); setModalOpen(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Create presale</span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total presales', value: presales.length.toString(), color: 'text-brand-600' },
          { label: 'Box sales', value: presales.filter(p => p.sale_type === 'box_sale').length.toString(), color: 'text-blue-600' },
          { label: 'Split sales', value: presales.filter(p => p.sale_type === 'split_sale').length.toString(), color: 'text-purple-600' },
          { label: 'Expected revenue', value: totalRevenue > 0 ? fmt(totalRevenue) : '—', color: 'text-green-600' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-xl font-semibold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by presale ID or tracking number..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Presale ID', 'Sale type', 'Container', 'Tracking No.', 'W/H Pieces', 'W/H Avg Weight', 'Price/Kilo', 'Price/Piece', 'Expected Revenue', 'Status', 'Created by', 'Date', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 13 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredPresales.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Package size={20} className="text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400">No presales yet. Create your first presale.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredPresales.map(ps => (
                <tr key={ps.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{ps.presale_id}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ps.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {ps.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{ps.container?.container_id ?? '—'}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">{ps.container?.tracking_number ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ps.warehouse_confirmed_pieces?.toLocaleString() ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ps.warehouse_confirmed_avg_weight ? `${ps.warehouse_confirmed_avg_weight} kg` : '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ps.price_per_kilo ? fmt(ps.price_per_kilo) : '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ps.price_per_piece ? fmt(ps.price_per_piece) : '—'}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{ps.expected_sale_revenue ? fmt(ps.expected_sale_revenue) : '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[ps.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ps.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap text-xs">{ps.created_by_profile?.full_name ?? ps.created_by_profile?.email ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-400 whitespace-nowrap text-xs">{new Date(ps.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => router.push(`/portal/sales/presales/${ps.id}`)}
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(ps.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create presale modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
            
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Create presale</h2>
                <p className="text-xs text-gray-400 mt-0.5">Select a container and fill in presale details</p>
              </div>
              <button onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">

                {/* Sale type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pre-sale option <span className="text-red-400">*</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'box_sale', label: 'Box sale', desc: 'Sell by the box' },
                      { value: 'split_sale', label: 'Split sale', desc: 'Sell by pallet distribution' },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setSaleType(opt.value as 'box_sale' | 'split_sale')}
                        className={`px-4 py-3 rounded-xl border-2 text-left transition-all
                          ${saleType === opt.value ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <p className={`text-sm font-semibold ${saleType === opt.value ? 'text-brand-700' : 'text-gray-700'}`}>{opt.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Container selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Container <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <button type="button"
                      onClick={() => setContainerDropdownOpen(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white transition-colors">
                      <span className={selectedContainer ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                        {selectedContainer ? `${selectedContainer.tracking_number ?? selectedContainer.container_id}` : 'Search and select container...'}
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
                              <input
                                value={containerSearch}
                                onChange={e => setContainerSearch(e.target.value)}
                                placeholder="Search by tracking number..."
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                autoFocus
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredContainers.length === 0 ? (
                              <p className="px-3 py-4 text-sm text-gray-400 text-center">No containers found</p>
                            ) : filteredContainers.map(c => (
                              <button key={c.id} type="button"
                                onClick={() => { setSelectedContainer(c); setContainerDropdownOpen(false); setContainerSearch('') }}
                                className="w-full text-left px-3 py-2.5 hover:bg-brand-50 transition-colors flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{c.tracking_number ?? c.container_id}</p>
                                  <p className="text-xs text-gray-400">{c.container_number ?? ''} · {c.trip?.trip_id} — {c.trip?.title}</p>
                                </div>
                                <span className="text-xs text-gray-400 shrink-0">{c.pieces_purchased?.toLocaleString()} pcs</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Container info card */}
                {selectedContainer && (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Container information</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Container ID', value: selectedContainer.container_id },
                        { label: 'Tracking number', value: selectedContainer.tracking_number ?? '—' },
                        { label: 'Title', value: selectedContainer.container_number ?? '—' },
                        { label: 'Pieces', value: selectedContainer.pieces_purchased?.toLocaleString() ?? '—' },
                        { label: 'Avg weight', value: selectedContainer.average_weight ? `${selectedContainer.average_weight} kg` : '—' },
                        { label: 'Status', value: selectedContainer.status },
                        { label: 'Trip location', value: selectedContainer.trip?.source_location ?? '—' },
                        { label: 'Trip', value: selectedContainer.trip?.trip_id ?? '—' },
                      ].map(item => (
                        <div key={item.label}>
                          <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                          <p className="text-sm font-medium text-gray-900">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Presale details */}
                {selectedContainer && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-gray-100" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Presale details</p>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Warehouse confirmed avg weight (kg)</label>
                        <input type="number" step="0.01" value={warehouseAvgWeight}
                          onChange={e => setWarehouseAvgWeight(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="0.00" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Warehouse confirmed pieces</label>
                        <input type="number" value={warehousePieces}
                          onChange={e => setWarehousePieces(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Supplier loaded pieces</label>
                        <input type="number" value={supplierLoadedPieces}
                          onChange={e => setSupplierLoadedPieces(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Price per kilo (₦)</label>
                        <input type="number" step="0.01" value={pricePerKilo}
                          onChange={e => setPricePerKilo(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder="₦0.00" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Price per piece (₦) — auto</label>
                        <div className={`px-3 py-2 text-sm rounded-lg border ${pricePerPiece ? 'bg-brand-50 border-brand-200 text-brand-700 font-semibold' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                          {pricePerPiece ? `₦${pricePerPiece.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Auto-calculated'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Expected sale revenue (₦) — auto</label>
                        <div className={`px-3 py-2 text-sm rounded-lg border ${expectedRevenue ? 'bg-green-50 border-green-200 text-green-700 font-semibold' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                          {expectedRevenue ? `₦${expectedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Auto-calculated'}
                        </div>
                      </div>
                    </div>

                    {/* Split sale — pallet distribution */}
                    {saleType === 'split_sale' && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-gray-100" />
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pallet distribution</p>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="w-40">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Total number of pallets</label>
                            <input type="number" value={totalPallets}
                              onChange={e => setTotalPallets(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                              placeholder="0" />
                          </div>
                          <button type="button"
                            onClick={() => setPalletRows(rows => [...rows, { ...blankPallet }])}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors mt-4">
                            <Plus size={13} /> Add distribution
                          </button>
                        </div>

                        {palletRows.length > 0 && (
                          <div className="rounded-xl border border-gray-100 overflow-hidden">
                            <div className="grid grid-cols-3 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                              <span>Pallet pieces</span>
                              <span>Number of pallets</span>
                              <span>Subtotal pieces</span>
                            </div>
                            {palletRows.map((row, idx) => (
                              <div key={idx} className="grid grid-cols-3 gap-2 px-3 py-2 border-t border-gray-50 items-center">
                                <input type="number" value={row.pallet_pieces}
                                  onChange={e => setPalletRows(rows => rows.map((r, i) => i === idx ? { ...r, pallet_pieces: e.target.value } : r))}
                                  className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  placeholder="0" />
                                <div className="flex items-center gap-2">
                                  <input type="number" value={row.number_of_pallets}
                                    onChange={e => setPalletRows(rows => rows.map((r, i) => i === idx ? { ...r, number_of_pallets: e.target.value } : r))}
                                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                    placeholder="0" />
                                  {palletRows.length > 1 && (
                                    <button type="button"
                                      onClick={() => setPalletRows(rows => rows.filter((_, i) => i !== idx))}
                                      className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                                <span className="text-sm font-medium text-gray-700">
                                  {row.pallet_pieces && row.number_of_pallets
                                    ? (parseInt(row.pallet_pieces) * parseInt(row.number_of_pallets)).toLocaleString()
                                    : '—'}
                                </span>
                              </div>
                            ))}
                            <div className="grid grid-cols-3 gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50">
                              <span className="text-xs font-semibold text-gray-500">Total</span>
                              <span className="text-xs font-semibold text-gray-700">
                                {palletRows.reduce((s, r) => s + (parseInt(r.number_of_pallets) || 0), 0)} pallets
                              </span>
                              <span className="text-xs font-semibold text-gray-700">
                                {palletRows.reduce((s, r) => {
                                  const p = parseInt(r.pallet_pieces) || 0
                                  const n = parseInt(r.number_of_pallets) || 0
                                  return s + p * n
                                }, 0).toLocaleString()} pcs
                              </span>
                            </div>
                          </div>
                        )}

                        {palletWarning && (
                          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 font-medium">{palletWarning}</p>
                          </div>
                        )}

                        {!palletWarning && warehousePieces && totalPallets && palletRows.some(r => r.pallet_pieces && r.number_of_pallets) && (
                          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                            <CheckCircle2 size={15} className="text-green-600 shrink-0" />
                            <p className="text-xs text-green-700 font-medium">Pallet distribution tallies correctly</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving || !selectedContainer || (saleType === 'split_sale' && !!palletWarning)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create presale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

