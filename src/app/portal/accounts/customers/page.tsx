'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, Users, ChevronRight, TrendingUp, AlertTriangle } from 'lucide-react'

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
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function CustomerProfilesPage() {
  const router  = useRouter()
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [
      { data: customerData },
      { data: ordersData },
      { data: badDebtData },
      { data: legalData },
      { data: palletData },
    ] = await Promise.all([
      supabase.from('customers').select('id, customer_id, name, phone, address, is_active').order('name'),
      supabase.from('sales_orders').select('id, customer_id, sale_type, container_id, customer_payable, outstanding_balance, payment_status, container:containers(container_id, tracking_number)'),
      supabase.from('bad_debts').select('customer_id, amount_ngn, status'),
      supabase.from('legal_case_customers').select('customer_id, case:legal_cases!legal_case_customers_case_id_fkey(id, status)'),
      supabase.from('sales_order_pallets').select('order_id, pallets_sold'),
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
    })))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = customers.filter(c =>
    search === '' ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_id.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  )

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

      <div className="relative max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, ID or phone..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
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
