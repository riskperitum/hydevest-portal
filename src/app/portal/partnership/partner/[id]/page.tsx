'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, TrendingUp,
  Wallet, AlertTriangle, Plus, ArrowDownCircle,
  RefreshCw, Check, Activity
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
  wallet_balance: number
  total_invested: number
  total_profit: number
  total_withdrawn: number
}

interface ContainerRow {
  container_db_id: string
  container_id: string
  tracking_number: string | null
  trip_id: string
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
  funder_record_id: string
}

interface WalletTxn {
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

export default function PartnerViewPage() {
  const params = useParams()
  const router = useRouter()
  const partnerDbId = params.id as string

  const [partner, setPartner] = useState<Partner | null>(null)
  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([])
  const [payouts, setPayouts] = useState<PayoutRequest[]>([])
  const [reinvestments, setReinvestments] = useState<ReinvestRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'containers' | 'wallet' | 'topups' | 'payouts' | 'reinvestments'>('containers')
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  // Top-up modal
  const [topupOpen, setTopupOpen] = useState(false)
  const [topupFunderId, setTopupFunderId] = useState('')
  const [topupContainerId, setTopupContainerId] = useState('')
  const [topupAmount, setTopupAmount] = useState('')
  const [topupNote, setTopupNote] = useState('')
  const [savingTopup, setSavingTopup] = useState(false)

  // Credit wallet modal
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

    const [
      { data: partnerData },
      { data: viewData },
      { data: walletData },
      { data: payoutData },
      { data: reinvestData },
      { data: allProfiles },
    ] = await Promise.all([
      supabase.from('partners').select('*').eq('id', partnerDbId).single(),
      supabase.from('partnership_container_view').select('*').eq('partner_db_id', partnerDbId),
      supabase.from('partner_wallet_transactions').select('id, type, amount, description, reference_ref, created_at').eq('partner_id', partnerDbId).order('created_at', { ascending: false }),
      supabase.from('partner_payout_requests').select('id, request_id, amount, status, notes, created_at').eq('partner_id', partnerDbId).order('created_at', { ascending: false }),
      supabase.from('partner_reinvestment_requests').select('id, request_id, amount, status, notes, created_at').eq('partner_id', partnerDbId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
    ])

    setPartner({ ...partnerData, wallet_balance: Number(partnerData?.wallet_balance ?? 0), total_invested: Number(partnerData?.total_invested ?? 0), total_profit: Number(partnerData?.total_profit ?? 0), total_withdrawn: Number(partnerData?.total_withdrawn ?? 0) })
    setWalletTxns((walletData ?? []).map(w => ({ ...w, amount: Number(w.amount) })))
    setPayouts((payoutData ?? []).map(p => ({ ...p, amount: Number(p.amount) })))
    setReinvestments((reinvestData ?? []).map(r => ({ ...r, amount: Number(r.amount) })))
    setProfiles(allProfiles ?? [])

    if (!viewData?.length) { setLoading(false); return }

    const containerDbIds = viewData.map(r => r.container_db_id)
    const [{ data: containerData }, { data: salesOrders }, { data: presales }, { data: trips }] = await Promise.all([
      supabase.from('containers').select('id, status').in('id', containerDbIds),
      supabase.from('sales_orders').select('container_id, customer_payable').in('container_id', containerDbIds),
      supabase.from('presales').select('container_id, expected_sale_revenue').in('container_id', containerDbIds),
      supabase.from('trips').select('id, trip_id, title').in('id', [...new Set(viewData.map(r => r.trip_id))]),
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
      const status = statusMap[r.container_db_id] ?? 'ordered'
      const displayVal = r.display_value_override ? Number(r.display_value_override) : partnerCost

      let salesStatus = 'not_started'
      if (actualSales > 0 && status === 'completed') salesStatus = 'completed'
      else if (actualSales > 0) salesStatus = 'in_progress'

      return {
        funder_record_id: r.funder_id,
        container_db_id: r.container_db_id,
        container_id: r.container_ref,
        tracking_number: r.tracking_number,
        trip_id: trip?.trip_id ?? '—',
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
      }
    }))

    setLoading(false)
  }, [partnerDbId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  async function saveTopup(e: React.FormEvent) {
    e.preventDefault()
    if (!topupAmount) return
    setSavingTopup(true)
    const supabase = createClient()
    const amount = parseFloat(topupAmount)
    const container = containers.find(c => c.container_db_id === topupContainerId)

    // Update amount_received_ngn on container_funders
    const newReceived = (container?.amount_received_ngn ?? 0) + amount
    await supabase.from('container_funders')
      .update({ amount_received_ngn: newReceived })
      .eq('id', topupFunderId)

    // Log wallet transaction
    await supabase.from('partner_wallet_transactions').insert({
      partner_id: partnerDbId,
      type: 'topup',
      amount,
      description: topupNote || `Top-up for ${container?.container_id ?? ''}`,
      reference_type: 'container',
      reference_id: topupContainerId || null,
      reference_ref: container?.container_id ?? null,
      performed_by: currentUser?.id,
    })

    setSavingTopup(false)
    setTopupOpen(false)
    setTopupAmount('')
    setTopupNote('')
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
      partner_id: partnerDbId,
      type: 'credit',
      amount,
      description: creditForm.description || `Container sale proceeds — ${container?.container_id ?? ''}`,
      reference_type: 'container',
      reference_id: creditForm.container_db_id || null,
      reference_ref: container?.container_id ?? null,
      performed_by: currentUser?.id,
    })

    await supabase.from('partners').update({
      wallet_balance: (partner?.wallet_balance ?? 0) + amount,
    }).eq('id', partnerDbId)

    setSavingCredit(false)
    setCreditOpen(false)
    setCreditForm({ container_db_id: '', amount: '', description: '' })
    load()
  }

  async function submitPayout(e: React.FormEvent) {
    e.preventDefault()
    if (!payoutForm.amount || !payoutForm.assignee) return
    setSavingPayout(true)
    const supabase = createClient()
    const amount = parseFloat(payoutForm.amount)
    const requestId = `PAY-${Date.now().toString().slice(-6)}`

    const { data: req } = await supabase.from('partner_payout_requests').insert({
      request_id: requestId,
      partner_id: partnerDbId,
      amount,
      status: 'pending',
      requested_by: currentUser?.id,
      assigned_to: payoutForm.assignee,
      notes: payoutForm.notes || null,
    }).select().single()

    await supabase.from('tasks').insert({
      type: 'approval_request',
      title: `Partner payout — ${partner?.name} (${requestId})`,
      description: `Payout of ${fmt(amount)} for partner ${partner?.name}`,
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

  async function submitReinvest(e: React.FormEvent) {
    e.preventDefault()
    if (!reinvestForm.amount) return
    setSavingReinvest(true)
    const supabase = createClient()
    const amount = parseFloat(reinvestForm.amount)
    const requestId = `REINV-${Date.now().toString().slice(-6)}`

    await supabase.from('partner_reinvestment_requests').insert({
      request_id: requestId,
      partner_id: partnerDbId,
      amount,
      status: 'pending',
      requested_by: currentUser?.id,
      notes: reinvestForm.notes || null,
    })

    await supabase.from('partner_wallet_transactions').insert({
      partner_id: partnerDbId,
      type: 'reinvestment',
      amount: -amount,
      description: `Reinvestment request — ${requestId}`,
      reference_ref: requestId,
      performed_by: currentUser?.id,
    })

    await supabase.from('partners').update({
      wallet_balance: Math.max((partner?.wallet_balance ?? 0) - amount, 0),
    }).eq('id', partnerDbId)

    setSavingReinvest(false)
    setReinvestOpen(false)
    setReinvestForm({ amount: '', notes: '' })
    load()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-600" size={28} /></div>
  if (!partner) return <div className="text-center py-16 text-gray-400">Partner not found.</div>

  const totalInvestment = containers.reduce((s, c) => s + c.partner_quoted_cost_ngn, 0)
  const totalReceived = containers.reduce((s, c) => s + c.amount_received_ngn, 0)
  const totalTopup = containers.reduce((s, c) => s + Math.max(c.topup_needed_ngn, 0), 0)
  const totalRevShare = containers.reduce((s, c) => s + c.partner_revenue_share, 0)
  const totalProfit = containers.reduce((s, c) => s + c.partner_profit, 0)

  const PAYOUT_STATUS = { pending: 'bg-amber-50 text-amber-700', approved: 'bg-blue-50 text-blue-700', rejected: 'bg-red-50 text-red-600', paid: 'bg-green-50 text-green-700' }

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/partnership" className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
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
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCreditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-green-200 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
            <Plus size={14} /> Credit wallet
          </button>
          <button onClick={() => setPayoutOpen(true)} disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
            <ArrowDownCircle size={14} /> Payout
          </button>
          <button onClick={() => setReinvestOpen(true)} disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-brand-200 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} /> Reinvest
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Wallet balance', value: fmt(partner.wallet_balance), color: 'text-brand-700', bg: 'bg-brand-50' },
          { label: 'Total investment', value: fmt(totalInvestment), color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Top-up needed', value: totalTopup > 0 ? fmt(totalTopup) : 'Fully funded', color: totalTopup > 0 ? 'text-amber-700' : 'text-green-700', bg: totalTopup > 0 ? 'bg-amber-50' : 'bg-green-50' },
          { label: 'Total profit', value: totalRevShare > 0 ? fmt(totalProfit) : '—', color: totalProfit >= 0 ? 'text-green-700' : 'text-red-600', bg: 'bg-white' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {[
            { key: 'containers', label: 'Containers', count: containers.length },
            { key: 'topups', label: 'Top-ups', count: containers.filter(c => c.topup_needed_ngn > 0).length },
            { key: 'wallet', label: 'Wallet', count: walletTxns.length },
            { key: 'payouts', label: 'Payouts', count: payouts.length },
            { key: 'reinvestments', label: 'Reinvestments', count: reinvestments.length },
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Container','Trip','Stake','Investment','Received','Top-up','Display value','Exp. return','Actual return','Profit','Status'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {containers.map(c => (
                  <tr key={c.container_db_id}
                    onClick={() => router.push(`/portal/partnership/${c.container_db_id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/20 transition-colors cursor-pointer group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="font-mono text-xs font-semibold text-brand-700">{c.container_id}</p>
                      <p className="text-xs text-gray-400 font-mono">{c.tracking_number ?? '—'}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-700">{c.trip_id}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-sm font-bold text-brand-700">{c.percentage.toFixed(0)}%</span>
                    </td>
                    <td className="px-3 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">{fmt(c.partner_quoted_cost_ngn)}</td>
                    <td className="px-3 py-3 text-xs text-green-600 font-medium whitespace-nowrap">{fmt(c.amount_received_ngn)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {c.topup_needed_ngn > 0
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} />{fmt(c.topup_needed_ngn)}</span>
                        : <span className="text-xs text-green-600 font-medium">✓</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-blue-700 font-medium whitespace-nowrap">{fmt(c.display_value)}</td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{c.partner_expected_return > 0 ? fmt(c.partner_expected_return) : '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {c.partner_revenue_share > 0
                        ? <span className="text-xs font-semibold text-green-600">{fmt(c.partner_revenue_share)}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {c.partner_revenue_share > 0
                        ? <span className={`text-xs font-bold ${c.partner_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {c.partner_profit >= 0 ? '+' : ''}{fmt(c.partner_profit)}
                          </span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                        ${c.sales_status === 'completed' ? 'bg-green-50 text-green-700'
                          : c.sales_status === 'in_progress' ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-500'}`}>
                        {c.sales_status === 'completed' ? 'Completed' : c.sales_status === 'in_progress' ? 'In progress' : 'Not started'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Top-ups tab */}
        {activeTab === 'topups' && (
          <div className="overflow-x-auto">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-600">Containers where partner still owes funds</p>
              {containers.some(c => c.topup_needed_ngn > 0) && (
                <button onClick={() => {
                  const firstTopup = containers.find(c => c.topup_needed_ngn > 0)
                  if (firstTopup) {
                    setTopupFunderId(firstTopup.funder_record_id)
                    setTopupContainerId(firstTopup.container_db_id)
                    setTopupAmount(firstTopup.topup_needed_ngn.toFixed(2))
                    setTopupOpen(true)
                  }
                }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                  <Plus size={12} /> Record top-up
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Container','Stake','Investment','Received','Top-up needed','Action'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {containers.filter(c => c.topup_needed_ngn > 0).length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-green-600 font-medium">✓ All containers fully funded</td></tr>
                ) : containers.filter(c => c.topup_needed_ngn > 0).map(c => (
                  <tr key={c.container_db_id} className="border-b border-gray-50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="font-mono text-xs font-semibold text-brand-700">{c.container_id}</p>
                      <p className="text-xs text-gray-400">{c.tracking_number ?? '—'}</p>
                    </td>
                    <td className="px-3 py-3 text-sm font-bold text-brand-700 whitespace-nowrap">{c.percentage.toFixed(0)}%</td>
                    <td className="px-3 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">{fmt(c.partner_quoted_cost_ngn)}</td>
                    <td className="px-3 py-3 text-xs text-green-600 font-medium whitespace-nowrap">{fmt(c.amount_received_ngn)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                        <AlertTriangle size={12} /> {fmt(c.topup_needed_ngn)}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button onClick={() => {
                        setTopupFunderId(c.funder_record_id)
                        setTopupContainerId(c.container_db_id)
                        setTopupAmount(c.topup_needed_ngn.toFixed(2))
                        setTopupOpen(true)
                      }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors">
                        <Plus size={12} /> Record top-up
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Wallet tab */}
        {activeTab === 'wallet' && (
          <div className="overflow-x-auto">
            <div className="px-5 py-3 bg-brand-50/30 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Current wallet balance</p>
                <p className="text-xl font-bold text-brand-700">{fmt(partner.wallet_balance)}</p>
              </div>
              <button onClick={() => setCreditOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                <Plus size={12} /> Credit wallet
              </button>
            </div>
            {walletTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Wallet size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No transactions yet.</p>
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
                  {walletTxns.map(txn => (
                    <tr key={txn.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize
                          ${txn.type === 'credit' ? 'bg-green-50 text-green-700'
                            : txn.type === 'topup' ? 'bg-amber-50 text-amber-700'
                            : txn.type === 'reinvestment' ? 'bg-brand-50 text-brand-700'
                            : 'bg-red-50 text-red-600'}`}>
                          {txn.type}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-bold text-sm ${txn.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {txn.amount > 0 ? '+' : ''}{fmt(Math.abs(txn.amount))}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 max-w-[200px] truncate">{txn.description ?? '—'}</td>
                      <td className="px-3 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">{txn.reference_ref ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(txn.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Payouts tab */}
        {activeTab === 'payouts' && (
          <div className="overflow-x-auto">
            <div className="px-5 py-3 border-b border-gray-100 flex justify-end">
              <button onClick={() => setPayoutOpen(true)} disabled={partner.wallet_balance <= 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <ArrowDownCircle size={12} /> New payout
              </button>
            </div>
            {payouts.length === 0 ? (
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
                  {payouts.map(req => (
                    <tr key={req.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{req.request_id}</span>
                      </td>
                      <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{fmt(req.amount)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PAYOUT_STATUS[req.status as keyof typeof PAYOUT_STATUS] ?? 'bg-gray-100 text-gray-500'}`}>
                          {req.status}
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
              <button onClick={() => setReinvestOpen(true)} disabled={partner.wallet_balance <= 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <RefreshCw size={12} /> New reinvestment
              </button>
            </div>
            {reinvestments.length === 0 ? (
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
                  {reinvestments.map(req => (
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
                          {req.status}
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

      {/* Top-up modal */}
      <Modal open={topupOpen} onClose={() => setTopupOpen(false)} title="Record top-up payment" size="sm">
        <form onSubmit={saveTopup} className="space-y-4">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-xs text-amber-700 font-medium">
              This records a cash payment received from the partner towards their container investment.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Container</label>
            <select value={topupContainerId} onChange={e => {
              const c = containers.find(c => c.container_db_id === e.target.value)
              setTopupContainerId(e.target.value)
              setTopupFunderId(c?.funder_record_id ?? '')
              setTopupAmount(c?.topup_needed_ngn ? c.topup_needed_ngn.toFixed(2) : '')
            }} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">Select container...</option>
              {containers.map(c => (
                <option key={c.container_db_id} value={c.container_db_id}>
                  {c.container_id} — top-up needed: {fmt(Math.max(c.topup_needed_ngn, 0))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount received (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={topupAmount} onChange={setTopupAmount}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
            <input value={topupNote} onChange={e => setTopupNote(e.target.value)}
              placeholder="e.g. Bank transfer received 15 Jan"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setTopupOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingTopup || !topupAmount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingTopup ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Record top-up
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
              {containers.filter(c => c.partner_revenue_share > 0).map(c => (
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

      {/* Payout modal */}
      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="Request payout" size="sm">
        <form onSubmit={submitPayout} className="space-y-4">
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
              {savingPayout ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownCircle size={14} />} Submit
            </button>
          </div>
        </form>
      </Modal>

      {/* Reinvest modal */}
      <Modal open={reinvestOpen} onClose={() => setReinvestOpen(false)} title="Reinvest from wallet" size="sm">
        <form onSubmit={submitReinvest} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">Available: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-brand-600 mt-0.5">Funds move to reinvestment pool. Admin will allocate to a new container.</p>
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
              placeholder="Any preferences..."
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
