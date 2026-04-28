'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, Users, ChevronRight, TrendingUp, AlertTriangle, Download, Filter } from 'lucide-react'

interface CustomerRow {
  id: string
  customer_id: string
  name: string
  phone: string | null
  address: string | null
  is_active: boolean
  total_orders: number
  total_revenue: number
  total_outstanding: number
  total_bad_debt: number
  active_cases: number
  split_pallets: number
  box_containers: number
  outlier_sales: number
  outlier_revenue: number
  outlier_outstanding: number
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function CustomerProfilesPage() {
  const router  = useRouter()
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [hasOutstanding, setHasOutstanding] = useState(false)
  const [hasBadDebt, setHasBadDebt] = useState(false)
  const [hasCases, setHasCases] = useState(false)
  const [sortField, setSortField] = useState<'name' | 'total_orders' | 'total_revenue' | 'total_outstanding' | 'split_pallets' | 'box_containers'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [
      { data: customerData },
      { data: ordersData },
      { data: badDebtData },
      { data: legalData },
      { data: palletData },
      { data: outlierData },
    ] = await Promise.all([
      supabase.from('customers').select('id, customer_id, name, phone, address, is_active').order('name'),
      supabase.from('sales_orders').select('id, customer_id, sale_type, container_id, customer_payable, outstanding_balance, payment_status, container:containers(container_id, tracking_number)'),
      supabase.from('bad_debts').select('customer_id, amount_ngn, status'),
      supabase.from('legal_case_customers').select('customer_id, case:legal_cases!legal_case_customers_case_id_fkey(id, status)'),
      supabase.from('sales_order_pallets').select('order_id, pallets_sold'),
      supabase.from('outlier_sales').select('customer_id, total_price, amount_paid, outstanding, status').eq('status', 'approved'),
    ])

    const ordersMap: Record<string, { count: number; revenue: number; outstanding: number }> = {}
    for (const o of (ordersData ?? [])) {
      if (!ordersMap[o.customer_id]) ordersMap[o.customer_id] = { count: 0, revenue: 0, outstanding: 0 }
      ordersMap[o.customer_id].count++
      ordersMap[o.customer_id].revenue     += Number(o.customer_payable)
      ordersMap[o.customer_id].outstanding += Number(o.outstanding_balance)
    }

    // Build pallet map per order (for split sales)
    const palletsByOrder: Record<string, number> = {}
    for (const p of (palletData ?? [])) {
      palletsByOrder[p.order_id] = (palletsByOrder[p.order_id] ?? 0) + Number(p.pallets_sold)
    }

    // Build split pallets and box containers per customer
    const splitPalletsMap: Record<string, number> = {}
    const boxContainersMap: Record<string, Set<string>> = {}
    for (const o of (ordersData ?? [])) {
      if (o.sale_type === 'split_sale') {
        splitPalletsMap[o.customer_id] = (splitPalletsMap[o.customer_id] ?? 0) + (palletsByOrder[o.id] ?? 0)
      } else if (o.sale_type === 'box_sale') {
        if (!boxContainersMap[o.customer_id]) boxContainersMap[o.customer_id] = new Set()
        const rawCont = o.container as { tracking_number?: string | null; container_id?: string } | { tracking_number?: string | null; container_id?: string }[] | null | undefined
        const cont = Array.isArray(rawCont) ? rawCont[0] : rawCont
        const trackingNo = cont?.tracking_number ?? cont?.container_id
        if (trackingNo) boxContainersMap[o.customer_id].add(trackingNo)
      }
    }

    const badDebtMap: Record<string, number> = {}
    for (const b of (badDebtData ?? [])) {
      if (b.status === 'approved') {
        badDebtMap[b.customer_id] = (badDebtMap[b.customer_id] ?? 0) + Number(b.amount_ngn)
      }
    }

    const outlierMap: Record<string, { count: number; revenue: number; outstanding: number }> = {}
    for (const s of (outlierData ?? [])) {
      if (!outlierMap[s.customer_id]) outlierMap[s.customer_id] = { count: 0, revenue: 0, outstanding: 0 }
      outlierMap[s.customer_id].count++
      outlierMap[s.customer_id].revenue     += Number(s.total_price)
      outlierMap[s.customer_id].outstanding += Number(s.outstanding ?? 0)
    }

    const caseMap: Record<string, number> = {}
    for (const l of (legalData ?? [])) {
      const status = (l.case as any)?.status ?? ''
      if (!['closed', 'settled', 'won', 'lost'].includes(status)) {
        caseMap[l.customer_id] = (caseMap[l.customer_id] ?? 0) + 1
      }
    }

    setCustomers((customerData ?? []).map(c => ({
      id:                c.id,
      customer_id:       c.customer_id,
      name:              c.name,
      phone:             c.phone,
      address:           c.address,
      is_active:         c.is_active,
      total_orders:      ordersMap[c.id]?.count       ?? 0,
      total_revenue:     ordersMap[c.id]?.revenue     ?? 0,
      total_outstanding: ordersMap[c.id]?.outstanding ?? 0,
      total_bad_debt:    badDebtMap[c.id]             ?? 0,
      active_cases:      caseMap[c.id]                ?? 0,
      split_pallets:     splitPalletsMap[c.id]        ?? 0,
      box_containers:    boxContainersMap[c.id]?.size ?? 0,
      outlier_sales:        outlierMap[c.id]?.count       ?? 0,
      outlier_revenue:      outlierMap[c.id]?.revenue     ?? 0,
      outlier_outstanding:  outlierMap[c.id]?.outstanding ?? 0,
    })))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const activeFilterCount = [
    statusFilter !== 'all',
    hasOutstanding,
    hasBadDebt,
    hasCases,
  ].filter(Boolean).length

  const filtered = customers
    .filter(c => {
      const matchSearch = search === '' ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.customer_id.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone ?? '').includes(search)
      const matchStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && c.is_active) ||
        (statusFilter === 'inactive' && !c.is_active)
      const matchOutstanding = !hasOutstanding || c.total_outstanding > 0
      const matchBadDebt = !hasBadDebt || c.total_bad_debt > 0
      const matchCases = !hasCases || c.active_cases > 0
      return matchSearch && matchStatus && matchOutstanding && matchBadDebt && matchCases
    })
    .sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum
    })

  function exportToCSV() {
    const headers = ['Customer','Customer ID','Phone','Orders','Split Pallets','Box Containers','Outlier Sales','Outlier Revenue','Outlier Outstanding','Revenue','Outstanding','Bad Debt','Active Cases','Status']
    const rows = filtered.map(c => [
      c.name,
      c.customer_id,
      c.phone ?? '',
      c.total_orders,
      c.split_pallets,
      c.box_containers,
      c.outlier_sales,
      c.outlier_revenue,
      c.outlier_outstanding,
      c.total_revenue,
      c.total_outstanding,
      c.total_bad_debt,
      c.active_cases,
      c.is_active ? 'Active' : 'Inactive',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customer-profiles-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalRevenue     = customers.reduce((s, c) => s + c.total_revenue, 0)
  const totalOutstanding = customers.reduce((s, c) => s + c.total_outstanding, 0)
  const totalBadDebt     = customers.reduce((s, c) => s + c.total_bad_debt, 0)

  return (
    <div className="space-y-5 max-w-7xl">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Customer profiles</h1>
        <p className="text-sm text-gray-400 mt-0.5">{customers.length} customers · click any row for full 360° profile</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total revenue',     value: fmt(totalRevenue),     color: 'text-green-700', bg: 'bg-green-50',  icon: <TrendingUp size={15} className="text-green-600" />    },
          { label: 'Total outstanding', value: fmt(totalOutstanding), color: 'text-amber-700', bg: 'bg-amber-50',  icon: <AlertTriangle size={15} className="text-amber-600" /> },
          { label: 'Total bad debts',   value: fmt(totalBadDebt),     color: 'text-red-700',   bg: 'bg-red-50',    icon: <AlertTriangle size={15} className="text-red-600" />   },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, ID or phone..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
              showFilters || activeFilterCount > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter size={14} /> Filters
            {activeFilterCount > 0 && (
              <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={exportToCSV}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-40"
            style={{ background: '#55249E' }}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="all">All customers</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sort by</label>
              <select
                value={`${sortField}|${sortDir}`}
                onChange={e => {
                  const [f, d] = e.target.value.split('|')
                  setSortField(f as typeof sortField)
                  setSortDir(d as 'asc' | 'desc')
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="name|asc">Name A-Z</option>
                <option value="name|desc">Name Z-A</option>
                <option value="total_orders|desc">Most orders</option>
                <option value="total_orders|asc">Least orders</option>
                <option value="total_revenue|desc">Highest revenue</option>
                <option value="total_revenue|asc">Lowest revenue</option>
                <option value="total_outstanding|desc">Highest outstanding</option>
                <option value="total_outstanding|asc">Lowest outstanding</option>
                <option value="split_pallets|desc">Most split pallets</option>
                <option value="box_containers|desc">Most box containers</option>
              </select>
            </div>
            <div className="md:col-span-2 flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasOutstanding} onChange={e => setHasOutstanding(e.target.checked)} />
                <span className="text-xs text-gray-600">Has outstanding</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasBadDebt} onChange={e => setHasBadDebt(e.target.checked)} />
                <span className="text-xs text-gray-600">Has bad debt</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasCases} onChange={e => setHasCases(e.target.checked)} />
                <span className="text-xs text-gray-600">Has active case</span>
              </label>
            </div>
            {activeFilterCount > 0 && (
              <div className="col-span-2 md:col-span-4 flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all')
                    setHasOutstanding(false)
                    setHasBadDebt(false)
                    setHasCases(false)
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 border-b animate-pulse flex gap-4">
              <div className="h-4 bg-gray-100 rounded w-32" />
              <div className="h-4 bg-gray-100 rounded flex-1" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Users size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No customers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Customer','ID','Phone','Orders','Split Pallets','Box Containers','Revenue','Outstanding','Bad debt','Cases',''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <tr key={c.id}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/portal/accounts/customers/${c.id}`)}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                      {c.address && <p className="text-xs text-gray-400 truncate max-w-[160px]">{c.address}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs px-2 py-0.5 rounded font-medium"
                        style={{ background: '#f0ecfc', color: '#55249E' }}>
                        {c.customer_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-700">{c.total_orders}</td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">{c.split_pallets}</td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">{c.box_containers}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-green-700 whitespace-nowrap">
                      {c.total_revenue > 0 ? fmt(c.total_revenue) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.total_outstanding > 0
                        ? <span className="text-xs font-bold text-amber-700">{fmt(c.total_outstanding)}</span>
                        : <span className="text-xs text-green-600 font-medium">✓ Clear</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.total_bad_debt > 0
                        ? <span className="text-xs font-bold text-red-600">{fmt(c.total_bad_debt)}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.active_cases > 0
                        ? <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{c.active_cases} active</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight size={14} className="text-gray-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
