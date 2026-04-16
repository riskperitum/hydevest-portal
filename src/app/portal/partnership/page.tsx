'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Search, Package, TrendingUp, Wallet,
  Users, AlertTriangle, ChevronRight, Filter
} from 'lucide-react'

interface ContainerPartnerRow {
  container_db_id: string
  container_id: string
  tracking_number: string | null
  trip_id: string
  trip_title: string
  container_status: string
  full_quoted_landing_cost_ngn: number
  expected_sale_revenue: number
  actual_sales: number
  partner_count: number
  funders: {
    funder_id: string
    funder_name: string
    percentage: number
    partner_quoted_cost_ngn: number
    amount_received_ngn: number
    topup_needed_ngn: number
    partner_revenue_share: number
    partner_profit: number
  }[]
  total_topup_needed: number
  sales_status: 'not_started' | 'in_progress' | 'completed'
}

interface PartnerSummaryRow {
  partner_db_id: string
  funder_name: string
  container_count: number
  total_quoted_cost: number
  total_allocated: number
  wallet_balance: number
  wallet_allocated: number
  total_revenue_share: number
  total_profit: number
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const SALES_STATUS_CONFIG = {
  not_started: { label: 'Not started',     color: 'bg-gray-100 text-gray-600' },
  in_progress:  { label: 'In progress',     color: 'bg-amber-50 text-amber-700' },
  completed:    { label: 'Sales completed', color: 'bg-green-50 text-green-700' },
}

const CONTAINER_STATUS_COLOR: Record<string, string> = {
  ordered:    'bg-blue-50 text-blue-700',
  in_transit: 'bg-amber-50 text-amber-700',
  arrived:    'bg-purple-50 text-purple-700',
  completed:  'bg-green-50 text-green-700',
}

export default function PartnershipPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'containers' | 'partners'>('containers')
  const [containers, setContainers] = useState<ContainerPartnerRow[]>([])
  const [partnerRows, setPartnerRows] = useState<PartnerSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: viewData } = await supabase
      .from('partnership_container_view')
      .select('*')
      .order('container_ref')

    if (!viewData?.length) { setLoading(false); return }

    const containerDbIds = [...new Set(viewData.map(r => r.container_db_id))]
    const partnerDbIds = [...new Set(viewData.map(r => r.partner_db_id))]

    const [{ data: containerData }, { data: salesOrders }, { data: presales }, { data: trips }, { data: partnerData }] = await Promise.all([
      supabase.from('containers').select('id, status').in('id', containerDbIds),
      supabase.from('sales_orders').select('container_id, customer_payable, payment_status').in('container_id', containerDbIds),
      supabase.from('presales').select('container_id, expected_sale_revenue, sale_type').in('container_id', containerDbIds),
      supabase.from('trips').select('id, trip_id, title').in('id', [...new Set(viewData.map(r => r.trip_id))]),
      supabase.from('partners').select('id, name, wallet_balance, wallet_allocated').in('id', partnerDbIds),
    ])

    const containerStatusMap = Object.fromEntries((containerData ?? []).map(c => [c.id, c.status]))
    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const presaleMap = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const partnerMap = Object.fromEntries((partnerData ?? []).map(p => [p.id, p]))
    const revenueByContainer = (salesOrders ?? []).reduce((acc, so) => {
      acc[so.container_id] = (acc[so.container_id] ?? 0) + Number(so.customer_payable)
      return acc
    }, {} as Record<string, number>)

    const paymentStatusByContainer = (salesOrders ?? []).reduce((acc, so) => {
      if (!acc[so.container_id] || acc[so.container_id] === 'paid') {
        acc[so.container_id] = so.payment_status
      }
      return acc
    }, {} as Record<string, string>)

    // Build container rows
    const containerMap: Record<string, ContainerPartnerRow> = {}
    for (const row of viewData) {
      const actualSales = revenueByContainer[row.container_db_id] ?? 0
      const presale = presaleMap[row.container_db_id]
      const trip = tripMap[row.trip_id]
      const pct = Number(row.percentage) / 100
      const partnerRevShare = actualSales * pct
      const partnerCost = Number(row.partner_quoted_cost_ngn)

      if (!containerMap[row.container_db_id]) {
        const status = containerStatusMap[row.container_db_id] ?? 'ordered'
        const paymentStatus = paymentStatusByContainer[row.container_db_id] ?? paymentStatusByContainer[row?.container_db_id]
        let salesStatus: ContainerPartnerRow['sales_status'] = 'not_started'
        if (actualSales > 0 && paymentStatus === 'paid') salesStatus = 'completed'
        else if (actualSales > 0) salesStatus = 'in_progress'

        containerMap[row.container_db_id] = {
          container_db_id: row.container_db_id,
          container_id: row.container_ref,
          tracking_number: row.tracking_number,
          trip_id: trip?.trip_id ?? '—',
          trip_title: trip?.title ?? '—',
          container_status: status,
          full_quoted_landing_cost_ngn: Number(row.full_quoted_landing_cost_ngn),
          expected_sale_revenue: Number(presale?.expected_sale_revenue ?? 0),
          actual_sales: actualSales,
          partner_count: 0,
          funders: [],
          total_topup_needed: 0,
          sales_status: salesStatus,
        }
      }

      const topup = Number(row.topup_needed_ngn)
      containerMap[row.container_db_id].funders.push({
        funder_id: row.funder_id,
        funder_name: row.funder_name,
        percentage: Number(row.percentage),
        partner_quoted_cost_ngn: partnerCost,
        amount_received_ngn: Number(row.amount_received_ngn),
        topup_needed_ngn: topup,
        partner_revenue_share: partnerRevShare,
        partner_profit: partnerRevShare - partnerCost,
      })
      containerMap[row.container_db_id].partner_count += 1
      containerMap[row.container_db_id].total_topup_needed += Math.max(topup, 0)
    }

    // Build partner summary rows
    const pSummary: Record<string, PartnerSummaryRow> = {}
    for (const row of viewData) {
      const actualSales = revenueByContainer[row.container_db_id] ?? 0
      const pct = Number(row.percentage) / 100
      const partnerRevShare = actualSales * pct
      const partnerCost = Number(row.partner_quoted_cost_ngn)
      const partner = partnerMap[row.partner_db_id]

      if (!pSummary[row.partner_db_id]) {
        pSummary[row.partner_db_id] = {
          partner_db_id: row.partner_db_id,
          funder_name: row.funder_name,
          container_count: 0,
          total_quoted_cost: 0,
          total_allocated: 0,
          wallet_balance: Number(partner?.wallet_balance ?? 0),
          wallet_allocated: Number(partner?.wallet_allocated ?? 0),
          total_revenue_share: 0,
          total_profit: 0,
        }
      }
      pSummary[row.partner_db_id].container_count += 1
      pSummary[row.partner_db_id].total_quoted_cost += partnerCost
      pSummary[row.partner_db_id].total_allocated += Number(row.amount_received_ngn)
      pSummary[row.partner_db_id].total_revenue_share += partnerRevShare
      pSummary[row.partner_db_id].total_profit += partnerRevShare - partnerCost
    }

    setContainers(Object.values(containerMap))
    setPartnerRows(Object.values(pSummary))
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const filteredContainers = containers.filter(c => {
    const matchSearch = search === '' ||
      c.container_id.toLowerCase().includes(search.toLowerCase()) ||
      (c.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      c.trip_id.toLowerCase().includes(search.toLowerCase()) ||
      c.funders.some(f => f.funder_name.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === '' || c.sales_status === statusFilter
    return matchSearch && matchStatus
  })

  const filteredPartners = partnerRows.filter(p =>
    search === '' || p.funder_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalWalletBalance = partnerRows.reduce((s, p) => s + p.wallet_balance, 0)
  const totalAllocated = partnerRows.reduce((s, p) => s + p.wallet_allocated, 0)
  const totalTopup = containers.reduce((s, c) => s + c.total_topup_needed, 0)

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Partnership</h1>
        <p className="text-sm text-gray-400 mt-0.5">Partner investments, wallets and container allocations</p>
      </div>

      {/* Portfolio metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total containers', value: containers.length.toString(), icon: <Package size={14} className="text-brand-600" />, color: 'text-gray-900' },
          { label: 'Partner wallets total', value: fmt(totalWalletBalance), icon: <Wallet size={14} className="text-brand-600" />, color: 'text-brand-700' },
          { label: 'Total allocated', value: fmt(totalAllocated), icon: <TrendingUp size={14} className="text-blue-600" />, color: 'text-blue-700' },
          { label: 'Pending top-ups', value: totalTopup > 0 ? fmt(totalTopup) : 'None', icon: <AlertTriangle size={14} className={totalTopup > 0 ? 'text-amber-500' : 'text-green-500'} />, color: totalTopup > 0 ? 'text-amber-700' : 'text-green-700' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-1">{m.icon}<p className="text-xs text-gray-400">{m.label}</p></div>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Main panel with tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-gray-100">
          {[
            { key: 'containers', label: 'By Container', count: containers.length },
            { key: 'partners', label: 'By Partner', count: partnerRows.length },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => { setActiveTab(tab.key as typeof activeTab); setSearch(''); setStatusFilter('') }}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search + filter bar — inside the panel, below tabs */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={activeTab === 'containers' ? 'Search container, trip or partner...' : 'Search partner...'}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          {activeTab === 'containers' && (
            <button onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs border rounded-lg transition-colors
                ${showFilters || statusFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={13} /> Filter
              {statusFilter && <span className="bg-brand-600 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">1</span>}
            </button>
          )}
        </div>

        {/* Filter row */}
        {showFilters && activeTab === 'containers' && (
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">All sales statuses</option>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Sales completed</option>
            </select>
            {statusFilter && (
              <button onClick={() => setStatusFilter('')} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear</button>
            )}
          </div>
        )}

        {/* CONTAINERS TAB */}
        {activeTab === 'containers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Container','Tracking','Trip','Partners','Status','Full Quoted Cost','Expected Revenue','Actual Sales','Top-up Needed','Sales Status',''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredContainers.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center">
                      <Package size={24} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">No partner-funded containers found.</p>
                    </td>
                  </tr>
                ) : filteredContainers.map(row => {
                  const salesCfg = SALES_STATUS_CONFIG[row.sales_status]
                  return (
                    <tr key={row.container_db_id}
                      onClick={() => router.push(`/portal/partnership/${row.container_db_id}`)}
                      className="border-b border-gray-50 hover:bg-brand-50/20 transition-colors cursor-pointer group">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{row.container_id}</span>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{row.tracking_number ?? '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-700">{row.trip_id}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[90px]">{row.trip_title}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="text-xs text-gray-600 font-medium">{row.partner_count} partner{row.partner_count !== 1 ? 's' : ''}</p>
                        <p className="text-xs text-gray-400">{row.funders.map(f => f.funder_name).join(', ')}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${CONTAINER_STATUS_COLOR[row.container_status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {row.container_status}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap text-xs">{fmt(row.full_quoted_landing_cost_ngn)}</td>
                      <td className="px-3 py-3 text-blue-700 font-medium whitespace-nowrap text-xs">
                        {row.expected_sale_revenue > 0 ? fmt(row.expected_sale_revenue) : '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs">
                        {row.actual_sales > 0
                          ? <span className="text-green-600 font-medium">{fmt(row.actual_sales)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.total_topup_needed > 0
                          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} />{fmt(row.total_topup_needed)}</span>
                          : <span className="text-xs text-green-600 font-medium">Funded</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${salesCfg.color}`}>{salesCfg.label}</span>
                      </td>
                      <td className="px-3 py-3">
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-brand-400 transition-colors" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PARTNERS TAB */}
        {activeTab === 'partners' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Partner','Containers','Wallet balance','Allocated to containers','Total investment','Revenue share','Profit',''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredPartners.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <Users size={24} className="text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">No partners found.</p>
                    </td>
                  </tr>
                ) : filteredPartners.map(p => (
                  <tr key={p.partner_db_id}
                    onClick={() => router.push(`/portal/partnership/partner/${p.partner_db_id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/20 transition-colors cursor-pointer group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                          <span className="text-brand-700 text-xs font-bold">{p.funder_name[0].toUpperCase()}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">{p.funder_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full font-medium text-gray-600">{p.container_count}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-sm font-bold ${p.wallet_balance > 0 ? 'text-brand-700' : 'text-gray-400'}`}>
                        {fmt(p.wallet_balance)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-blue-700 font-medium whitespace-nowrap text-xs">{fmt(p.wallet_allocated)}</td>
                    <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap text-xs">{fmt(p.total_quoted_cost)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs">
                      {p.total_revenue_share > 0
                        ? <span className="text-green-600 font-medium">{fmt(p.total_revenue_share)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {p.total_revenue_share > 0
                        ? <span className={`text-xs font-bold ${p.total_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {p.total_profit >= 0 ? '+' : ''}{fmt(p.total_profit)}
                          </span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-brand-400 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteredPartners.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-brand-100">
                    <td className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Totals</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-gray-700">{filteredPartners.reduce((s,p)=>s+p.container_count,0)}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-brand-700 whitespace-nowrap">{fmt(filteredPartners.reduce((s,p)=>s+p.wallet_balance,0))}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-blue-700 whitespace-nowrap">{fmt(filteredPartners.reduce((s,p)=>s+p.wallet_allocated,0))}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-gray-700 whitespace-nowrap">{fmt(filteredPartners.reduce((s,p)=>s+p.total_quoted_cost,0))}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(filteredPartners.reduce((s,p)=>s+p.total_revenue_share,0))}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(filteredPartners.reduce((s,p)=>s+p.total_profit,0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
