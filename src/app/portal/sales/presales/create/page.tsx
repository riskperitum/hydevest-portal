'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Search, ChevronDown, Plus, X,
  AlertTriangle, CheckCircle2, Loader2
} from 'lucide-react'
import Link from 'next/link'

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

interface PalletRow {
  pallet_pieces: string
  number_of_pallets: string
}

export default function CreatePresalePage() {
  const router = useRouter()
  const [containers, setContainers] = useState<Container[]>([])
  const [saving, setSaving] = useState(false)
  const [containerSearch, setContainerSearch] = useState('')
  const [containerDropdownOpen, setContainerDropdownOpen] = useState(false)

  const [saleType, setSaleType] = useState<'box_sale' | 'split_sale'>('box_sale')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [warehouseAvgWeight, setWarehouseAvgWeight] = useState('')
  const [warehousePieces, setWarehousePieces] = useState('')
  const [supplierLoadedPieces, setSupplierLoadedPieces] = useState('')
  const [pricePerKilo, setPricePerKilo] = useState('')
  const [pricePerPiece, setPricePerPiece] = useState('')
  const [totalPallets, setTotalPallets] = useState('')
  const [palletRows, setPalletRows] = useState<PalletRow[]>([{ pallet_pieces: '', number_of_pallets: '' }])

  const expectedRevenue = pricePerPiece && warehousePieces
    ? parseFloat(pricePerPiece) * parseFloat(warehousePieces)
    : null

  // Pallet validation
  const palletPiecesTotal = palletRows.reduce((s, r) => {
    const p = parseInt(r.pallet_pieces) || 0
    const n = parseInt(r.number_of_pallets) || 0
    return s + p * n
  }, 0)
  const palletCountTotal = palletRows.reduce((s, r) => s + (parseInt(r.number_of_pallets) || 0), 0)
  const warehousePiecesNum = parseInt(warehousePieces) || 0
  const totalPalletsNum = parseInt(totalPallets) || 0

  const piecesTally = saleType === 'split_sale' && warehousePiecesNum > 0
    ? palletPiecesTotal === warehousePiecesNum
    : null
  const palletsTally = saleType === 'split_sale' && totalPalletsNum > 0
    ? palletCountTotal === totalPalletsNum
    : null

  const canSubmitSplit = saleType !== 'split_sale' || (
    palletRows.some(r => r.pallet_pieces && r.number_of_pallets) &&
    piecesTally === true &&
    palletsTally === true
  )

  useEffect(() => {
    const supabase = createClient()
    // First get all container IDs that already have a presale
    supabase.from('presales')
      .select('container_id')
      .then(({ data: existingPresales }) => {
        const presoldIds = new Set((existingPresales ?? []).map(p => p.container_id))
        // Only load containers from COMPLETED trips that have not been presold yet
        supabase.from('containers')
          .select(`
            id, container_id, tracking_number, container_number,
            pieces_purchased, average_weight, status, trip_id,
            trip:trips!containers_trip_id_fkey(title, source_location, trip_id, status)
          `)
          .order('created_at', { ascending: false })
          .then(({ data }) => {
            setContainers(
              ((data ?? []).filter(c =>
                !presoldIds.has(c.id) &&
                (c.trip as any)?.status === 'completed'
              )) as any
            )
          })
      })
  }, [])

  const filteredContainers = containers.filter(c =>
    containerSearch === '' ||
    (c.tracking_number ?? '').toLowerCase().includes(containerSearch.toLowerCase()) ||
    (c.container_id ?? '').toLowerCase().includes(containerSearch.toLowerCase())
  )

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedContainer || !canSubmitSplit) return
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
      price_per_piece: pricePerPiece ? parseFloat(pricePerPiece) : null,
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
    router.push('/portal/sales/presales')
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/sales/presales"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Create presale</h1>
          <p className="text-sm text-gray-400 mt-0.5">Select a container and fill in presale details</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="space-y-5">

        {/* Sale type */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Pre-sale option <span className="text-red-400">*</span></h2>
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Container <span className="text-red-400">*</span></h2>
          <div className="relative">
            <button type="button"
              onClick={() => setContainerDropdownOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white transition-colors">
              <span className={selectedContainer ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                {selectedContainer
                  ? `${selectedContainer.tracking_number ?? selectedContainer.container_id}`
                  : 'Search and select a container...'}
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
                        placeholder="Search by tracking number..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                        autoFocus onClick={e => e.stopPropagation()} />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
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

          {/* Container info */}
          {selectedContainer && (
            <div className="mt-4 bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Container information</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Container ID', value: selectedContainer.container_id },
                  { label: 'Tracking No.', value: selectedContainer.tracking_number ?? '—' },
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
        </div>

        {/* Presale details */}
        {selectedContainer && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Presale details</h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">W/H avg weight (kg)</label>
                <input type="number" step="0.01" value={warehouseAvgWeight}
                  onChange={e => {
                    const weight = e.target.value
                    setWarehouseAvgWeight(weight)
                    if (weight && pricePerKilo) {
                      const piece = parseFloat(weight) * parseFloat(pricePerKilo)
                      if (!isNaN(piece)) setPricePerPiece(piece.toFixed(4))
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">W/H confirmed pieces</label>
                <input type="number" value={warehousePieces}
                  onChange={e => setWarehousePieces(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Supplier loaded pieces</label>
                <input type="number" value={supplierLoadedPieces}
                  onChange={e => setSupplierLoadedPieces(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Price per kilo (₦)</label>
                <input value={pricePerKilo}
                  onChange={e => {
                    const kilo = e.target.value
                    setPricePerKilo(kilo)
                    if (kilo && warehouseAvgWeight) {
                      const piece = parseFloat(kilo) * parseFloat(warehouseAvgWeight)
                      if (!isNaN(piece)) setPricePerPiece(piece.toFixed(4))
                    }
                  }}
                  type="number" step="0.01" min="0"
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Price per piece (₦)</label>
                <input value={pricePerPiece}
                  onChange={e => {
                    const piece = e.target.value
                    setPricePerPiece(piece)
                    if (piece && warehouseAvgWeight && parseFloat(warehouseAvgWeight) > 0) {
                      const kilo = parseFloat(piece) / parseFloat(warehouseAvgWeight)
                      if (!isNaN(kilo)) setPricePerKilo(kilo.toFixed(4))
                    }
                  }}
                  type="number" step="0.0001" min="0"
                  placeholder="0.0000"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Expected sale revenue (₦)</label>
                <div className={`px-3 py-2 text-sm rounded-lg border ${expectedRevenue ? 'bg-green-50 border-green-200 text-green-700 font-semibold' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                  {expectedRevenue
                    ? `₦${expectedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pallet distribution — split sale only */}
        {selectedContainer && saleType === 'split_sale' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Pallet distribution</h2>
              <button type="button"
                onClick={() => setPalletRows(rows => [...rows, { pallet_pieces: '', number_of_pallets: '' }])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
                <Plus size={13} /> Add distribution
              </button>
            </div>

            <div className="w-40">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Total number of pallets</label>
              <input type="number" value={totalPallets}
                onChange={e => setTotalPallets(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="0" />
            </div>

            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-4 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <span>Pallet pieces</span>
                <span>No. of pallets</span>
                <span>Subtotal pieces</span>
                <span></span>
              </div>
              {palletRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 px-3 py-2.5 border-t border-gray-50 items-center">
                  <input type="number" value={row.pallet_pieces}
                    onChange={e => setPalletRows(rows => rows.map((r, i) => i === idx ? { ...r, pallet_pieces: e.target.value } : r))}
                    className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="0" />
                  <input type="number" value={row.number_of_pallets}
                    onChange={e => setPalletRows(rows => rows.map((r, i) => i === idx ? { ...r, number_of_pallets: e.target.value } : r))}
                    className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="0" />
                  <span className="text-sm font-medium text-gray-700">
                    {row.pallet_pieces && row.number_of_pallets
                      ? (parseInt(row.pallet_pieces) * parseInt(row.number_of_pallets)).toLocaleString()
                      : '—'}
                  </span>
                  {palletRows.length > 1 ? (
                    <button type="button"
                      onClick={() => setPalletRows(rows => rows.filter((_, i) => i !== idx))}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors justify-self-start">
                      <X size={14} />
                    </button>
                  ) : <span />}
                </div>
              ))}
              <div className="grid grid-cols-4 gap-2 px-3 py-2.5 border-t border-gray-200 bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 col-span-1">Totals</span>
                <span className="text-xs font-semibold text-gray-700">{palletCountTotal} pallets</span>
                <span className="text-xs font-semibold text-gray-700">{palletPiecesTotal.toLocaleString()} pcs</span>
                <span />
              </div>
            </div>

            {/* Separate validation indicators */}
            <div className="space-y-2">
              {/* Pieces tally */}
              {warehousePiecesNum > 0 && palletPiecesTotal > 0 && (
                piecesTally ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 font-medium">
                      Pieces tally ✓ — {palletPiecesTotal.toLocaleString()} pcs matches W/H confirmed pieces
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">
                      Pallet pieces ({palletPiecesTotal.toLocaleString()}) doesn't tally with W/H confirmed pieces ({warehousePiecesNum.toLocaleString()})
                    </p>
                  </div>
                )
              )}

              {/* Pallets tally */}
              {totalPalletsNum > 0 && palletCountTotal > 0 && (
                palletsTally ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 font-medium">
                      Pallets tally ✓ — {palletCountTotal} pallets matches total number of pallets
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">
                      Number of pallets ({palletCountTotal}) doesn't tally with total number of pallets ({totalPalletsNum})
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Submit */}
        {selectedContainer && (
          <div className="flex gap-3 pb-8">
            <Link href="/portal/sales/presales"
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors text-center">
              Cancel
            </Link>
            <button type="submit"
              disabled={saving || !selectedContainer || !canSubmitSplit}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create presale'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

