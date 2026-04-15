'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Wallet, TrendingUp, Package, ArrowDownCircle,
  RefreshCw, Loader2, CheckCircle2, Clock
} from 'lucide-react'
import AmountInput from '@/components/ui/AmountInput'
import Modal from '@/components/ui/Modal'

interface PartnerSummary {
  id: string
  partner_id: string
  name: string
  wallet_balance: number
  total_invested: number
  total_profit: number
  total_withdrawn: number
}

interface ContainerSummary {
  container_id: string
  tracking_number: string | null
  trip_title: string
  percentage: number
  status: string
  display_value: number
  partner_revenue_share: number
  partner_profit: number
  sales_status: string
  presale_expected_return: number | null
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PartnerDashboardPage() {
  const [partner, setPartner] = useState<PartnerSummary | null>(null)
  const [containers, setContainers] = useState<ContainerSummary[]>([])
  const [loading, setLoading] = useState(true)

  // Payout request
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [savingPayout, setSavingPayout] = useState(false)
  const [payoutSuccess, setPayoutSuccess] = useState(false)

  // Reinvest request
  const [reinvestOpen, setReinvestOpen] = useState(false)
  const [reinvestAmount, setReinvestAmount] = useState('')
  const [reinvestNote, setReinvestNote] = useState('')
  const [savingReinvest, setSavingReinvest] = useState(false)
  const [reinvestSuccess, setReinvestSuccess] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Find partner linked to this user
    const { data: partnerData } = await supabase
      .from('partners')
      .select('id, partner_id, name, wallet_balance, total_invested, total_profit, total_withdrawn')
      .eq('user_id', user.id)
      .single()

    if (!partnerData) { setLoading(false); return }
    setPartner({
      ...partnerData,
      wallet_balance: Number(partnerData.wallet_balance ?? 0),
      total_invested: Number(partnerData.total_invested ?? 0),
      total_profit: Number(partnerData.total_profit ?? 0),
      total_withdrawn: Number(partnerData.total_withdrawn ?? 0),
    })

    // Load partner containers
    const { data: funders } = await supabase
      .from('container_funders')
      .select('container_id, percentage, display_value_override')
      .eq('funder_id', partnerData.id)
      .eq('funder_type', 'partner')

    if (!funders?.length) { setLoading(false); return }

    const containerIds = funders.map(f => f.container_id)
    const [{ data: containerData }, { data: salesOrders }, { data: presales }] = await Promise.all([
      supabase.from('containers').select('id, container_id, tracking_number, status, trip_id, pieces_purchased, quoted_price_usd, unit_price_usd, shipping_amount_usd, surcharge_ngn, exchange_rate').in('id', containerIds),
      supabase.from('sales_orders').select('container_id, customer_payable').in('container_id', containerIds),
      supabase.from('presales').select('container_id, expected_sale_revenue').in('container_id', containerIds),
    ])

    const tripIds = [...new Set((containerData ?? []).map(c => c.trip_id).filter(Boolean))]
    const { data: trips } = tripIds.length > 0
      ? await supabase.from('trips').select('id, title, waer').in('id', tripIds)
      : { data: [] }

    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const revenueByContainer = (salesOrders ?? []).reduce((acc, so) => {
      acc[so.container_id] = (acc[so.container_id] ?? 0) + Number(so.customer_payable)
      return acc
    }, {} as Record<string, number>)
    const presaleMap = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const containerMap = Object.fromEntries((containerData ?? []).map(c => [c.id, c]))
    const funderMap = Object.fromEntries(funders.map(f => [f.container_id, f]))

    const summaries: ContainerSummary[] = funders.map(f => {
      const c = containerMap[f.container_id]
      if (!c) return null
      const trip = tripMap[c.trip_id]
      const waer = Number(trip?.waer ?? c.exchange_rate ?? 1)
      const pct = Number(f.percentage) / 100
      const piecesP = Number(c.pieces_purchased ?? 0)
      const qpUsd = c.quoted_price_usd ? Number(c.quoted_price_usd) : Number(c.unit_price_usd ?? 0)
      const shippingUsd = Number(c.shipping_amount_usd ?? 0)
      const surchargeNgn = Number(c.surcharge_ngn ?? 0)
      const partnerLandingCost = ((qpUsd * waer * piecesP) + (shippingUsd * waer) + surchargeNgn) * pct
      const displayValue = f.display_value_override ? Number(f.display_value_override) : partnerLandingCost
      const actualRevenue = revenueByContainer[c.id] ?? 0
      const partnerRevenueShare = actualRevenue * pct
      const partnerProfit = partnerRevenueShare - partnerLandingCost
      const presale = presaleMap[c.id]
      const presaleExpectedReturn = presale ? Number(presale.expected_sale_revenue) * pct : null

      let salesStatus = 'not_started'
      if (actualRevenue > 0 && c.status === 'completed') salesStatus = 'completed'
      else if (actualRevenue > 0) salesStatus = 'in_progress'

      return {
        container_id: c.container_id,
        tracking_number: c.tracking_number,
        trip_title: trip?.title ?? '—',
        percentage: Number(f.percentage),
        status: c.status,
        display_value: displayValue,
        partner_revenue_share: partnerRevenueShare,
        partner_profit: partnerProfit,
        sales_status: salesStatus,
        presale_expected_return: presaleExpectedReturn,
      }
    }).filter(Boolean) as ContainerSummary[]

    setContainers(summaries)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function submitPayoutRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!payoutAmount || !partner) return
    setSavingPayout(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const amount = parseFloat(payoutAmount)
    const requestId = `PAY-${Date.now().toString().slice(-6)}`

    await supabase.from('partner_payout_requests').insert({
      request_id: requestId,
      partner_id: partner.id,
      amount,
      status: 'pending',
      requested_by: user?.id,
      notes: payoutNote || null,
    })

    setSavingPayout(false)
    setPayoutOpen(false)
    setPayoutAmount('')
    setPayoutNote('')
    setPayoutSuccess(true)
    setTimeout(() => setPayoutSuccess(false), 4000)
  }

  async function submitReinvestRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!reinvestAmount || !partner) return
    setSavingReinvest(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const amount = parseFloat(reinvestAmount)
    const requestId = `REINV-${Date.now().toString().slice(-6)}`

    await supabase.from('partner_reinvestment_requests').insert({
      request_id: requestId,
      partner_id: partner.id,
      amount,
      status: 'pending',
      requested_by: user?.id,
      notes: reinvestNote || null,
    })

    setSavingReinvest(false)
    setReinvestOpen(false)
    setReinvestAmount('')
    setReinvestNote('')
    setReinvestSuccess(true)
    setTimeout(() => setReinvestSuccess(false), 4000)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!partner) return (
    <div className="text-center py-20">
      <Package size={32} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-400">No partner account linked to your profile.</p>
      <p className="text-xs text-gray-300 mt-1">Contact your administrator to link your account.</p>
    </div>
  )

  const totalDisplayValue = containers.reduce((s, c) => s + c.display_value, 0)
  const totalExpectedReturn = containers.reduce((s, c) => s + (c.presale_expected_return ?? 0), 0)
  const completedContainers = containers.filter(c => c.sales_status === 'completed').length
  const activeContainers = containers.filter(c => c.status !== 'completed').length

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Welcome header */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-brand-200 text-sm font-medium">Welcome back</p>
            <h1 className="text-2xl font-bold mt-0.5">{partner.name}</h1>
            <p className="text-brand-200 text-xs mt-1 font-mono">{partner.partner_id}</p>
          </div>
          <div className="text-right">
            <p className="text-brand-200 text-xs">Wallet balance</p>
            <p className="text-3xl font-bold">{fmt(partner.wallet_balance)}</p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <button onClick={() => setPayoutOpen(true)}
            disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 backdrop-blur-sm">
            <ArrowDownCircle size={15} /> Request payout
          </button>
          <button onClick={() => setReinvestOpen(true)}
            disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 backdrop-blur-sm">
            <RefreshCw size={15} /> Reinvest
          </button>
        </div>
      </div>

      {/* Success banners */}
      {payoutSuccess && (
        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
          <CheckCircle2 size={16} className="text-green-600" />
          <p className="text-sm font-medium text-green-700">Payout request submitted successfully. You will be notified once it is processed.</p>
        </div>
      )}
      {reinvestSuccess && (
        <div className="flex items-center gap-3 p-4 bg-brand-50 rounded-xl border border-brand-200">
          <CheckCircle2 size={16} className="text-brand-600" />
          <p className="text-sm font-medium text-brand-700">Reinvestment request submitted. Our team will allocate your funds to a new container.</p>
        </div>
      )}

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total containers', value: containers.length.toString(), color: 'text-gray-900', icon: <Package size={14} className="text-gray-500" /> },
          { label: 'Portfolio value', value: fmt(totalDisplayValue), color: 'text-blue-700', icon: <Package size={14} className="text-blue-600" /> },
          { label: 'Total profit', value: fmt(partner.total_profit), color: partner.total_profit >= 0 ? 'text-green-700' : 'text-red-600', icon: <TrendingUp size={14} className={partner.total_profit >= 0 ? 'text-green-600' : 'text-red-500'} /> },
          { label: 'Total withdrawn', value: fmt(partner.total_withdrawn), color: 'text-gray-600', icon: <ArrowDownCircle size={14} className="text-gray-400" /> },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-1">{m.icon}<p className="text-xs text-gray-400">{m.label}</p></div>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Container investments */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Your container investments</h2>
          <p className="text-xs text-gray-400 mt-0.5">{containers.length} container{containers.length !== 1 ? 's' : ''} · {activeContainers} active · {completedContainers} completed</p>
        </div>
        {containers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Package size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No containers allocated yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {containers.map(c => {
              const isCompleted = c.sales_status === 'completed'
              const profitPositive = c.partner_profit >= 0
              return (
                <div key={c.container_id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{c.container_id}</span>
                        <span className="text-xs text-gray-500 font-mono">{c.tracking_number ?? '—'}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${c.sales_status === 'completed' ? 'bg-green-50 text-green-700'
                            : c.sales_status === 'in_progress' ? 'bg-amber-50 text-amber-700'
                            : 'bg-gray-100 text-gray-500'}`}>
                          {c.sales_status === 'completed' ? 'Sales completed'
                            : c.sales_status === 'in_progress' ? 'In progress'
                            : 'Not started'}
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                          {c.percentage.toFixed(0)}% stake
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{c.trip_title}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">Investment value</p>
                      <p className="text-sm font-bold text-blue-700">{fmt(c.display_value)}</p>
                    </div>
                  </div>

                  {/* Return metrics */}
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-xs text-gray-400">Expected return</p>
                      <p className="text-sm font-semibold text-gray-700">{c.presale_expected_return ? fmt(c.presale_expected_return) : '—'}</p>
                    </div>
                    <div className={`rounded-lg p-2.5 ${isCompleted ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400">Actual return</p>
                      <p className={`text-sm font-semibold ${c.partner_revenue_share > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                        {c.partner_revenue_share > 0 ? fmt(c.partner_revenue_share) : '—'}
                      </p>
                    </div>
                    {c.partner_revenue_share > 0 && (
                      <div className={`rounded-lg p-2.5 ${profitPositive ? 'bg-green-50' : 'bg-red-50'}`}>
                        <p className="text-xs text-gray-400">Profit</p>
                        <p className={`text-sm font-bold ${profitPositive ? 'text-green-700' : 'text-red-600'}`}>
                          {profitPositive ? '+' : ''}{fmt(c.partner_profit)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Payout request modal */}
      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="Request a payout" size="sm">
        <form onSubmit={submitPayoutRequest} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">Available balance: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-brand-600 mt-0.5">Your request will be reviewed by our team before processing.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to withdraw (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={payoutAmount} onChange={setPayoutAmount}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (optional)</label>
            <textarea rows={2} value={payoutNote} onChange={e => setPayoutNote(e.target.value)}
              placeholder="Any instructions for the payout..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPayoutOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingPayout || !payoutAmount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingPayout ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownCircle size={14} />} Submit request
            </button>
          </div>
        </form>
      </Modal>

      {/* Reinvest modal */}
      <Modal open={reinvestOpen} onClose={() => setReinvestOpen(false)} title="Reinvest funds" size="sm">
        <form onSubmit={submitReinvestRequest} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">Available balance: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-brand-600 mt-0.5">Indicate how much you would like to reinvest. Our team will allocate your funds to an upcoming container.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to reinvest (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={reinvestAmount} onChange={setReinvestAmount}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (optional)</label>
            <textarea rows={2} value={reinvestNote} onChange={e => setReinvestNote(e.target.value)}
              placeholder="Any preferences or instructions..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setReinvestOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingReinvest || !reinvestAmount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingReinvest ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Submit reinvestment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

