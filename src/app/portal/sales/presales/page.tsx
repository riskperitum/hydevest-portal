'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Eye, Trash2, Loader2, Package, Download, Filter, FileText, ClipboardCheck, CheckCircle2 } from 'lucide-react'

interface Presale {
  id: string
  presale_id: string
  sale_type: string
  status: string
  approval_status: string
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

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
}

export default function PresalesPage() {
  const router = useRouter()
  const [presales, setPresales] = useState<Presale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')
  const [workflowPresale, setWorkflowPresale] = useState<Presale | null>(null)
  const [workflowType, setWorkflowType] = useState<'delete' | 'review' | 'approval' | null>(null)
  const [workflowNote, setWorkflowNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [submittingWorkflow, setSubmittingWorkflow] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: ps } = await supabase
      .from('presales')
      .select('*, container:containers(container_id, tracking_number, container_number), created_by_profile:profiles!presales_created_by_fkey(full_name, email)')
      .order('created_at', { ascending: false })
    setPresales(ps ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
    getAdminProfiles().then(data => setEmployees(data))
  }, [load])

  async function handleDelete(id: string) {
    if (!confirm('Delete this presale? This cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('presales').delete().eq('id', id)
    load()
  }

  async function submitWorkflow() {
    if (!assignee || !workflowType || !workflowPresale) return
    setSubmittingWorkflow(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const typeKeys = { delete: 'delete_approval', review: 'review_request', approval: 'approval_request' }
    const typeLabels = { delete: 'Delete approval', review: 'Review request', approval: 'Approval request' }
    const { data: task } = await supabase.from('tasks').insert({
      type: typeKeys[workflowType],
      title: `${typeLabels[workflowType]}: ${workflowPresale.presale_id}`,
      description: workflowNote || `${typeLabels[workflowType]} for presale ${workflowPresale.presale_id}`,
      module: 'presales',
      record_id: workflowPresale.id,
      record_ref: workflowPresale.presale_id,
      requested_by: user?.id,
      assigned_to: assignee,
      priority: workflowType === 'delete' ? 'high' : 'normal',
    }).select().single()
    await supabase.from('notifications').insert({
      user_id: assignee,
      type: `task_${typeKeys[workflowType]}`,
      title: `New task: ${typeLabels[workflowType]}`,
      message: workflowPresale.presale_id,
      task_id: task?.id,
      record_id: workflowPresale.id,
      record_ref: workflowPresale.presale_id,
      module: 'presales',
    })
    setSubmittingWorkflow(false)
    setWorkflowPresale(null)
    setWorkflowType(null)
    setWorkflowNote('')
    setAssignee('')
    load()
  }

  function generateReport(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filteredPresales : presales
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Presales Report — Hydevest</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1a1a2e}
    .header{background:#55249E;color:white;padding:32px 40px}.header h1{font-size:24px;font-weight:700}
    .header p{font-size:13px;opacity:.8;margin-top:4px}.content{padding:24px 40px}
    table{width:100%;border-collapse:collapse;font-size:12px}thead tr{background:#55249E;color:white}
    thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap}
    tbody tr{border-bottom:1px solid #f0ebff}tbody tr:nth-child(even){background:#faf8ff}
    tbody td{padding:9px 12px;color:#374151;white-space:nowrap}
    .footer{padding:20px 40px;border-top:1px solid #ede9f7;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
    <div class="header"><h1>Presales Report</h1><p>Hydevest Portal — ${type === 'filtered' ? 'Filtered View' : 'Full Report'}</p>
    <p style="font-size:12px;opacity:.8;margin-top:8px">Generated: ${new Date().toLocaleString()} · ${data.length} presales</p></div>
    <div class="content"><table><thead><tr>
    <th>Presale ID</th><th>Type</th><th>Container</th><th>Tracking No.</th>
    <th>W/H Pieces</th><th>Price/Kilo</th><th>Price/Piece</th><th>Expected Revenue</th><th>Status</th><th>Created</th>
    </tr></thead><tbody>
    ${data.map(p => `<tr>
    <td><strong style="color:#55249E">${p.presale_id}</strong></td>
    <td>${p.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}</td>
    <td>${p.container?.container_id ?? '—'}</td>
    <td>${p.container?.tracking_number ?? '—'}</td>
    <td>${p.warehouse_confirmed_pieces?.toLocaleString() ?? '—'}</td>
    <td>${p.price_per_kilo ? '₦' + Number(p.price_per_kilo).toLocaleString() : '—'}</td>
    <td>${p.price_per_piece ? '₦' + Number(p.price_per_piece).toLocaleString() : '—'}</td>
    <td><strong>${p.expected_sale_revenue ? '₦' + Number(p.expected_sale_revenue).toLocaleString(undefined, {minimumFractionDigits:2}) : '—'}</strong></td>
    <td>${p.status}</td>
    <td>${new Date(p.created_at).toLocaleDateString()}</td>
    </tr>`).join('')}
    </tbody></table></div>
    <div class="footer">Hydevest Portal · Generated ${new Date().toLocaleString()} · Confidential</div>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filteredPresales = presales.filter(p => {
    const matchSearch = search === '' ||
      p.presale_id.toLowerCase().includes(search.toLowerCase()) ||
      (p.container?.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.container?.container_id ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || p.status === statusFilter
    const matchType = saleTypeFilter === '' || p.sale_type === saleTypeFilter
    const matchDateFrom = dateFrom === '' || new Date(p.created_at) >= new Date(dateFrom)
    const matchDateTo = dateTo === '' || new Date(p.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchType && matchDateFrom && matchDateTo
  })

  const activeFilters = [statusFilter, saleTypeFilter, dateFrom, dateTo].filter(Boolean).length

  const totalRevenue = filteredPresales.reduce((s, p) => s + Number(p.expected_sale_revenue ?? 0), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pre-sales</h1>
          <p className="text-sm text-gray-400 mt-0.5">{presales.length} presale{presales.length !== 1 ? 's' : ''} created</p>
        </div>
        <Link href="/portal/sales/presales/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Create presale</span>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          {
            label: 'Total presales',
            value: filteredPresales.length.toString(),
            sub: `${presales.filter(p => p.sale_type === 'box_sale').length} box · ${presales.filter(p => p.sale_type === 'split_sale').length} split`,
            color: 'text-brand-600',
          },
          {
            label: 'Box sales',
            value: filteredPresales.filter(p => p.sale_type === 'box_sale').length.toString(),
            color: 'text-blue-600',
          },
          {
            label: 'Split sales',
            value: filteredPresales.filter(p => p.sale_type === 'split_sale').length.toString(),
            color: 'text-purple-600',
          },
          {
            label: 'Avg W/H weight',
            value: (() => {
              const w = filteredPresales.filter(p => p.warehouse_confirmed_avg_weight && Number(p.warehouse_confirmed_avg_weight) > 0)
              if (!w.length) return '—'
              const avg = w.reduce((s, p) => s + Number(p.warehouse_confirmed_avg_weight), 0) / w.length
              return `${avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
            })(),
            color: 'text-gray-900',
          },
          {
            label: 'Avg price / kilo',
            value: (() => {
              const w = filteredPresales.filter(p => p.price_per_kilo && Number(p.price_per_kilo) > 0)
              if (!w.length) return '—'
              const avg = w.reduce((s, p) => s + Number(p.price_per_kilo), 0) / w.length
              return fmt(avg)
            })(),
            color: 'text-amber-600',
          },
          {
            label: 'Avg price / piece',
            value: (() => {
              const w = filteredPresales.filter(p => p.price_per_piece && Number(p.price_per_piece) > 0)
              if (!w.length) return '—'
              const avg = w.reduce((s, p) => s + Number(p.price_per_piece), 0) / w.length
              return fmt(avg)
            })(),
            color: 'text-brand-600',
          },
          {
            label: 'Avg expected revenue',
            value: (() => {
              const w = filteredPresales.filter(p => p.expected_sale_revenue && Number(p.expected_sale_revenue) > 0)
              if (!w.length) return '—'
              const avg = w.reduce((s, p) => s + Number(p.expected_sale_revenue), 0) / w.length
              return fmt(avg)
            })(),
            color: 'text-green-600',
          },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1 leading-tight">{m.label}</p>
            <p className={`text-base font-semibold truncate ${m.color}`}>{m.value}</p>
            {'sub' in m && m.sub && <p className="text-xs text-gray-300 mt-0.5 truncate">{m.sub}</p>}
          </div>
        ))}
      </div>

      {/* Search + filters + actions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by presale ID or tracking number..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
                ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={15} /> Filters
              {activeFilters > 0 && <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>}
            </button>
            <button onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <FileText size={15} /> Report
            </button>
            <button onClick={() => {
              const headers = ['Presale ID','Type','Container','Tracking No.','W/H Pieces','Price/Kilo','Price/Piece','Expected Revenue','Status','Created']
              const rows = filteredPresales.map(p => [p.presale_id, p.sale_type, p.container?.container_id ?? '', p.container?.tracking_number ?? '', p.warehouse_confirmed_pieces ?? '', p.price_per_kilo ?? '', p.price_per_piece ?? '', p.expected_sale_revenue ?? '', p.status, new Date(p.created_at).toLocaleDateString()])
              const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'presales.csv'; a.click()
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
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
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
                <p className="text-xs text-gray-400">{filteredPresales.length} result{filteredPresales.length !== 1 ? 's' : ''}</p>
                <button onClick={() => { setStatusFilter(''); setSaleTypeFilter(''); setDateFrom(''); setDateTo('') }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">Clear all</button>
              </div>
            )}
          </div>
        )}
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
                <tr key={ps.id}
                  onClick={() => router.push(`/portal/sales/presales/${ps.id}`)}
                  className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors group cursor-pointer">
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
                  <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => router.push(`/portal/sales/presales/${ps.id}`)}
                        title="View" className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => { setWorkflowPresale(ps); setWorkflowType('review') }}
                        title="Request review" className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                        <ClipboardCheck size={14} />
                      </button>
                      <button onClick={() => { setWorkflowPresale(ps); setWorkflowType('approval') }}
                        title="Request approval" className={`p-1.5 rounded-lg transition-colors ${ps.approval_status === 'approved' ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-amber-50 hover:text-amber-600'}`}>
                        <CheckCircle2 size={14} />
                      </button>
                      <button onClick={() => { setWorkflowPresale(ps); setWorkflowType('delete') }}
                        title="Request deletion" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
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

      {/* Workflow modal */}
      {workflowPresale && workflowType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setWorkflowPresale(null); setWorkflowType(null) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">
              {workflowType === 'delete' ? 'Request deletion' : workflowType === 'review' ? 'Request review' : 'Request approval'}
            </h2>
            {workflowType === 'delete' && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                <p className="text-xs text-red-700 font-medium">The presale will only be deleted after the assigned user approves it.</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to <span className="text-red-400">*</span></label>
              <select required value={assignee} onChange={e => setAssignee(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Select user...</option>
                {employees.filter(e => e.id !== currentUserId).map(e => (
                  <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
              <textarea rows={2} value={workflowNote} onChange={e => setWorkflowNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setWorkflowPresale(null); setWorkflowType(null); setWorkflowNote(''); setAssignee('') }}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={submitWorkflow} disabled={submittingWorkflow || !assignee}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2
                  ${workflowType === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' :
                    workflowType === 'approval' ? 'bg-green-600 text-white hover:bg-green-700' :
                    'bg-brand-600 text-white hover:bg-brand-700'}`}>
                {submittingWorkflow ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Generate report</h2>
            <div className="space-y-2">
              {(['filtered', 'full'] as const).map(t => (
                <button key={t} onClick={() => setReportType(t)}
                  className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType === t ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <p className={`text-sm font-semibold ${reportType === t ? 'text-brand-700' : 'text-gray-700'}`}>
                    {t === 'filtered' ? 'Filtered view' : 'Full report'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t === 'filtered' ? `${filteredPresales.length} presales` : `${presales.length} total presales`}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setReportOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => generateReport(reportType)}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">Generate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

