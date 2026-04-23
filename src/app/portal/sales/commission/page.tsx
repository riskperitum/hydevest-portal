'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Filter, Download, Eye, TrendingUp,
  Clock, CheckCircle2, DollarSign, AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'

interface CommissionRow {
  id: string
  commission_id: string
  sales_order_id: string
  referrer_name: string
  calculation_type: string
  excess_amount: number | null
  total_pieces: number | null
  sale_price_per_piece: number | null
  commission_amount: number
  notes: string | null
  status: string
  is_modified: boolean
  created_at: string
  sales_order: {
    order_id: string
    customer: { name: string } | null
    container: { tracking_number: string | null; container_id: string } | null
  } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending_approval:   { label: 'Pending approval',   color: 'bg-amber-50 text-amber-700 border-amber-200',  dot: 'bg-amber-400' },
  approved:           { label: 'Approved',            color: 'bg-blue-50 text-blue-700 border-blue-200',    dot: 'bg-blue-500' },
  rejected:           { label: 'Rejected',            color: 'bg-red-50 text-red-600 border-red-200',       dot: 'bg-red-500' },
  paid:               { label: 'Paid',                color: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  modified_pending:   { label: 'Modified - pending',  color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function CommissionPage() {
  const router = useRouter()
  const [rows, setRows] = useState<CommissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { permissions, isSuperAdmin } = usePermissions()
  const canCreate = isSuperAdmin || can(permissions, isSuperAdmin, 'commission.create')

  const load = useCallback(async () => {
    const supabase = createClient()
    const one = <T,>(v: T | T[] | null | undefined): T | null => {
      if (v == null) return null
      return Array.isArray(v) ? (v[0] ?? null) : v
    }
    const { data } = await supabase
      .from('commissions')
      .select(`
        *,
        sales_order:sales_orders!commissions_sales_order_id_fkey(
          order_id,
          customer:customers(name),
          container:containers(tracking_number, container_id)
        )
      `)
      .order('created_at', { ascending: false })

    setRows(
      (data ?? []).map(r => ({
        ...r,
        sales_order: one(r.sales_order),
      })) as CommissionRow[],
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    const matchSearch = search === '' ||
      r.commission_id.toLowerCase().includes(search.toLowerCase()) ||
      r.referrer_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.sales_order?.order_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.sales_order?.customer?.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || r.status === statusFilter
    const matchFrom = dateFrom === '' || new Date(r.created_at) >= new Date(dateFrom)
    const matchTo = dateTo === '' || new Date(r.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchStatus && matchFrom && matchTo
  })

  const totalCommissions = filtered.reduce((s, r) => s + Number(r.commission_amount), 0)
  const pendingCommissions = filtered.filter(r => r.status === 'pending_approval' || r.status === 'modified_pending').reduce((s, r) => s + Number(r.commission_amount), 0)
  const paidCommissions = filtered.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.commission_amount), 0)
  const approvedUnpaid = filtered.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.commission_amount), 0)

  function exportCSV() {
    const headers = ['Commission ID','Order ID','Customer','Tracking','Referrer','Calculation Type','Commission Amount','Status','Date']
    const csvRows = filtered.map(r => [
      r.commission_id,
      r.sales_order?.order_id ?? '',
      r.sales_order?.customer?.name ?? '',
      r.sales_order?.container?.tracking_number ?? '',
      r.referrer_name,
      r.calculation_type,
      Number(r.commission_amount).toFixed(2),
      r.status,
      new Date(r.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...csvRows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `commissions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeFilters = [statusFilter, dateFrom, dateTo].filter(Boolean).length

  return (
    <PermissionGate permKey="commission.view">
      <div className="space-y-5 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Commissions</h1>
            <p className="text-sm text-gray-400 mt-0.5">{filtered.length} commission records</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => router.push('/portal/sales/commission/create')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700"
            >
              <Plus size={15} /> Record commission
            </button>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total commissions', value: fmt(totalCommissions),   color: 'text-brand-700',  bg: 'bg-brand-50',  icon: <DollarSign size={15} className="text-brand-600" /> },
            { label: 'Pending',           value: fmt(pendingCommissions), color: 'text-amber-700',  bg: 'bg-amber-50',  icon: <Clock size={15} className="text-amber-600" /> },
            { label: 'Approved unpaid',   value: fmt(approvedUnpaid),     color: 'text-blue-700',   bg: 'bg-blue-50',   icon: <AlertCircle size={15} className="text-blue-600" /> },
            { label: 'Paid',              value: fmt(paidCommissions),    color: 'text-green-700',  bg: 'bg-green-50',  icon: <CheckCircle2 size={15} className="text-green-600" /> },
          ].map(m => (
            <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
              <div className="flex items-center gap-2 mb-1">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
              <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ID, referrer, order, customer..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Filter size={14} /> Filters
              {activeFilters > 0 && <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>}
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-40"
              style={{ background: '#55249E' }}
            >
              <Download size={14} /> Export CSV
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  <option value="">All statuses</option>
                  <option value="pending_approval">Pending approval</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                  <option value="rejected">Rejected</option>
                  <option value="modified_pending">Modified - pending</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Date from</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Date to</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              {activeFilters > 0 && (
                <div className="col-span-2 md:col-span-3 flex items-center justify-between pt-1">
                  <p className="text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
                  <button type="button" onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo('') }} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
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
                  {['Commission ID','Order ID','Customer','Tracking','Referrer','Type','Amount','Status','Date',''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                          <DollarSign size={20} className="text-gray-300" />
                        </div>
                        <p className="text-sm text-gray-400">No commission records found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map(r => {
                    const statusCfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending_approval
                    return (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-mono bg-brand-50 text-brand-700 px-2 py-0.5 rounded">
                            {r.commission_id}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Link href={`/portal/sales/orders/${r.sales_order_id}`} className="text-xs font-medium text-brand-600 hover:underline">
                            {r.sales_order?.order_id ?? '—'}
                          </Link>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700">
                          {r.sales_order?.customer?.name ?? '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                          {r.sales_order?.container?.tracking_number ?? '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 font-medium">
                          {r.referrer_name}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${r.calculation_type === 'auto' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                            {r.calculation_type}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-brand-700">
                          {fmt(r.commission_amount)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-400">
                          {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => router.push(`/portal/sales/commission/${r.id}`)}
                            className="text-gray-400 hover:text-brand-600 transition-colors"
                            title="View details"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PermissionGate>
  )
}
