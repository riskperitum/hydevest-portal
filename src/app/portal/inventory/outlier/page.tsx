'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Filter, Download, Eye, Package,
  Clock, CheckCircle2, DollarSign, AlertCircle, ShoppingCart
} from 'lucide-react'
import Link from 'next/link'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'

interface OutlierRecord {
  id: string
  record_id: string
  container_id: string
  type: string
  quantity: number
  notes: string | null
  status: string
  is_modified: boolean
  created_at: string
  container: {
    container_id: string
    tracking_number: string | null
  } | null
}

interface OutlierSale {
  id: string
  sale_id: string
  customer_id: string
  type: string
  quantity_sold: number
  pricing_mode: string
  price_per_piece: number | null
  total_price: number
  notes: string | null
  status: string
  is_modified: boolean
  created_at: string
  customer: { name: string; customer_id: string } | null
}

const TYPES = ['ISINLE', 'BAYA', 'BLEACHING'] as const

const TYPE_COLORS: Record<string, string> = {
  ISINLE:    'bg-blue-50 text-blue-700 border-blue-200',
  BAYA:      'bg-purple-50 text-purple-700 border-purple-200',
  BLEACHING: 'bg-amber-50 text-amber-700 border-amber-200',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending_approval: { label: 'Pending approval',  color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  approved:         { label: 'Approved',           color: 'bg-blue-50 text-blue-700 border-blue-200',   dot: 'bg-blue-500' },
  rejected:         { label: 'Rejected',           color: 'bg-red-50 text-red-600 border-red-200',      dot: 'bg-red-500' },
  modified_pending: { label: 'Modified — pending', color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function OutlierPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'record' | 'sale'>('record')
  const [records, setRecords] = useState<OutlierRecord[]>([])
  const [sales, setSales] = useState<OutlierSale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const { permissions, isSuperAdmin } = usePermissions()
  const canCreate = isSuperAdmin || can(permissions, isSuperAdmin, 'outlier.create')

  const load = useCallback(async () => {
    const supabase = createClient()
    const one = <T,>(v: T | T[] | null | undefined): T | null => {
      if (v == null) return null
      return Array.isArray(v) ? (v[0] ?? null) : v
    }

    const [{ data: recordData }, { data: saleData }] = await Promise.all([
      supabase.from('outlier_records').select(`
        *,
        container:containers(container_id, tracking_number)
      `).order('created_at', { ascending: false }),
      supabase.from('outlier_sales').select(`
        *,
        customer:customers(name, customer_id)
      `).order('created_at', { ascending: false }),
    ])

    setRecords((recordData ?? []).map(r => ({ ...r, container: one(r.container) })) as OutlierRecord[])
    setSales((saleData ?? []).map(s => ({ ...s, customer: one(s.customer) })) as OutlierSale[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Compute available stock by type (approved records minus approved sales)
  const stockByType: Record<string, number> = {}
  for (const t of TYPES) {
    const recorded = records.filter(r => r.type === t && (r.status === 'approved' || r.status === 'modified_pending'))
                            .reduce((s, r) => s + Number(r.quantity), 0)
    const sold = sales.filter(s => s.type === t && (s.status === 'approved' || s.status === 'modified_pending'))
                       .reduce((s, sa) => s + Number(sa.quantity_sold), 0)
    stockByType[t] = recorded - sold
  }

  const totalRecorded = records.filter(r => r.status === 'approved').reduce((s, r) => s + r.quantity, 0)
  const totalSold = sales.filter(s => s.status === 'approved').reduce((s, sa) => s + sa.quantity_sold, 0)
  const totalRevenue = sales.filter(s => s.status === 'approved').reduce((s, sa) => s + Number(sa.total_price), 0)

  // Group records by container for the Record tab
  const groupedRecords = records.reduce((acc, r) => {
    const key = r.container?.container_id ?? 'unknown'
    if (!acc[key]) acc[key] = { container: r.container, records: [] as OutlierRecord[] }
    acc[key].records.push(r)
    return acc
  }, {} as Record<string, { container: OutlierRecord['container']; records: OutlierRecord[] }>)

  const filteredGroupedRecords = Object.entries(groupedRecords)
    .filter(([key, group]) => {
      if (search && !key.toLowerCase().includes(search.toLowerCase()) && !group.records.some(r => r.record_id.toLowerCase().includes(search.toLowerCase()))) return false
      if (typeFilter && !group.records.some(r => r.type === typeFilter)) return false
      return true
    })

  const filteredSales = sales.filter(s => {
    if (search && !s.sale_id.toLowerCase().includes(search.toLowerCase()) && !(s.customer?.name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (typeFilter && s.type !== typeFilter) return false
    return true
  })

  return (
    <PermissionGate permKey="outlier.view">
      <div className="space-y-5 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Outlier</h1>
            <p className="text-sm text-gray-400 mt-0.5">Track and sell outlier hides (ISINLE, BAYA, BLEACHING)</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => router.push(activeTab === 'record' ? '/portal/inventory/outlier/record/create' : '/portal/inventory/outlier/sale/create')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700"
            >
              <Plus size={15} /> {activeTab === 'record' ? 'Create record' : 'Sell outliers'}
            </button>
          )}
        </div>

        {/* Stock by type */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TYPES.map(t => (
            <div key={t} className={`rounded-xl border p-4 ${TYPE_COLORS[t]}`}>
              <p className="text-xs uppercase tracking-wide font-semibold mb-1">{t}</p>
              <p className="text-2xl font-bold">{stockByType[t].toLocaleString()}</p>
              <p className="text-xs mt-1 opacity-80">pieces in stock</p>
            </div>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1"><Package size={15} className="text-blue-600" /><p className="text-xs text-gray-500">Total recorded</p></div>
            <p className="text-lg font-bold text-blue-700">{totalRecorded.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1"><ShoppingCart size={15} className="text-purple-600" /><p className="text-xs text-gray-500">Total sold</p></div>
            <p className="text-lg font-bold text-purple-700">{totalSold.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign size={15} className="text-green-600" /><p className="text-xs text-gray-500">Total revenue</p></div>
            <p className="text-lg font-bold text-green-700">{fmt(totalRevenue)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1"><AlertCircle size={15} className="text-amber-600" /><p className="text-xs text-gray-500">Total in stock</p></div>
            <p className="text-lg font-bold text-amber-700">{(totalRecorded - totalSold).toLocaleString()}</p>
          </div>
        </div>

        {/* Tab strip */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => setActiveTab('record')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                activeTab === 'record' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Package size={14} /> Records
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${activeTab === 'record' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{records.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sale')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                activeTab === 'sale' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <ShoppingCart size={14} /> Sales
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${activeTab === 'sale' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{sales.length}</span>
            </button>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={activeTab === 'record' ? 'Search container, record ID...' : 'Search sale ID, customer...'}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">All types</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Record tab */}
          {activeTab === 'record' && (
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
              ) : filteredGroupedRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Package size={28} className="text-gray-200" />
                  <p className="text-sm text-gray-400">No outlier records yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredGroupedRecords.map(([key, group]) => {
                    const visibleRecords = typeFilter ? group.records.filter(r => r.type === typeFilter) : group.records
                    return (
                      <div key={key}>
                        <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                          <div>
                            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">
                              {group.container?.container_id ?? key}
                            </span>
                            {group.container?.tracking_number && (
                              <span className="text-xs text-gray-500 ml-2">{group.container.tracking_number}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">{visibleRecords.length} record{visibleRecords.length !== 1 ? 's' : ''}</p>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100">
                              {['Record ID','Type','Quantity','Notes','Status','Date',''].map(h => (
                                <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRecords.map(r => {
                              const sCfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending_approval
                              return (
                                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                  <td className="px-5 py-3 whitespace-nowrap">
                                    <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{r.record_id}</span>
                                  </td>
                                  <td className="px-5 py-3 whitespace-nowrap">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${TYPE_COLORS[r.type]}`}>{r.type}</span>
                                  </td>
                                  <td className="px-5 py-3 font-bold text-gray-900 whitespace-nowrap">{r.quantity.toLocaleString()}</td>
                                  <td className="px-5 py-3 text-xs text-gray-500 max-w-[180px] truncate">{r.notes ?? '—'}</td>
                                  <td className="px-5 py-3 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${sCfg.color}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />
                                      {sCfg.label}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </td>
                                  <td className="px-5 py-3 whitespace-nowrap">
                                    <button onClick={() => router.push(`/portal/inventory/outlier/record/${r.id}`)}
                                      className="text-gray-400 hover:text-brand-600"><Eye size={14} /></button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sale tab */}
          {activeTab === 'sale' && (
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
              ) : filteredSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <ShoppingCart size={28} className="text-gray-200" />
                  <p className="text-sm text-gray-400">No outlier sales yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Sale ID','Customer','Type','Quantity','Mode','Total Price','Status','Date',''].map(h => (
                        <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map(s => {
                      const sCfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pending_approval
                      return (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{s.sale_id}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700">
                            {s.customer?.name ?? '—'}
                            <span className="text-gray-400 ml-1">{s.customer?.customer_id ?? ''}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${TYPE_COLORS[s.type]}`}>{s.type}</span>
                          </td>
                          <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{s.quantity_sold.toLocaleString()}</td>
                          <td className="px-3 py-3 text-xs text-gray-500 capitalize whitespace-nowrap">{s.pricing_mode === 'per_piece' ? `Per piece (${fmt(s.price_per_piece ?? 0)})` : 'Gross'}</td>
                          <td className="px-3 py-3 font-bold text-green-700 whitespace-nowrap">{fmt(s.total_price)}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${sCfg.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />
                              {sCfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <button onClick={() => router.push(`/portal/inventory/outlier/sale/${s.id}`)}
                              className="text-gray-400 hover:text-brand-600"><Eye size={14} /></button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </PermissionGate>
  )
}
