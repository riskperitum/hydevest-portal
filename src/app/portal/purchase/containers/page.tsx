'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, Download, Filter, Eye, FileText, Loader2, Package, TrendingUp, Layers, Tag, DollarSign } from 'lucide-react'

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
  { value: 'ordered',      label: 'Ordered',      color: 'bg-gray-100 text-gray-600' },
  { value: 'in_transit',   label: 'In transit',   color: 'bg-blue-50 text-blue-700' },
  { value: 'arrived',      label: 'Arrived',      color: 'bg-green-50 text-green-700' },
  { value: 'cleared',      label: 'Cleared',      color: 'bg-brand-50 text-brand-700' },
  { value: 'not_started',  label: 'Not started',  color: 'bg-gray-100 text-gray-500' },
  { value: 'in_progress',  label: 'In progress',  color: 'bg-blue-50 text-blue-700' },
  { value: 'completed',    label: 'Completed',    color: 'bg-green-50 text-green-700' },
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
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')
  const [generatingReport, setGeneratingReport] = useState(false)

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
  const statusInfo = (s: string) =>
    CONTAINER_STATUS.find(o => o.value === s)
    ?? CONTAINER_STATUS.find(o => o.value === 'not_started')
    ?? CONTAINER_STATUS[0]

  const filtered = containers.filter(c => {
    const matchSearch = search === '' ||
      (c.container_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.container_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.trip?.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.trip?.trip_id ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || (c.trip?.status ?? '') === statusFilter
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

  async function generateReport(type: 'filtered' | 'full') {
    setGeneratingReport(true)
    const data = type === 'filtered' ? filtered : containers

    const rows = data.map(c => {
      const purchaseAmt = (c.unit_price_usd && c.pieces_purchased)
        ? Number(c.unit_price_usd) * Number(c.pieces_purchased) : 0
      const purchaseSubtotal = purchaseAmt + Number(c.shipping_amount_usd ?? 0)
      return {
        id: c.container_id,
        title: c.container_number ?? '—',
        tracking: c.tracking_number ?? '—',
        trip: `${c.trip?.trip_id ?? ''} — ${c.trip?.title ?? ''}`,
        status: c.status,
        hideType: c.hide_type ? HIDE_TYPE_LABELS[c.hide_type] : '—',
        funding: c.funding_type,
        pieces: c.pieces_purchased?.toLocaleString() ?? '—',
        avgWeight: c.average_weight ? `${c.average_weight} kg` : '—',
        unitPrice: c.unit_price_usd ? `$${Number(c.unit_price_usd).toFixed(2)}` : '—',
        purchaseSubtotal: purchaseSubtotal > 0 ? `$${purchaseSubtotal.toFixed(2)}` : '—',
        landingCost: c.estimated_landing_cost ? `₦${Number(c.estimated_landing_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—',
        created: new Date(c.created_at).toLocaleDateString(),
        createdBy: c.created_by_profile?.full_name ?? c.created_by_profile?.email ?? '—',
      }
    })

    const totalLandingReport = data.reduce((s, c) => s + Number(c.estimated_landing_cost ?? 0), 0)
    const totalPiecesReport = data.reduce((s, c) => s + Number(c.pieces_purchased ?? 0), 0)
    const totalSubtotalReport = data.reduce((s, c) => {
      const pa = (c.unit_price_usd && c.pieces_purchased) ? Number(c.unit_price_usd) * Number(c.pieces_purchased) : 0
      return s + pa + Number(c.shipping_amount_usd ?? 0)
    }, 0)

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Containers Report — Hydevest</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #fff; }
    .header { background: #55249E; color: white; padding: 32px 40px; }
    .header h1 { font-size: 24px; font-weight: 700; }
    .header p { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .meta { display: flex; gap: 32px; margin-top: 16px; }
    .meta-item { font-size: 12px; opacity: 0.9; }
    .meta-item span { font-weight: 600; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 24px 40px; background: #f8f7ff; border-bottom: 1px solid #e8e0ff; }
    .summary-card { background: white; border-radius: 8px; padding: 16px; border: 1px solid #ede9f7; }
    .summary-card .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .summary-card .value { font-size: 20px; font-weight: 700; color: #55249E; }
    .content { padding: 24px 40px; }
    .section-title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #55249E; color: white; }
    thead th { padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
    tbody tr { border-bottom: 1px solid #f0ebff; }
    tbody tr:nth-child(even) { background: #faf8ff; }
    tbody tr:hover { background: #f3eeff; }
    tbody td { padding: 9px 12px; color: #374151; white-space: nowrap; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 600; }
    .badge-ordered { background: #f3f4f6; color: #4b5563; }
    .badge-in_transit { background: #eff6ff; color: #1d4ed8; }
    .badge-arrived { background: #f0fdf4; color: #15803d; }
    .badge-cleared { background: #f3eeff; color: #55249E; }
    .badge-entity { background: #eff6ff; color: #1d4ed8; }
    .badge-partner { background: #f3eeff; color: #55249E; }
    tfoot tr { background: #f3eeff; font-weight: 700; border-top: 2px solid #55249E; }
    tfoot td { padding: 10px 12px; font-size: 12px; color: #55249E; }
    .footer { padding: 20px 40px; border-top: 1px solid #ede9f7; text-align: center; font-size: 11px; color: #9ca3af; margin-top: 24px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Containers Report</h1>
    <p>Hydevest Portal — ${type === 'filtered' ? 'Filtered View' : 'Full Report'}</p>
    <div class="meta">
      <div class="meta-item">Generated: <span>${new Date().toLocaleString()}</span></div>
      <div class="meta-item">Total containers: <span>${data.length}</span></div>
      ${type === 'filtered' && activeFilters > 0 ? `<div class="meta-item">Filters applied: <span>${activeFilters}</span></div>` : ''}
    </div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Total containers</div>
      <div class="value">${data.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total pieces</div>
      <div class="value">${totalPiecesReport.toLocaleString()}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total purchase subtotal</div>
      <div class="value">$${totalSubtotalReport.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total landing cost</div>
      <div class="value">₦${totalLandingReport.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  </div>

  <div class="content">
    <div class="section-title">Container details</div>
    <table>
      <thead>
        <tr>
          <th>Container ID</th>
          <th>Trip</th>
          <th>Title</th>
          <th>Tracking No.</th>
          <th>Status</th>
          <th>Hide Type</th>
          <th>Funding</th>
          <th>Pieces</th>
          <th>Avg Weight</th>
          <th>Unit Price</th>
          <th>Purchase Subtotal</th>
          <th>Landing Cost (₦)</th>
          <th>Created</th>
          <th>Created By</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
        <tr>
          <td><strong style="color:#55249E">${r.id}</strong></td>
          <td><span style="font-size:11px;color:#6b7280">${r.trip}</span></td>
          <td><strong>${r.title}</strong></td>
          <td>${r.tracking}</td>
          <td><span class="badge badge-${r.status.replace(' ', '_')}">${r.status}</span></td>
          <td>${r.hideType}</td>
          <td><span class="badge badge-${r.funding}">${r.funding}</span></td>
          <td style="text-align:center">${r.pieces}</td>
          <td>${r.avgWeight}</td>
          <td>${r.unitPrice}</td>
          <td style="color:#55249E;font-weight:600">${r.purchaseSubtotal}</td>
          <td style="font-weight:600">${r.landingCost}</td>
          <td>${r.created}</td>
          <td>${r.createdBy}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="7">TOTALS</td>
          <td style="text-align:center">${totalPiecesReport.toLocaleString()}</td>
          <td>—</td>
          <td>—</td>
          <td>$${totalSubtotalReport.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>₦${totalLandingReport.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="footer">
    Hydevest Portal · Generated ${new Date().toLocaleString()} · Confidential
  </div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setGeneratingReport(false)
    setReportOpen(false)
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
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Package size={16} className="text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Containers</h1>
          </div>
          <p className="text-sm text-gray-400 ml-10">
            {loading ? 'Loading...' : `${filtered.length} of ${containers.length} container${containers.length !== 1 ? 's' : ''} across all trips`}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'Total containers',
            value: filtered.length.toString(),
            sub: `of ${containers.length} total`,
            icon: <Package size={15} />,
            iconBg: 'bg-brand-100 text-brand-600',
            valueCls: 'text-brand-600',
          },
          {
            label: 'Avg landing cost',
            value: filtered.length > 0 && totalLanding > 0
              ? fmt(totalLanding / filtered.filter(c => c.estimated_landing_cost).length)
              : '—',
            sub: `total: ${totalLanding > 0 ? fmt(totalLanding) : '—'}`,
            icon: <TrendingUp size={15} />,
            iconBg: 'bg-green-100 text-green-600',
            valueCls: 'text-gray-900',
          },
          {
            label: 'Avg pieces',
            value: filtered.length > 0 && totalPieces > 0
              ? (totalPieces / filtered.filter(c => c.pieces_purchased).length).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
              : '—',
            sub: `total: ${totalPieces.toLocaleString()}`,
            icon: <Layers size={15} />,
            iconBg: 'bg-blue-100 text-blue-600',
            valueCls: 'text-gray-900',
          },
          {
            label: 'Avg quoted price',
            value: (() => {
              const w = filtered.filter(c => c.quoted_price_usd && Number(c.quoted_price_usd) > 0)
              if (!w.length) return '—'
              return fmtUSD(w.reduce((s, c) => s + Number(c.quoted_price_usd), 0) / w.length)
            })(),
            sub: 'partner containers',
            icon: <Tag size={15} />,
            iconBg: 'bg-amber-100 text-amber-600',
            valueCls: 'text-gray-900',
          },
          {
            label: 'Avg unit price',
            value: (() => {
              const w = filtered.filter(c => c.unit_price_usd && Number(c.unit_price_usd) > 0)
              if (!w.length) return '—'
              return fmtUSD(w.reduce((s, c) => s + Number(c.unit_price_usd), 0) / w.length)
            })(),
            sub: 'per piece',
            icon: <DollarSign size={15} />,
            iconBg: 'bg-purple-100 text-purple-600',
            valueCls: 'text-gray-900',
          },
        ].map(metric => (
          <div key={metric.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className={`inline-flex p-1.5 rounded-lg ${metric.iconBg} mb-3`}>
              {metric.icon}
            </div>
            <p className="text-xs text-gray-400 mb-1 leading-tight">{metric.label}</p>
            <p className={`text-lg font-semibold truncate ${metric.valueCls}`}>{metric.value}</p>
            <p className="text-xs text-gray-300 mt-0.5 truncate">{metric.sub}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters + Actions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by container ID, title, tracking number or trip..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={15} />
              Filters
              {activeFilters > 0 && (
                <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>
              )}
            </button>
            <button onClick={exportCSV}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <Download size={15} /> Export CSV
            </button>
            <button onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm">
              <FileText size={15} /> Generate report
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Trip status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All statuses</option>
                {CONTAINER_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Hide type</label>
              <select value={hideTypeFilter} onChange={e => setHideTypeFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All types</option>
                <option value="dried">Dried</option>
                <option value="wet_salted">Wet salted</option>
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
                <p className="text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''} match your filters</p>
                <button
                  onClick={() => { setStatusFilter(''); setHideTypeFilter(''); setDateFrom(''); setDateTo('') }}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors font-medium">
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
              <tr className="border-b border-gray-100">
                {[
                  'Container ID', 'Trip', 'Title', 'Tracking No.',
                  'Trip Status', 'Landing Cost (₦)',
                  'Pieces', 'Avg Weight', 'Unit Price ($)',
                  'Purchase Subtotal ($)',
                  'Hide Type', 'Funding',
                  'Created', 'Created By', ''
                ].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap bg-gray-50/80">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 15 }).map((_, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <div className="h-3.5 bg-gray-100 rounded-full animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Package size={20} className="text-gray-300" />
                      </div>
                      <p className="text-sm font-medium text-gray-400">No containers found</p>
                      {activeFilters > 0 && (
                        <button onClick={() => { setStatusFilter(''); setHideTypeFilter(''); setDateFrom(''); setDateTo('') }}
                          className="text-xs text-brand-600 hover:underline">
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : filtered.map(con => {
                const purchaseAmt = (con.unit_price_usd && con.pieces_purchased)
                  ? Number(con.unit_price_usd) * Number(con.pieces_purchased) : 0
                const purchaseSubtotal = purchaseAmt + Number(con.shipping_amount_usd ?? 0)
                return (
                  <tr key={con.id}
                    onClick={() => router.push(`/portal/purchase/trips/${con.trip_id}/containers/${con.id}`)}
                    className="hover:bg-brand-50/20 transition-colors cursor-pointer group">
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-1 rounded-md font-semibold border border-brand-100">
                        {con.container_id}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {con.trip?.trip_id ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="font-medium text-gray-900 group-hover:text-brand-700 transition-colors">
                        {con.container_number ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-gray-500 whitespace-nowrap font-mono text-xs">{con.tracking_number ?? '—'}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo(con.trip?.status ?? 'not_started').color}`}>
                        {statusInfo(con.trip?.status ?? 'not_started').label}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      {con.estimated_landing_cost
                        ? <span className="font-semibold text-gray-900">{fmt(con.estimated_landing_cost)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-gray-700 text-right pr-6 font-medium">{con.pieces_purchased?.toLocaleString() ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-3.5 text-gray-600 whitespace-nowrap">{con.average_weight ? `${con.average_weight} kg` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-3.5 text-gray-700 whitespace-nowrap font-medium">{con.unit_price_usd ? fmtUSD(con.unit_price_usd) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      {purchaseSubtotal > 0
                        ? <span className="font-semibold text-brand-700">{fmtUSD(purchaseSubtotal)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-gray-500 whitespace-nowrap text-xs">
                      {con.hide_type ? HIDE_TYPE_LABELS[con.hide_type] ?? con.hide_type : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${con.funding_type === 'partner' ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                        {con.funding_type === 'partner' ? 'Partner' : 'Entity'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-gray-400 whitespace-nowrap text-xs">{new Date(con.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3.5 text-gray-500 whitespace-nowrap text-xs">{con.created_by_profile?.full_name ?? con.created_by_profile?.email ?? '—'}</td>
                    <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => router.push(`/portal/purchase/trips/${con.trip_id}/containers/${con.id}`)}
                        className="p-1.5 rounded-lg hover:bg-brand-100 text-gray-300 hover:text-brand-600 transition-all opacity-0 group-hover:opacity-100">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-brand-100 bg-brand-50/30">
                  <td colSpan={4} className="px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Totals · {filtered.length} container{filtered.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-300">—</td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-900 whitespace-nowrap">
                    {totalLanding > 0 ? fmt(totalLanding) : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-700 text-right pr-6">
                    {totalPieces.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-300">—</td>
                  <td className="px-3 py-3 text-xs text-gray-300">—</td>
                  <td className="px-3 py-3 text-xs font-bold text-brand-700 whitespace-nowrap">
                    {fmtUSD(totalUSD)}
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Report modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
                <FileText size={16} className="text-brand-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Generate report</h2>
                <p className="text-xs text-gray-400">Choose data to include</p>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => setReportType('filtered')}
                className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType === 'filtered' ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-semibold ${reportType === 'filtered' ? 'text-brand-700' : 'text-gray-700'}`}>Filtered view</p>
                  {reportType === 'filtered' && <div className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {filtered.length} container{filtered.length !== 1 ? 's' : ''}
                  {activeFilters > 0 ? ` · ${activeFilters} filter${activeFilters !== 1 ? 's' : ''} active` : ' · no filters'}
                </p>
              </button>
              <button onClick={() => setReportType('full')}
                className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType === 'full' ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-semibold ${reportType === 'full' ? 'text-brand-700' : 'text-gray-700'}`}>Full report</p>
                  {reportType === 'full' && <div className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{containers.length} total containers across all trips</p>
              </button>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setReportOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => generateReport(reportType)} disabled={generatingReport}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                {generatingReport ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><FileText size={14} /> Generate</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
