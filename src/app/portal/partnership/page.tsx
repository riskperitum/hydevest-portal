'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Users, TrendingUp, Wallet, ArrowDownCircle,
  Search, Package, ChevronRight, Plus
} from 'lucide-react'

interface PartnerRow {
  id: string
  partner_id: string
  name: string
  email: string | null
  phone: string | null
  wallet_balance: number
  total_invested: number
  total_profit: number
  total_withdrawn: number
  is_active: boolean
  container_count: number
  active_containers: number
  completed_containers: number
  total_due: number
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PartnershipPage() {
  const router = useRouter()
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: partnerData }, { data: funders }, { data: containers }, { data: salesOrders }] = await Promise.all([
      supabase.from('partners').select('*').order('name'),
      supabase.from('container_funders').select('partner_id:funder_id, container_id, percentage').eq('funder_type', 'partner'),
      supabase.from('containers').select('id, container_id, status, trip_id'),
      supabase.from('sales_orders').select('container_id, customer_payable'),
    ])

    // Get WAER per trip
    const tripIds = [...new Set((containers ?? []).map(c => c.trip_id).filter(Boolean))]
    const { data: trips } = tripIds.length > 0
      ? await supabase.from('trips').select('id, waer').in('id', tripIds)
      : { data: [] }
    const waerMap = Object.fromEntries((trips ?? []).map(t => [t.id, Number(t.waer ?? 1)]))

    // Get presales for expected revenue
    const containerIds = [...new Set((funders ?? []).map(f => f.container_id))]
    const { data: presales } = containerIds.length > 0
      ? await supabase.from('presales').select('container_id, expected_sale_revenue, status').in('container_id', containerIds)
      : { data: [] }

    const presaleMap = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const containerMap = Object.fromEntries((containers ?? []).map(c => [c.id, c]))

    // Revenue per container
    const revenueByContainer = (salesOrders ?? []).reduce((acc, so) => {
      acc[so.container_id] = (acc[so.container_id] ?? 0) + Number(so.customer_payable)
      return acc
    }, {} as Record<string, number>)

    // Group funders by partner
    const fundersByPartner = (funders ?? []).reduce((acc, f) => {
      if (!acc[f.partner_id]) acc[f.partner_id] = []
      acc[f.partner_id].push(f)
      return acc
    }, {} as Record<string, typeof funders[0][]>)

    const rows: PartnerRow[] = (partnerData ?? []).map(partner => {
      const pFunders = fundersByPartner[partner.id] ?? []
      const containerIds = pFunders.map(f => f.container_id)
      const pContainers = containerIds.map(id => containerMap[id]).filter(Boolean)

      const activeContainers = pContainers.filter(c => c.status !== 'completed').length
      const completedContainers = pContainers.filter(c => c.status === 'completed').length

      // Total due = sum of (actual_revenue × percentage) across all containers with sales
      const totalDue = pFunders.reduce((s, f) => {
        const rev = revenueByContainer[f.container_id] ?? 0
        return s + rev * (Number(f.percentage) / 100)
      }, 0)

      return {
        id: partner.id,
        partner_id: partner.partner_id,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        wallet_balance: Number(partner.wallet_balance ?? 0),
        total_invested: Number(partner.total_invested ?? 0),
        total_profit: Number(partner.total_profit ?? 0),
        total_withdrawn: Number(partner.total_withdrawn ?? 0),
        is_active: partner.is_active,
        container_count: pContainers.length,
        active_containers: activeContainers,
        completed_containers: completedContainers,
        total_due: totalDue,
      }
    })

    setPartners(rows)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = partners.filter(p =>
    search === '' ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.partner_id.toLowerCase().includes(search.toLowerCase()) ||
    (p.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalWallet = filtered.reduce((s, p) => s + p.wallet_balance, 0)
  const totalInvested = filtered.reduce((s, p) => s + p.total_invested, 0)
  const totalProfit = filtered.reduce((s, p) => s + p.total_profit, 0)
  const totalWithdrawn = filtered.reduce((s, p) => s + p.total_withdrawn, 0)

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Partnership</h1>
          <p className="text-sm text-gray-400 mt-0.5">Partner investments, returns and wallet balances</p>
        </div>
      </div>

      {/* Portfolio metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total partners', value: filtered.length.toString(), icon: <Users size={14} className="text-brand-600" />, color: 'text-gray-900' },
          { label: 'Total invested', value: fmt(totalInvested), icon: <Package size={14} className="text-blue-600" />, color: 'text-blue-700' },
          { label: 'Total profit', value: fmt(totalProfit), icon: <TrendingUp size={14} className="text-green-600" />, color: 'text-green-700' },
          { label: 'Total wallet balance', value: fmt(totalWallet), icon: <Wallet size={14} className="text-brand-600" />, color: 'text-brand-700' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-1">{m.icon}<p className="text-xs text-gray-400">{m.label}</p></div>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search partners by name, ID or email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      {/* Partner cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-8 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <Users size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No partners found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(partner => {
            const profitIsPositive = partner.total_profit >= 0
            const walletPct = partner.total_invested > 0
              ? Math.min((partner.wallet_balance / partner.total_invested) * 100, 100)
              : 0

            return (
              <div key={partner.id}
                onClick={() => router.push(`/portal/partnership/${partner.id}`)}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden">

                {/* Card header */}
                <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-brand-50/40 to-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                        <span className="text-brand-700 text-base font-bold">{partner.name[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{partner.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{partner.partner_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${partner.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {partner.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-brand-400 transition-colors" />
                    </div>
                  </div>

                  {/* Contact */}
                  {(partner.email || partner.phone) && (
                    <p className="text-xs text-gray-400 mt-2 truncate">{partner.email ?? partner.phone}</p>
                  )}
                </div>

                {/* Metrics grid */}
                <div className="px-5 py-3 grid grid-cols-2 gap-3 border-t border-gray-50">
                  <div>
                    <p className="text-xs text-gray-400">Total invested</p>
                    <p className="text-sm font-semibold text-blue-700 truncate">{fmt(partner.total_invested)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Total profit</p>
                    <p className={`text-sm font-semibold truncate ${profitIsPositive ? 'text-green-600' : 'text-red-500'}`}>
                      {profitIsPositive ? '+' : ''}{fmt(partner.total_profit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Wallet balance</p>
                    <p className="text-sm font-bold text-brand-700 truncate">{fmt(partner.wallet_balance)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Withdrawn</p>
                    <p className="text-sm font-medium text-gray-600 truncate">{fmt(partner.total_withdrawn)}</p>
                  </div>
                </div>

                {/* Container counts */}
                <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-3 flex-wrap">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                    {partner.container_count} container{partner.container_count !== 1 ? 's' : ''}
                  </span>
                  {partner.active_containers > 0 && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {partner.active_containers} active
                    </span>
                  )}
                  {partner.completed_containers > 0 && (
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {partner.completed_containers} completed
                    </span>
                  )}
                </div>

                {/* Wallet progress bar */}
                {partner.total_invested > 0 && (
                  <div className="px-5 pb-4 pt-1 border-t border-gray-50">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Wallet vs invested</span>
                      <span>{walletPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${walletPct >= 100 ? 'bg-green-500' : 'bg-brand-400'}`}
                        style={{ width: `${walletPct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
