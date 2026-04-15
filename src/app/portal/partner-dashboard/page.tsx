'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Wallet, TrendingUp, Package, ArrowDownCircle,
  RefreshCw, Loader2, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp
} from 'lucide-react'
import AmountInput from '@/components/ui/AmountInput'
import Modal from '@/components/ui/Modal'

interface Partner {
  id: string
  partner_id: string
  name: string
  wallet_balance: number
  total_invested: number
  total_profit: number
  total_withdrawn: number
}

interface ContainerSummary {
  container_db_id: string
  container_id: string
  tracking_number: string | null
  trip_title: string
  percentage: number
  partner_quoted_cost_ngn: number
  amount_received_ngn: number
  topup_needed_ngn: number
  display_value: number
  partner_expected_return: number
  partner_revenue_share: number
  partner_profit: number
  sales_status: string
  container_status: string
}

interface WalletTxn {
  id: string
  type: string
  amount: number
  description: string | null
  created_at: string
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CONTAINER_STATUS_COLOR: Record<string, string> = {
  ordered:    'bg-blue-50 text-blue-700',
  in_transit: 'bg-amber-50 text-amber-700',
  arrived:    'bg-purple-50 text-purple-700',
  completed:  'bg-green-50 text-green-700',
}

export default function PartnerDashboardPage() {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [containers, setContainers] = useState<ContainerSummary[]>([])
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'containers' | 'wallet'>('overview')
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null)

  // Payout
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [savingPayout, setSavingPayout] = useState(false)
  const [payoutSuccess, setPayoutSuccess] = useState(false)

  // Reinvest
  const [reinvestOpen, setReinvestOpen] = useState(false)
  const [reinvestAmount, setReinvestAmount] = useState('')
  const [reinvestNote, setReinvestNote] = useState('')
  const [savingReinvest, setSavingReinvest] = useState(false)
  const [reinvestSuccess, setReinvestSuccess] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: partnerData } = await supabase
      .from('partners').select('id, partner_id, name, wallet_balance, total_invested, total_profit, total_withdrawn')
      .eq('user_id', user.id).single()

    if (!partnerData) { setLoading(false); return }
    setPartner({ ...partnerData, wallet_balance: Number(partnerData.wallet_balance ?? 0), total_invested: Number(partnerData.total_invested ?? 0), total_profit: Number(partnerData.total_profit ?? 0), total_withdrawn: Number(partnerData.total_withdrawn ?? 0) })

    const [{ data: viewData }, { data: walletData }] = await Promise.all([
      supabase.from('partnership_container_view').select('*').eq('partner_db_id', partnerData.id),
      supabase.from('partner_wallet_transactions').select('id, type, amount, description, created_at').eq('partner_id', partnerData.id).order('created_at', { ascending: false }).limit(20),
    ])

    setWalletTxns((walletData ?? []).map(w => ({ ...w, amount: Number(w.amount) })))

    if (!viewData?.length) { setLoading(false); return }

    const containerDbIds = viewData.map(r => r.container_db_id)
    const [{ data: containerData }, { data: salesOrders }, { data: presales }, { data: trips }] = await Promise.all([
      supabase.from('containers').select('id, status').in('id', containerDbIds),
      supabase.from('sales_orders').select('container_id, customer_payable').in('container_id', containerDbIds),
      supabase.from('presales').select('container_id, expected_sale_revenue').in('container_id', containerDbIds),
      supabase.from('trips').select('id, title').in('id', [...new Set(viewData.map(r => r.trip_id))]),
    ])

    const statusMap = Object.fromEntries((containerData ?? []).map(c => [c.id, c.status]))
    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const presaleMap = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const revenueByContainer = (salesOrders ?? []).reduce((acc, so) => {
      acc[so.container_id] = (acc[so.container_id] ?? 0) + Number(so.customer_payable)
      return acc
    }, {} as Record<string, number>)

    setContainers(viewData.map(r => {
      const pct = Number(r.percentage) / 100
      const actualSales = revenueByContainer[r.container_db_id] ?? 0
      const partnerRevShare = actualSales * pct
      const partnerCost = Number(r.partner_quoted_cost_ngn)
      const trip = tripMap[r.trip_id]
      const presale = presaleMap[r.container_db_id]
      const displayVal = r.display_value_override ? Number(r.display_value_override) : partnerCost
      const status = statusMap[r.container_db_id] ?? 'ordered'

      let salesStatus = 'not_started'
      if (actualSales > 0 && status === 'completed') salesStatus = 'completed'
      else if (actualSales > 0) salesStatus = 'in_progress'

      return {
        container_db_id: r.container_db_id,
        container_id: r.container_ref,
        tracking_number: r.tracking_number,
        trip_title: trip?.title ?? '—',
        percentage: Number(r.percentage),
        partner_quoted_cost_ngn: partnerCost,
        amount_received_ngn: Number(r.amount_received_ngn),
        topup_needed_ngn: Number(r.topup_needed_ngn),
        display_value: displayVal,
        partner_expected_return: Number(presale?.expected_sale_revenue ?? 0) * pct,
        partner_revenue_share: partnerRevShare,
        partner_profit: partnerRevShare - partnerCost,
        sales_status: salesStatus,
        container_status: status,
      }
    }))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function submitPayout(e: React.FormEvent) {
    e.preventDefault()
    if (!payoutAmount || !partner) return
    setSavingPayout(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('partner_payout_requests').insert({
      request_id: `PAY-${Date.now().toString().slice(-6)}`,
      partner_id: partner.id,
      amount: parseFloat(payoutAmount),
      status: 'pending',
      requested_by: user?.id,
      notes: payoutNote || null,
    })
    setSavingPayout(false)
    setPayoutOpen(false)
    setPayoutAmount('')
    setPayoutNote('')
    setPayoutSuccess(true)
    setTimeout(() => setPayoutSuccess(false), 5000)
  }

  async function submitReinvest(e: React.FormEvent) {
    e.preventDefault()
    if (!reinvestAmount || !partner) return
    setSavingReinvest(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('partner_reinvestment_requests').insert({
      request_id: `REINV-${Date.now().toString().slice(-6)}`,
      partner_id: partner.id,
      amount: parseFloat(reinvestAmount),
      status: 'pending',
      requested_by: user?.id,
      notes: reinvestNote || null,
    })
    setSavingReinvest(false)
    setReinvestOpen(false)
    setReinvestAmount('')
    setReinvestNote('')
    setReinvestSuccess(true)
    setTimeout(() => setReinvestSuccess(false), 5000)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-600" size={28} /></div>

  if (!partner) return (
    <div className="text-center py-20">
      <Package size={32} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-400">No partner account linked to your profile.</p>
      <p className="text-xs text-gray-300 mt-1">Contact your administrator.</p>
    </div>
  )

  const totalTopup = containers.reduce((s, c) => s + Math.max(c.topup_needed_ngn, 0), 0)
  const totalPortfolioValue = containers.reduce((s, c) => s + c.display_value, 0)
  const activeContainers = containers.filter(c => c.container_status !== 'completed').length
  const completedContainers = containers.filter(c => c.sales_status === 'completed').length

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* Welcome header */}
      <div className="bg-gradient-to-br from-brand-700 to-brand-900 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-brand-300 text-xs font-medium uppercase tracking-wide">Partner Dashboard</p>
            <h1 className="text-2xl font-bold mt-1">{partner.name}</h1>
            <p className="text-brand-300 text-xs mt-1 font-mono">{partner.partner_id}</p>
          </div>
          <div className="text-right">
            <p className="text-brand-300 text-xs">Wallet balance</p>
            <p className="text-3xl font-bold">{fmt(partner.wallet_balance)}</p>
          </div>
        </div>

        {/* Top-up alert */}
        {totalTopup > 0 && (
          <div className="mt-4 p-3 bg-amber-500/20 border border-amber-400/30 rounded-xl flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-300 shrink-0" />
            <p className="text-xs text-amber-200 font-medium">
              You have outstanding top-up payments of <span className="font-bold text-white">{fmt(totalTopup)}</span> across your containers.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button onClick={() => setPayoutOpen(true)} disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 backdrop-blur-sm border border-white/20">
            <ArrowDownCircle size={15} /> Request payout
          </button>
          <button onClick={() => setReinvestOpen(true)} disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 backdrop-blur-sm border border-white/20">
            <RefreshCw size={15} /> Reinvest
          </button>
        </div>
      </div>

      {/* Success banners */}
      {payoutSuccess && (
        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700">Payout request submitted. You will be notified once it is processed.</p>
        </div>
      )}
      {reinvestSuccess && (
        <div className="flex items-center gap-3 p-4 bg-brand-50 rounded-xl border border-brand-200">
          <CheckCircle2 size={16} className="text-brand-600 shrink-0" />
          <p className="text-sm font-medium text-brand-700">Reinvestment request submitted. Our team will allocate your funds to an upcoming container.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'containers', label: 'My containers', count: containers.length },
            { key: 'wallet', label: 'Wallet', count: walletTxns.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              {tab.count != null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Portfolio value', value: fmt(totalPortfolioValue), color: 'text-blue-700', sub: `${containers.length} container${containers.length !== 1 ? 's' : ''}` },
                { label: 'Wallet balance', value: fmt(partner.wallet_balance), color: 'text-brand-700', sub: 'Available to withdraw or reinvest' },
                { label: 'Total profit', value: partner.total_profit > 0 ? fmt(partner.total_profit) : '—', color: 'text-green-700', sub: 'Across all sold containers' },
                { label: 'Total withdrawn', value: fmt(partner.total_withdrawn), color: 'text-gray-700', sub: 'All-time payouts' },
              ].map(m => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                  <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Container status summary */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Container status</p>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { label: 'Active containers', value: activeContainers, color: 'text-blue-700' },
                  { label: 'Sales completed', value: completedContainers, color: 'text-green-700' },
                  { label: 'Top-up required', value: containers.filter(c => c.topup_needed_ngn > 0).length, color: 'text-amber-700' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-600">{item.label}</span>
                    <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Containers tab */}
        {activeTab === 'containers' && (
          <div className="divide-y divide-gray-50">
            {containers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Package size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No containers allocated yet.</p>
              </div>
            ) : containers.map(c => {
              const isExpanded = expandedContainer === c.container_db_id
              const profitPositive = c.partner_profit >= 0
              const hasTopup = c.topup_needed_ngn > 0
              return (
                <div key={c.container_db_id}>
                  <button
                    className="w-full px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
                    onClick={() => setExpandedContainer(isExpanded ? null : c.container_db_id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{c.container_id}</span>
                          <span className="text-xs text-gray-500 font-mono">{c.tracking_number ?? '—'}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${CONTAINER_STATUS_COLOR[c.container_status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {c.container_status}
                          </span>
                          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{c.percentage.toFixed(0)}% stake</span>
                          {hasTopup && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              <AlertTriangle size={10} /> Top-up needed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{c.trip_title}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Value</p>
                          <p className="text-sm font-bold text-blue-700">{fmt(c.display_value)}</p>
                        </div>
                        {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-5 pb-4 bg-gray-50/30 border-t border-gray-50">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3">
                        {[
                          { label: 'My investment', value: fmt(c.partner_quoted_cost_ngn), color: 'text-gray-900' },
                          { label: 'Amount paid', value: fmt(c.amount_received_ngn), color: 'text-green-700' },
                          { label: 'Top-up needed', value: hasTopup ? fmt(c.topup_needed_ngn) : '✓ Fully paid', color: hasTopup ? 'text-amber-700' : 'text-green-700' },
                          { label: 'Expected return', value: c.partner_expected_return > 0 ? fmt(c.partner_expected_return) : '—', color: 'text-blue-700' },
                          { label: 'Actual return', value: c.partner_revenue_share > 0 ? fmt(c.partner_revenue_share) : '—', color: 'text-green-700' },
                          { label: 'Profit', value: c.partner_revenue_share > 0 ? `${profitPositive ? '+' : ''}${fmt(c.partner_profit)}` : '—', color: c.partner_revenue_share > 0 ? (profitPositive ? 'text-green-700' : 'text-red-600') : 'text-gray-400' },
                        ].map(m => (
                          <div key={m.label} className="bg-white rounded-lg p-3 border border-gray-100">
                            <p className="text-xs text-gray-400 mb-0.5">{m.label}</p>
                            <p className={`text-sm font-semibold ${m.color}`}>{m.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Wallet tab */}
        {activeTab === 'wallet' && (
          <div>
            <div className="px-5 py-4 bg-brand-50/30 border-b border-gray-100">
              <p className="text-xs text-gray-500">Current balance</p>
              <p className="text-2xl font-bold text-brand-700">{fmt(partner.wallet_balance)}</p>
            </div>
            {walletTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Wallet size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No transactions yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {walletTxns.map(txn => (
                  <div key={txn.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                      ${txn.amount > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                      {txn.amount > 0
                        ? <TrendingUp size={14} className="text-green-600" />
                        : <ArrowDownCircle size={14} className="text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 capitalize">{txn.type}</p>
                      <p className="text-xs text-gray-400 truncate">{txn.description ?? '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${txn.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {txn.amount > 0 ? '+' : ''}{fmt(Math.abs(txn.amount))}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(txn.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payout modal */}
      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="Request a payout" size="sm">
        <form onSubmit={submitPayout} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">Available: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-brand-600 mt-0.5">Your request will be reviewed before processing.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={payoutAmount} onChange={setPayoutAmount}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
            <textarea rows={2} value={payoutNote} onChange={e => setPayoutNote(e.target.value)}
              placeholder="Any instructions..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPayoutOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingPayout || !payoutAmount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingPayout ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownCircle size={14} />} Submit
            </button>
          </div>
        </form>
      </Modal>

      {/* Reinvest modal */}
      <Modal open={reinvestOpen} onClose={() => setReinvestOpen(false)} title="Reinvest funds" size="sm">
        <form onSubmit={submitReinvest} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">Available: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-brand-600 mt-0.5">Indicate how much you would like to reinvest. Our team will allocate to an upcoming container.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={reinvestAmount} onChange={setReinvestAmount}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
            <textarea rows={2} value={reinvestNote} onChange={e => setReinvestNote(e.target.value)}
              placeholder="Any preferences..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setReinvestOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingReinvest || !reinvestAmount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingReinvest ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Submit
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
