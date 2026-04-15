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
  trip_db_id: string
  trip_title: string
  container_status: string
  sale_type: string | null
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
  const [containers, setContainers] = useState<ContainerPartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()

    // Load partnership view
    const { data: viewData } = await supabase
      .from('partnership_container_view')
      .select('*')
      .order('container_ref')

    if (!viewData?.length) { setLoading(false); return }

    // Get unique container IDs
    const containerDbIds = [...new Set(viewData.map(r => r.container_db_id))]

    // Load container statuses, trips, presales, sales
    const [{ data: containerData }, { data: salesOrders }, { data: presales }, { data: trips }] = await Promise.all([
      supabase.from('containers').select('id, status, trip_id').in('id', containerDbIds),
      supabase.from('sales_orders').select('container_id, customer_payable').in('container_id', containerDbIds),
      supabase.from('presales').select('container_id, expected_sale_revenue, sale_type').in('container_id', containerDbIds),
      supabase.from('trips').select('id, trip_id, title').in('id', [...new Set(viewData.map(r => r.trip_id))]),
    ])

    const containerStatusMap = Object.fromEntries((containerData ?? []).map(c => [c.id, c.status]))
    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const presaleMap = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const revenueByContainer = (salesOrders ?? []).reduce((acc, so) => {
      acc[so.container_id] = (acc[so.container_id] ?? 0) + Number(so.customer_payable)
      return acc
    }, {} as Record<string, number>)

    // Group by container
    const containerMap: Record<string, ContainerPartnerRow> = {}
    for (const row of viewData) {
      const actualSales = revenueByContainer[row.container_db_id] ?? 0
      const presale = presaleMap[row.container_db_id]
      const trip = tripMap[row.trip_id]
      const pct = Number(row.percentage) / 100
      const partnerRevShare = actualSales * pct
      const partnerCost = Number(row.partner_quoted_cost_ngn)
      const partnerProfit = partnerRevShare - partnerCost

      if (!containerMap[row.container_db_id]) {
        const status = containerStatusMap[row.container_db_id] ?? 'ordered'
        let salesStatus: ContainerPartnerRow['sales_status'] = 'not_started'
        if (actualSales > 0 && status === 'completed') salesStatus = 'completed'
        else if (actualSales > 0) salesStatus = 'in_progress'

        containerMap[row.container_db_id] = {
          container_db_id: row.container_db_id,
          container_id: row.container_ref,
          tracking_number: row.tracking_number,
          trip_id: trip?.trip_id ?? '—',
          trip_db_id: row.trip_id,
          trip_title: trip?.title ?? '—',
          container_status: status,
          sale_type: presale?.sale_type ?? null,
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
        funder_id: row.partner_db_id,
        funder_name: row.funder_name,
        percentage: Number(row.percentage),
        partner_quoted_cost_ngn: partnerCost,
        amount_received_ngn: Number(row.amount_received_ngn),
        topup_needed_ngn: topup,
        partner_revenue_share: partnerRevShare,
        partner_profit: partnerProfit,
      })
      containerMap[row.container_db_id].partner_count += 1
      containerMap[row.container_db_id].total_topup_needed += Math.max(topup, 0)
    }

    setContainers(Object.values(containerMap))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = containers.filter(c => {
    const matchSearch = search === '' ||
      c.container_id.toLowerCase().includes(search.toLowerCase()) ||
      (c.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      c.trip_id.toLowerCase().includes(search.toLowerCase()) ||
      c.funders.some(f => f.funder_name.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === '' || c.sales_status === statusFilter
    return matchSearch && matchStatus
  })

  // Portfolio metrics
  const totalQuotedCost = filtered.reduce((s, c) => s + c.full_quoted_landing_cost_ngn, 0)
  const totalExpectedRevenue = filtered.reduce((s, c) => s + c.expected_sale_revenue, 0)
  const totalActualSales = filtered.reduce((s, c) => s + c.actual_sales, 0)
  const totalTopupNeeded = filtered.reduce((s, c) => s + c.total_topup_needed, 0)

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Partnership</h1>
        <p className="text-sm text-gray-400 mt-0.5">Partner-funded containers — investment, returns and top-ups</p>
      </div>

      {/* Portfolio metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Containers', value: filtered.length.toString(), icon: <Package size={14} className="text-brand-600" />, color: 'text-gray-900' },
          { label: 'Total quoted cost', value: fmt(totalQuotedCost), icon: <Wallet size={14} className="text-blue-600" />, color: 'text-blue-700' },
          { label: 'Expected revenue', value: fmt(totalExpectedRevenue), icon: <TrendingUp size={14} className="text-green-600" />, color: 'text-green-700' },
          { label: 'Top-up needed', value: fmt(totalTopupNeeded), icon: <AlertTriangle size={14} className={totalTopupNeeded > 0 ? 'text-amber-500' : 'text-green-500'} />, color: totalTopupNeeded > 0 ? 'text-amber-700' : 'text-green-700' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-1">{m.icon}<p className="text-xs text-gray-400">{m.label}</p></div>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by container, tracking number, trip or partner..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
              ${showFilters || statusFilter ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Filter size={15} /> Filters
            {statusFilter && <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">1</span>}
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sales status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All statuses</option>
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Sales completed</option>
              </select>
            </div>
            {statusFilter && (
              <div className="flex items-end pb-0.5">
                <button onClick={() => setStatusFilter('')}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">Clear</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Container table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Container','Tracking No.','Trip','Partners','Container Status','Full Quoted Cost','Expected Revenue','Actual Sales','Total Top-up Needed','Sales Status',''].map(h => (
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center">
                    <Package size={24} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No partner-funded containers found.</p>
                  </td>
                </tr>
              ) : filtered.map(row => {
                const salesCfg = SALES_STATUS_CONFIG[row.sales_status]
                const hasTopup = row.total_topup_needed > 0
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
                      <p className="text-xs text-gray-400 truncate max-w-[100px]">{row.trip_title}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Users size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-600 font-medium">{row.partner_count}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {row.funders.map(f => f.funder_name).join(', ')}
                      </div>
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
                      {hasTopup ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={10} /> {fmt(row.total_topup_needed)}
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 font-medium">Fully funded</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${salesCfg.color}`}>
                        {salesCfg.label}
                      </span>
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
      </div>

      {/* Partner summary section */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Partner summary view</h2>
        <PartnerSummaryTable containers={filtered} />
      </div>
    </div>
  )
}

function PartnerSummaryTable({ containers }: { containers: ContainerPartnerRow[] }) {
  const router = useRouter()

  // Aggregate per partner
  const partnerMap: Record<string, {
    funder_id: string
    funder_name: string
    container_count: number
    total_quoted_cost: number
    total_received: number
    total_topup: number
    total_revenue_share: number
    total_profit: number
  }> = {}

  for (const c of containers) {
    for (const f of c.funders) {
      if (!partnerMap[f.funder_id]) {
        partnerMap[f.funder_id] = {
          funder_id: f.funder_id,
          funder_name: f.funder_name,
          container_count: 0,
          total_quoted_cost: 0,
          total_received: 0,
          total_topup: 0,
          total_revenue_share: 0,
          total_profit: 0,
        }
      }
      partnerMap[f.funder_id].container_count += 1
      partnerMap[f.funder_id].total_quoted_cost += f.partner_quoted_cost_ngn
      partnerMap[f.funder_id].total_received += f.amount_received_ngn
      partnerMap[f.funder_id].total_topup += Math.max(f.topup_needed_ngn, 0)
      partnerMap[f.funder_id].total_revenue_share += f.partner_revenue_share
      partnerMap[f.funder_id].total_profit += f.partner_profit
    }
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const partners = Object.values(partnerMap)
  if (!partners.length) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Partner','Containers','Total investment','Amount received','Top-up needed','Revenue share','Profit',''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {partners.map(p => (
              <tr key={p.funder_id}
                onClick={() => router.push(`/portal/partnership/partner/${p.funder_id}`)}
                className="border-b border-gray-50 hover:bg-brand-50/20 transition-colors cursor-pointer group">
                <td className="px-3 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <span className="text-brand-700 text-xs font-bold">{p.funder_name[0].toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">{p.funder_name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full font-medium">{p.container_count}</span>
                </td>
                <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap text-xs">{fmt(p.total_quoted_cost)}</td>
                <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap text-xs">{fmt(p.total_received)}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {p.total_topup > 0
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} />{fmt(p.total_topup)}</span>
                    : <span className="text-xs text-green-600 font-medium">Fully funded</span>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-xs">
                  {p.total_revenue_share > 0
                    ? <span className="text-blue-700 font-medium">{fmt(p.total_revenue_share)}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {p.total_revenue_share > 0 ? (
                    <span className={`text-xs font-bold ${p.total_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {p.total_profit >= 0 ? '+' : ''}{fmt(p.total_profit)}
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-3 py-3">
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-brand-400 transition-colors" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
