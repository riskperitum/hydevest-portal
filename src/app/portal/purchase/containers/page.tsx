'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, Download, Filter, Eye, ChevronDown } from 'lucide-react'

interface Container {
  id: string
  container_id: string
  trip_id: string
  container_number: string | null
  tracking_number: string | null
  status: string
  approval_status: string
  pieces_purchased: number | null
  average_weight: number | null
  max_weight: number | null
  unit_price_usd: number | null
  shipping_amount_usd: number | null
  quoted_price_usd: number | null
  surcharge_ngn: number | null
  estimated_landing_cost: number | null
  hide_type: string | null
  funding_type: string
  created_at: string
  trip: { trip_id: string; title: string; status: string } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

const CONTAINER_STATUS = [
  { value: 'ordered',    label: 'Ordered',    color: 'bg-gray-100 text-gray-600' },
  { value: 'in_transit', label: 'In transit', color: 'bg-blue-50 text-blue-700' },
  { value: 'arrived',    label: 'Arrived',    color: 'bg-green-50 text-green-700' },
  { value: 'cleared',    label: 'Cleared',    color: 'bg-brand-50 text-brand-700' },
]

const HIDE_TYPE_LABELS: Record<string, string> = {
  dried: 'Dried',
  wet_salted: 'Wet salted',
}

export default function ContainersPage() {
  const router = useRouter()
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [hideTypeFilter, setHideTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('containers')
      .select(`
        *,
        trip:trips(trip_id, title, status),
        created_by_profile:profiles!containers_created_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })
    setContainers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtUSD = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const statusInfo = (s: string) => CONTAINER_STATUS.find(o => o.value === s) ?? CONTAINER_STATUS[0]

  const filtered = containers.filter(c => {
    const matchSearch = search === '' ||
      (c.container_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.container_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.trip?.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.trip?.trip_id ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || c.status === statusFilter
    const matchHideType = hideTypeFilter === '' || c.hide_type === hideTypeFilter
    const matchDateFrom = dateFrom === '' || new Date(c.created_at) >= new Date(dateFrom)
    const matchDateTo = dateTo === '' || new Date(c.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchHideType && matchDateFrom && matchDateTo
  })

  function exportCSV() {
    const headers = [
      'Container ID', 'Title', 'Tracking No.', 'Trip ID', 'Trip Title',
      'Status', 'Hide Type', 'Funding', 'Pieces', 'Avg Weight', 'Unit Price ($)',
      'Shipping ($)', 'Landing Cost (₦)', 'Created', 'Created By'
    ]
    const rows = filtered.map(c => [
      c.container_id, c.container_number ?? '', c.tracking_number ?? '',
      c.trip?.trip_id ?? '', c.trip?.title ?? '',
      c.status, c.hide_type ?? '', c.funding_type,
      c.pieces_purchased ?? '', c.average_weight ?? '',
      c.unit_price_usd ?? '', c.shipping_amount_usd ?? '',
      c.estimated_landing_cost ?? '',
      new Date(c.created_at).toLocaleDateString(),
      c.created_by_profile?.full_name ?? c.created_by_profile?.email ?? ''
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'containers.csv'; a.click()
  }

  // Summary stats
  const totalLanding = filtered.reduce((s, c) => s + Number(c.estimated_landing_cost ?? 0), 0)
  const totalPieces = filtered.reduce((s, c) => s + Number(c.pieces_purchased ?? 0), 0)
  const totalUSD = filtered.reduce((s, c) => {
    const pa = (c.unit_price_usd && c.pieces_purchased) ? Number(c.unit_price_usd) * Number(c.pieces_purchased) : 0
    return s + pa + Number(c.shipping_amount_usd ?? 0)
  }, 0)

  const activeFilters = [statusFilter, hideTypeFilter, dateFrom, dateTo].filter(Boolean).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Containers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} container{filtered.length !== 1 ? 's' : ''} across all trips</p>
        </div>
        <button onClick={exportCSV}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
          <Download size={15} /> Export
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Total containers</p>
          <p className="text-2xl font-semibold text-gray-900">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Total pieces</p>
          <p className="text-2xl font-semibold text-gray-900">{totalPieces.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-400 mb-1">Total landing cost (₦)</p>
          <p className="text-2xl font-semibold text-brand-600">{totalLanding > 0 ? fmt(totalLanding) : '—'}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by container ID, title, tracking number or trip..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Filter size={15} />
            Filters
            {activeFilters > 0 && (
              <span className="bg-brand-600 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">{activeFilters}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All statuses</option>
                {CONTAINER_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hide type</label>
              <select value={hideTypeFilter} onChange={e => setHideTypeFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All types</option>
                <option value="dried">Dried</option>
                <option value="wet_salted">Wet salted</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {activeFilters > 0 && (
              <div className="col-span-2 md:col-span-4 flex justify-end">
                <button
                  onClick={() => { setStatusFilter(''); setHideTypeFilter(''); setDateFrom(''); setDateTo('') }}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors">
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[
                  'Container ID', 'Trip', 'Title', 'Tracking No.',
                  'Status', 'Hide Type', 'Funding',
                  'Pieces', 'Avg Weight', 'Unit Price ($)',
                  'Purchase Subtotal ($)', 'Landing Cost (₦)',
                  'Created', 'Created By', ''
                ].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 15 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-16 text-center text-sm text-gray-400">
                    No containers found.
                  </td>
                </tr>
              ) : filtered.map(con => {
                const purchaseAmt = (con.unit_price_usd && con.pieces_purchased)
                  ? Number(con.unit_price_usd) * Number(con.pieces_purchased) : 0
                const purchaseSubtotal = purchaseAmt + Number(con.shipping_amount_usd ?? 0)
                return (
                  <tr key={con.id}
                    onClick={() => router.push(`/portal/purchase/trips/${con.trip_id}/containers/${con.id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors cursor-pointer group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded font-medium">
                        {con.container_id}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div>
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {con.trip?.trip_id ?? '—'}
                        </span>
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[100px]">{con.trip?.title ?? '—'}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900 group-hover:text-brand-700 transition-colors whitespace-nowrap">
                      {con.container_number ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{con.tracking_number ?? '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo(con.status).color}`}>
                        {statusInfo(con.status).label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {con.hide_type ? HIDE_TYPE_LABELS[con.hide_type] ?? con.hide_type : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${con.funding_type === 'partner' ? 'bg-brand-50 text-brand-700' : 'bg-blue-50 text-blue-700'}`}>
                        {con.funding_type === 'partner' ? 'Partner' : 'Entity'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-600 text-center">{con.pieces_purchased?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{con.average_weight ? `${con.average_weight} kg` : '—'}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{con.unit_price_usd ? fmtUSD(con.unit_price_usd) : '—'}</td>
                    <td className="px-3 py-3 font-semibold text-brand-700 whitespace-nowrap">
                      {purchaseSubtotal > 0 ? fmtUSD(purchaseSubtotal) : '—'}
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {con.estimated_landing_cost ? fmt(con.estimated_landing_cost) : '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(con.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                      {con.created_by_profile?.full_name ?? con.created_by_profile?.email ?? '—'}
                    </td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => router.push(`/portal/purchase/trips/${con.trip_id}/containers/${con.id}`)}
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={7} className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Totals ({filtered.length} containers)
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold text-gray-700 text-center">
                    {totalPieces.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-400">—</td>
                  <td className="px-3 py-3 text-xs text-gray-400">—</td>
                  <td className="px-3 py-3 text-xs font-semibold text-brand-700 whitespace-nowrap">
                    {fmtUSD(totalUSD)}
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold text-gray-900 whitespace-nowrap">
                    {totalLanding > 0 ? fmt(totalLanding) : '—'}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
