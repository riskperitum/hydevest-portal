'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Wallet, TrendingUp,
  Package, ArrowDownCircle, RefreshCw,
  Pencil, CheckCircle2, X, Plus, Check,
  AlertTriangle, CreditCard
} from 'lucide-react'
import Link from 'next/link'
import AmountInput from '@/components/ui/AmountInput'
import Modal from '@/components/ui/Modal'

interface Partner {
  id: string
  partner_id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  wallet_balance: number
  total_invested: number
  total_profit: number
  total_withdrawn: number
  is_active: boolean
  notes: string | null
}

interface ContainerInvestment {
  funder_id: string
  container_id: string
  container_db_id: string
  tracking_number: string | null
  trip_id: string
  trip_title: string
  percentage: number
  status: string
  pieces_purchased: number
  unit_price_usd: number
  quoted_price_usd: number | null
  shipping_amount_usd: number | null
  surcharge_ngn: number | null
  exchange_rate: number
  waer: number
  display_value_override: number | null
  display_value_note: string | null
  // Calculated
  partner_landing_cost: number
  partner_display_value: number
  actual_revenue: number
  partner_revenue_share: number
  partner_profit: number
  sales_status: string
  presale_expected_revenue: number | null
}

interface WalletTransaction {
  id: string
  type: string
  amount: number
  description: string | null
  reference_ref: string | null
  created_at: string
}

interface PayoutRequest {
  id: string
  request_id: string
  amount: number
  status: string
  notes: string | null
  created_at: string
}

interface ReinvestRequest {
  id: string
  request_id: string
  amount: number
  status: string
  notes: string | null
  created_at: string
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CONTAINER_STATUS_COLOR: Record<string, string> = {
  ordered:   'bg-blue-50 text-blue-700',
  in_transit:'bg-amber-50 text-amber-700',
  arrived:   'bg-purple-50 text-purple-700',
  completed: 'bg-green-50 text-green-700',
}

const PAYOUT_STATUS_COLOR: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-600',
  paid:     'bg-green-50 text-green-700',
}

export default function PartnerDrilldownPage() {
  const params = useParams()
  const router = useRouter()
  const partnerId = params.id as string

  const [partner, setPartner] = useState<Partner | null>(null)
  const [containers, setContainers] = useState<ContainerInvestment[]>([])
  const [walletTxns, setWalletTxns] = useState<WalletTransaction[]>([])
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([])
  const [reinvestRequests, setReinvestRequests] = useState<ReinvestRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'containers' | 'wallet' | 'payouts' | 'reinvestments'>('containers')
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  // Edit display value modal
  const [editDisplayOpen, setEditDisplayOpen] = useState(false)
  const [editDisplayFunder, setEditDisplayFunder] = useState<ContainerInvestment | null>(null)
  const [editDisplayValue, setEditDisplayValue] = useState('')
  const [editDisplayNote, setEditDisplayNote] = useState('')
  const [savingDisplay, setSavingDisplay] = useState(false)

  // Credit wallet modal (admin crediting partner wallet on container sale)
  const [creditOpen, setCreditOpen] = useState(false)
  const [creditForm, setCreditForm] = useState({ container_db_id: '', amount: '', description: '' })
  const [savingCredit, setSavingCredit] = useState(false)

  // Payout modal
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [payoutForm, setPayoutForm] = useState({ amount: '', notes: '', assignee: '' })
  const [savingPayout, setSavingPayout] = useState(false)

  // Reinvest modal
  const [reinvestOpen, setReinvestOpen] = useState(false)
  const [reinvestForm, setReinvestForm] = useState({ amount: '', notes: '' })
  const [savingReinvest, setSavingReinvest] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: partnerData }, { data: funders }, { data: walletData }, { data: payoutData }, { data: reinvestData }, { data: allProfiles }] = await Promise.all([
      supabase.from('partners').select('*').eq('id', partnerId).single(),
      supabase.from('container_funders')
        .select('funder_id, container_id, percentage, display_value_override, display_value_note')
        .eq('funder_id', partnerId).eq('funder_type', 'partner'),
      supabase.from('partner_wallet_transactions')
        .select('id, type, amount, description, reference_ref, created_at')
        .eq('partner_id', partnerId).order('created_at', { ascending: false }),
      supabase.from('partner_payout_requests')
        .select('id, request_id, amount, status, notes, created_at')
        .eq('partner_id', partnerId).order('created_at', { ascending: false }),
      supabase.from('partner_reinvestment_requests')
        .select('id, request_id, amount, status, notes, created_at')
        .eq('partner_id', partnerId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
    ])

    setPartner(partnerData)
    setWalletTxns(walletData ?? [])
    setPayoutRequests((payoutData ?? []).map(p => ({ ...p, amount: Number(p.amount) })))
    setReinvestRequests((reinvestData ?? []).map(r => ({ ...r, amount: Number(r.amount) })))
    setProfiles(allProfiles ?? [])

    // Load container details
    const containerIds = (funders ?? []).map(f => f.container_id)
    if (!containerIds.length) { setLoading(false); return }

    const [{ data: containerData }, { data: salesOrders }, { data: presales }] = await Promise.all([
      supabase.from('containers').select('id, container_id, tracking_number, status, trip_id, pieces_purchased, unit_price_usd, quoted_price_usd, shipping_amount_usd, surcharge_ngn, exchange_rate, estimated_landing_cost').in('id', containerIds),
      supabase.from('sales_orders').select('container_id, customer_payable').in('container_id', containerIds),
      supabase.from('presales').select('container_id, expected_sale_revenue, status').in('container_id', containerIds),
    ])

    // Get trips for WAER
    const tripIds = [...new Set((containerData ?? []).map(c => c.trip_id).filter(Boolean))]
    const { data: trips } = tripIds.length > 0
      ? await supabase.from('trips').select('id, trip_id, title, waer').in('id', tripIds)
      : { data: [] }

    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const revenueByContainer = (salesOrders ?? []).reduce((acc, so) => {
      acc[so.container_id] = (acc[so.container_id] ?? 0) + Number(so.customer_payable)
      return acc
    }, {} as Record<string, number>)
    const presaleMap = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const funderMap = Object.fromEntries((funders ?? []).map(f => [f.container_id, f]))
    const containerMap = Object.fromEntries((containerData ?? []).map(c => [c.id, c]))

    const investments: ContainerInvestment[] = (funders ?? []).map(f => {
      const c = containerMap[f.container_id]
      if (!c) return null
      const trip = tripMap[c.trip_id]
      const waer = Number(trip?.waer ?? c.exchange_rate ?? 1)
      const pct = Number(f.percentage) / 100
      const piecesP = Number(c.pieces_purchased ?? 0)
      const qpUsd = c.quoted_price_usd ? Number(c.quoted_price_usd) : Number(c.unit_price_usd ?? 0)
      const shippingUsd = Number(c.shipping_amount_usd ?? 0)
      const surchargeNgn = Number(c.surcharge_ngn ?? 0)

      // Partner landing cost = (quoted_price_usd × WAER × pieces + shipping_usd × WAER + surcharge_ngn) × percentage
      const partnerLandingCost = ((qpUsd * waer * piecesP) + (shippingUsd * waer) + surchargeNgn) * pct

      // Actual revenue
      const actualRevenue = revenueByContainer[c.id] ?? 0
      const partnerRevenueShare = actualRevenue * pct
      const partnerProfit = partnerRevenueShare - partnerLandingCost

      // Display value — use override if set, else partner landing cost
      const displayValue = f.display_value_override ? Number(f.display_value_override) : partnerLandingCost

      // Sales status
      const presale = presaleMap[c.id]
      let salesStatus = 'not_started'
      if (actualRevenue > 0 && c.status === 'completed') salesStatus = 'completed'
      else if (actualRevenue > 0) salesStatus = 'in_progress'

      return {
        funder_id: f.funder_id,
        container_id: c.container_id,
        container_db_id: c.id,
        tracking_number: c.tracking_number,
        trip_id: trip?.trip_id ?? '—',
        trip_title: trip?.title ?? '—',
        percentage: Number(f.percentage),
        status: c.status,
        pieces_purchased: piecesP,
        unit_price_usd: Number(c.unit_price_usd ?? 0),
        quoted_price_usd: c.quoted_price_usd ? Number(c.quoted_price_usd) : null,
        shipping_amount_usd: c.shipping_amount_usd ? Number(c.shipping_amount_usd) : null,
        surcharge_ngn: c.surcharge_ngn ? Number(c.surcharge_ngn) : null,
        exchange_rate: Number(c.exchange_rate ?? 1),
        waer,
        display_value_override: f.display_value_override ? Number(f.display_value_override) : null,
        display_value_note: f.display_value_note,
        partner_landing_cost: partnerLandingCost,
        partner_display_value: displayValue,
        actual_revenue: actualRevenue,
        partner_revenue_share: partnerRevenueShare,
        partner_profit: partnerProfit,
        sales_status: salesStatus,
        presale_expected_revenue: presale ? Number(presale.expected_sale_revenue) : null,
      }
    }).filter(Boolean) as ContainerInvestment[]

    setContainers(investments)
    setLoading(false)
  }, [partnerId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  async function saveDisplayValue(e: React.FormEvent) {
    e.preventDefault()
    if (!editDisplayFunder) return
    setSavingDisplay(true)
    const supabase = createClient()
    await supabase.from('container_funders')
      .update({
        display_value_override: editDisplayValue ? parseFloat(editDisplayValue) : null,
        display_value_note: editDisplayNote || null,
      })
      .eq('funder_id', partnerId)
      .eq('container_id', editDisplayFunder.container_db_id)
      .eq('funder_type', 'partner')
    setSavingDisplay(false)
    setEditDisplayOpen(false)
    setEditDisplayFunder(null)
    load()
  }

  async function creditWallet(e: React.FormEvent) {
    e.preventDefault()
    if (!creditForm.amount) return
    setSavingCredit(true)
    const supabase = createClient()
    const amount = parseFloat(creditForm.amount)
    const container = containers.find(c => c.container_db_id === creditForm.container_db_id)

    await supabase.from('partner_wallet_transactions').insert({
      partner_id: partnerId,
      type: 'credit',
      amount,
      description: creditForm.description || `Container sale proceeds — ${container?.container_id ?? ''}`,
      reference_type: 'container',
      reference_id: creditForm.container_db_id || null,
      reference_ref: container?.container_id ?? null,
      performed_by: currentUser?.id,
    })

    // Update partner wallet balance
    await supabase.from('partners').update({
      wallet_balance: (partner?.wallet_balance ?? 0) + amount,
    }).eq('id', partnerId)

    setSavingCredit(false)
    setCreditOpen(false)
    setCreditForm({ container_db_id: '', amount: '', description: '' })
    load()
  }

  async function submitPayoutRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!payoutForm.amount || !payoutForm.assignee) return
    setSavingPayout(true)
    const supabase = createClient()
    const amount = parseFloat(payoutForm.amount)
    const seq = await supabase.rpc('nextval', { seq_name: 'partner_payout_request_seq' }).then(r => r.data ?? 1)
    const requestId = `PAY-${String(seq).padStart(4, '0')}`

    const { data: req } = await supabase.from('partner_payout_requests').insert({
      request_id: requestId,
      partner_id: partnerId,
      amount,
      status: 'pending',
      requested_by: currentUser?.id,
      assigned_to: payoutForm.assignee,
      notes: payoutForm.notes || null,
    }).select().single()

    await supabase.from('tasks').insert({
      type: 'approval_request',
      title: `Partner payout request — ${partner?.name} (${requestId})`,
      description: `Payout of ${fmt(amount)} requested for partner ${partner?.name}`,
      module: 'partner_payouts',
      record_id: req?.id,
      record_ref: requestId,
      requested_by: currentUser?.id,
      assigned_to: payoutForm.assignee,
      priority: 'normal',
    })

    await supabase.from('notifications').insert({
      user_id: payoutForm.assignee,
      type: 'task_approval_request',
      title: `Payout request — ${partner?.name}`,
      message: `${fmt(amount)} payout requested`,
      record_id: req?.id,
      module: 'partner_payouts',
    })

    setSavingPayout(false)
    setPayoutOpen(false)
    setPayoutForm({ amount: '', notes: '', assignee: '' })
    load()
  }

  async function submitReinvestRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!reinvestForm.amount) return
    setSavingReinvest(true)
    const supabase = createClient()
    const amount = parseFloat(reinvestForm.amount)
    const seq = Date.now()
    const requestId = `REINV-${String(seq).slice(-6)}`

    await supabase.from('partner_reinvestment_requests').insert({
      request_id: requestId,
      partner_id: partnerId,
      amount,
      status: 'pending',
      requested_by: currentUser?.id,
      notes: reinvestForm.notes || null,
    })

    // Debit wallet — money moves to reinvestment pool
    await supabase.from('partner_wallet_transactions').insert({
      partner_id: partnerId,
      type: 'reinvestment',
      amount: -amount,
      description: `Reinvestment request — ${requestId}`,
      reference_type: 'reinvestment',
      reference_ref: requestId,
      performed_by: currentUser?.id,
    })

    await supabase.from('partners').update({
      wallet_balance: Math.max((partner?.wallet_balance ?? 0) - amount, 0),
    }).eq('id', partnerId)

    setSavingReinvest(false)
    setReinvestOpen(false)
    setReinvestForm({ amount: '', notes: '' })
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )
  if (!partner) return <div className="text-center py-16 text-gray-400">Partner not found.</div>

  const totalExpectedReturn = containers.reduce((s, c) => s + (c.presale_expected_revenue ? c.presale_expected_revenue * (c.percentage / 100) : 0), 0)
  const totalActualReturn = containers.reduce((s, c) => s + c.partner_revenue_share, 0)
  const totalProfit = containers.reduce((s, c) => s + c.partner_profit, 0)
  const totalDisplayValue = containers.reduce((s, c) => s + c.partner_display_value, 0)

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/partnership"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
              <span className="text-brand-700 text-lg font-bold">{partner.name[0].toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{partner.name}</h1>
              <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                <span className="font-mono">{partner.partner_id}</span>
                {partner.email && <><span>·</span><span>{partner.email}</span></>}
                {partner.phone && <><span>·</span><span>{partner.phone}</span></>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCreditOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-green-200 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
            <Plus size={14} /> Credit wallet
          </button>
          <button onClick={() => setPayoutOpen(true)}
            disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
            <ArrowDownCircle size={14} /> Request payout
          </button>
          <button onClick={() => setReinvestOpen(true)}
            disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-brand-200 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} /> Reinvest
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Wallet balance', value: fmt(partner.wallet_balance), color: 'text-brand-700', icon: <Wallet size={14} className="text-brand-600" />, bg: 'bg-brand-50' },
          { label: 'Total display value', value: fmt(totalDisplayValue), color: 'text-blue-700', icon: <Package size={14} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Total profit', value: fmt(totalProfit), color: totalProfit >= 0 ? 'text-green-700' : 'text-red-600', icon: <TrendingUp size={14} className={totalProfit >= 0 ? 'text-green-600' : 'text-red-500'} />, bg: totalProfit >= 0 ? 'bg-green-50' : 'bg-red-50' },
          { label: 'Total withdrawn', value: fmt(partner.total_withdrawn), color: 'text-gray-700', icon: <ArrowDownCircle size={14} className="text-gray-500" />, bg: 'bg-gray-50' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
            <div className="flex items-center gap-2 mb-1.5">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {[
            { key: 'containers', label: 'Containers', count: containers.length },
            { key: 'wallet', label: 'Wallet', count: walletTxns.length },
            { key: 'payouts', label: 'Payout requests', count: payoutRequests.length },
            { key: 'reinvestments', label: 'Reinvestments', count: reinvestRequests.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Containers tab */}
        {activeTab === 'containers' && (
          <div className="overflow-x-auto">
            {containers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Package size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No containers allocated to this partner.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Container','Trip','%','Status','Landing cost (partner)','Display value','Expected return','Actual revenue share','Profit','Sales status',''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {containers.map(c => {
                    const profitPositive = c.partner_profit >= 0
                    const hasOverride = c.display_value_override != null
                    return (
                      <tr key={c.container_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <p className="font-mono text-xs font-semibold text-brand-700">{c.container_id}</p>
                          <p className="text-xs text-gray-400 font-mono">{c.tracking_number ?? '—'}</p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <p className="text-xs font-medium text-gray-700">{c.trip_id}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[100px]">{c.trip_title}</p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-xs font-semibold text-gray-700">{c.percentage.toFixed(0)}%</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONTAINER_STATUS_COLOR[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 font-medium">
                          {fmt(c.partner_landing_cost)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className={`text-xs font-semibold ${hasOverride ? 'text-blue-700' : 'text-gray-700'}`}>
                              {fmt(c.partner_display_value)}
                            </span>
                            {hasOverride && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-1 rounded" title={c.display_value_note ?? ''}>✎</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">
                          {c.presale_expected_revenue
                            ? fmt(c.presale_expected_revenue * (c.percentage / 100))
                            : '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-semibold ${c.actual_revenue > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                            {c.actual_revenue > 0 ? fmt(c.partner_revenue_share) : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {c.actual_revenue > 0 ? (
                            <span className={`text-xs font-bold ${profitPositive ? 'text-green-600' : 'text-red-500'}`}>
                              {profitPositive ? '+' : ''}{fmt(c.partner_profit)}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                            ${c.sales_status === 'completed' ? 'bg-green-50 text-green-700'
                              : c.sales_status === 'in_progress' ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-100 text-gray-500'}`}>
                            {c.sales_status === 'completed' ? 'Sales completed'
                              : c.sales_status === 'in_progress' ? 'In progress'
                              : 'Not started'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <button
                            onClick={() => { setEditDisplayFunder(c); setEditDisplayValue(c.display_value_override?.toString() ?? ''); setEditDisplayNote(c.display_value_note ?? ''); setEditDisplayOpen(true) }}
                            className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors"
                            title="Edit display value">
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Wallet tab */}
        {activeTab === 'wallet' && (
          <div className="overflow-x-auto">
            <div className="px-5 py-3 bg-brand-50/30 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Current wallet balance</p>
                <p className="text-lg font-bold text-brand-700">{fmt(partner.wallet_balance)}</p>
              </div>
              <button onClick={() => setCreditOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                <Plus size={12} /> Credit wallet
              </button>
            </div>
            {walletTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Wallet size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No wallet transactions yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Type','Amount','Description','Reference','Date'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {walletTxns.map(txn => {
                    const isCredit = txn.amount > 0
                    return (
                      <tr key={txn.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize
                            ${txn.type === 'credit' ? 'bg-green-50 text-green-700'
                              : txn.type === 'debit' || txn.type === 'payout' ? 'bg-red-50 text-red-600'
                              : 'bg-brand-50 text-brand-700'}`}>
                            {txn.type}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-500'}`}>
                            {isCredit ? '+' : ''}{fmt(Math.abs(txn.amount))}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600 max-w-[200px] truncate">{txn.description ?? '—'}</td>
                        <td className="px-3 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">{txn.reference_ref ?? '—'}</td>
                        <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(txn.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Payouts tab */}
        {activeTab === 'payouts' && (
          <div className="overflow-x-auto">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-end">
              <button onClick={() => setPayoutOpen(true)}
                disabled={partner.wallet_balance <= 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <ArrowDownCircle size={12} /> New payout request
              </button>
            </div>
            {payoutRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <ArrowDownCircle size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No payout requests yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Request ID','Amount','Status','Notes','Date'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payoutRequests.map(req => (
                    <tr key={req.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{req.request_id}</span>
                      </td>
                      <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{fmt(req.amount)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PAYOUT_STATUS_COLOR[req.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[200px] truncate">{req.notes ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Reinvestments tab */}
        {activeTab === 'reinvestments' && (
          <div className="overflow-x-auto">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-end">
              <button onClick={() => setReinvestOpen(true)}
                disabled={partner.wallet_balance <= 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <RefreshCw size={12} /> New reinvestment
              </button>
            </div>
            {reinvestRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <RefreshCw size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No reinvestment requests yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Request ID','Amount','Status','Notes','Date'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reinvestRequests.map(req => (
                    <tr key={req.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{req.request_id}</span>
                      </td>
                      <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{fmt(req.amount)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${req.status === 'allocated' ? 'bg-green-50 text-green-700'
                            : req.status === 'cancelled' ? 'bg-red-50 text-red-600'
                            : 'bg-amber-50 text-amber-700'}`}>
                          {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[200px] truncate">{req.notes ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Edit display value modal */}
      <Modal open={editDisplayOpen} onClose={() => setEditDisplayOpen(false)}
        title="Edit display value" description={editDisplayFunder?.container_id ?? ''} size="sm">
        <form onSubmit={saveDisplayValue} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">
              Calculated landing cost: <span className="font-bold">{editDisplayFunder ? fmt(editDisplayFunder.partner_landing_cost) : '—'}</span>
            </p>
            <p className="text-xs text-brand-600 mt-0.5">Override this to show a custom value to the partner.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display value (NGN)</label>
            <AmountInput value={editDisplayValue} onChange={setEditDisplayValue}
              placeholder="Leave blank to use calculated value"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (internal)</label>
            <input value={editDisplayNote} onChange={e => setEditDisplayNote(e.target.value)}
              placeholder="Reason for override..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditDisplayOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingDisplay}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingDisplay ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
          </div>
        </form>
      </Modal>

      {/* Credit wallet modal */}
      <Modal open={creditOpen} onClose={() => setCreditOpen(false)} title="Credit partner wallet" size="sm">
        <form onSubmit={creditWallet} className="space-y-4">
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-green-700 font-medium">Current balance: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Related container (optional)</label>
            <select value={creditForm.container_db_id} onChange={e => {
              const c = containers.find(c => c.container_db_id === e.target.value)
              setCreditForm(f => ({
                ...f,
                container_db_id: e.target.value,
                amount: c ? c.partner_revenue_share.toFixed(2) : f.amount,
                description: c ? `Container sale proceeds — ${c.container_id}` : f.description,
              }))
            }} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">No container reference</option>
              {containers.filter(c => c.actual_revenue > 0).map(c => (
                <option key={c.container_db_id} value={c.container_db_id}>
                  {c.container_id} — share: {fmt(c.partner_revenue_share)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={creditForm.amount} onChange={v => setCreditForm(f => ({ ...f, amount: v }))}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <input value={creditForm.description} onChange={e => setCreditForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Container sale proceeds..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setCreditOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingCredit || !creditForm.amount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingCredit ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Credit wallet
            </button>
          </div>
        </form>
      </Modal>

      {/* Payout request modal */}
      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="Request payout" size="sm">
        <form onSubmit={submitPayoutRequest} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">Available balance: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={payoutForm.amount} onChange={v => setPayoutForm(f => ({ ...f, amount: v }))}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign approval to <span className="text-red-400">*</span></label>
            <select required value={payoutForm.assignee} onChange={e => setPayoutForm(f => ({ ...f, assignee: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">Select approver...</option>
              {profiles.filter(p => p.id !== currentUser?.id).map(p => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea rows={2} value={payoutForm.notes} onChange={e => setPayoutForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPayoutOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingPayout || !payoutForm.amount || !payoutForm.assignee}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingPayout ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownCircle size={14} />} Submit request
            </button>
          </div>
        </form>
      </Modal>

      {/* Reinvest modal */}
      <Modal open={reinvestOpen} onClose={() => setReinvestOpen(false)} title="Reinvest from wallet" size="sm">
        <form onSubmit={submitReinvestRequest} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">Available balance: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-brand-600 mt-0.5">The amount will be moved to the reinvestment pool. Admin will allocate it to a new container.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={reinvestForm.amount} onChange={v => setReinvestForm(f => ({ ...f, amount: v }))}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea rows={2} value={reinvestForm.notes} onChange={e => setReinvestForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any instructions for the reinvestment..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setReinvestOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingReinvest || !reinvestForm.amount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingReinvest ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reinvest
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

