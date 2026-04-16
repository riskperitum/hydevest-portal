'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Wallet, TrendingUp, Package, ArrowDownCircle,
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
  MessageSquare, Send, CheckCircle2, Inbox, X
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import AmountInput from '@/components/ui/AmountInput'

interface Partner {
  id: string
  partner_id: string
  name: string
  wallet_balance: number
  wallet_allocated: number
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
  partner_credited_ngn: number
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

interface MyMessage {
  id: string
  message_id: string
  type: string
  subject: string
  body: string | null
  status: string
  amount: number | null
  percentage: number | null
  created_at: string
  replies: {
    id: string
    body: string
    from_partner: boolean
    sender_name: string
    created_at: string
  }[]
  has_unread_reply: boolean
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TXN_TYPE_LABEL: Record<string, string> = {
  topup:        'Cash received by Hydevest',
  credit:       'Credit',
  allocation:   'Allocated to container',
  sale_credit:  'Container sale proceeds',
  debit:        'Deduction from wallet',
  payout:       'Payout sent to your bank',
  reinvestment: 'Reinvestment',
}

const TYPE_LABEL: Record<string, string> = {
  message:            'Message',
  payout_request:     'Payout request',
  container_interest: 'Container interest',
  withdrawal_request: 'Withdrawal',
  reinvestment:       'Reinvestment',
}

function timeAgo(date: string): string {
  const diff = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function PartnerDashboardPage() {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [containers, setContainers] = useState<ContainerSummary[]>([])
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([])
  const [myMessages, setMyMessages] = useState<MyMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'containers' | 'wallet' | 'messages'>('overview')
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<MyMessage | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  // Payout request modal
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [savingPayout, setSavingPayout] = useState(false)
  const [payoutSuccess, setPayoutSuccess] = useState(false)

  // Send message modal
  const [messageOpen, setMessageOpen] = useState(false)
  const [messageSubject, setMessageSubject] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [savingMessage, setSavingMessage] = useState(false)
  const [messageSuccess, setMessageSuccess] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: partnerData } = await supabase
      .from('partners')
      .select('id, partner_id, name, wallet_balance, wallet_allocated, total_profit, total_withdrawn')
      .eq('user_id', user.id)
      .single()

    if (!partnerData) { setLoading(false); return }

    setPartner({
      ...partnerData,
      wallet_balance:   Number(partnerData.wallet_balance ?? 0),
      wallet_allocated: Number(partnerData.wallet_allocated ?? 0),
      total_profit:     Number(partnerData.total_profit ?? 0),
      total_withdrawn:  Number(partnerData.total_withdrawn ?? 0),
    })

    const [{ data: viewData }, { data: walletData }, { data: msgData }] = await Promise.all([
      supabase.from('partnership_container_view').select('*').eq('partner_db_id', partnerData.id),
      supabase.from('partner_wallet_transactions')
        .select('id, type, amount, description, created_at')
        .eq('partner_id', partnerData.id)
        .order('created_at', { ascending: false }),
      supabase.from('requestbox_messages')
        .select('id, message_id, type, subject, body, status, amount, percentage, created_at, partner_last_read_at')
        .eq('from_partner_id', partnerData.id)
        .order('created_at', { ascending: false }),
    ])

    setWalletTxns((walletData ?? []).map(w => ({ ...w, amount: Number(w.amount) })))

    // Load replies for messages
    const msgIds = (msgData ?? []).map(m => m.id)
    const { data: replies } = msgIds.length > 0
      ? await supabase.from('requestbox_replies')
          .select(`id, message_id, body, created_at,
            partner:partners!requestbox_replies_from_partner_id_fkey(name),
            profile:profiles!requestbox_replies_from_user_id_fkey(full_name, email)`)
          .in('message_id', msgIds)
          .order('created_at', { ascending: true })
      : { data: [] }

    const repliesByMsg = (replies ?? []).reduce((acc, r) => {
      if (!acc[r.message_id]) acc[r.message_id] = []
      acc[r.message_id].push({
        id: r.id,
        body: r.body,
        from_partner: !!(r.partner as any)?.name,
        sender_name: (r.partner as any)?.name ?? (r.profile as any)?.full_name ?? 'Support',
        created_at: r.created_at,
      })
      return acc
    }, {} as Record<string, MyMessage['replies']>)

    setMyMessages((msgData ?? []).map(m => {
      const msgReplies = repliesByMsg[m.id] ?? []
      const lastReadAt = m.partner_last_read_at ? new Date(m.partner_last_read_at).getTime() : 0
      const hasUnread = msgReplies.some(r => !r.from_partner && new Date(r.created_at).getTime() > lastReadAt)
      return {
        id: m.id,
        message_id: m.message_id,
        type: m.type,
        subject: m.subject,
        body: m.body,
        status: m.status,
        amount: m.amount ? Number(m.amount) : null,
        percentage: m.percentage ? Number(m.percentage) : null,
        created_at: m.created_at,
        replies: msgReplies,
        has_unread_reply: hasUnread,
      }
    }))

    if (!viewData?.length) { setLoading(false); return }

    const containerDbIds = viewData.map(r => r.container_db_id)
    const [{ data: containerData }, { data: salesOrders }, { data: presales }, { data: trips }] = await Promise.all([
      supabase.from('containers').select('id, status').in('id', containerDbIds),
      supabase.from('sales_orders').select('container_id, customer_payable').in('container_id', containerDbIds),
      supabase.from('presales').select('container_id, expected_sale_revenue').in('container_id', containerDbIds),
      supabase.from('trips').select('id, title').in('id', [...new Set(viewData.map(r => r.trip_id))]),
    ])

    const statusMap  = Object.fromEntries((containerData ?? []).map(c => [c.id, c.status]))
    const tripMap    = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const presaleMap = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))
    const revenueByContainer = (salesOrders ?? []).reduce((acc, so) => {
      acc[so.container_id] = (acc[so.container_id] ?? 0) + Number(so.customer_payable)
      return acc
    }, {} as Record<string, number>)

    setContainers(viewData.map(r => {
      const pct             = Number(r.percentage) / 100
      const actualSales     = revenueByContainer[r.container_db_id] ?? 0
      const partnerRevShare = actualSales * pct
      const partnerCost     = Number(r.partner_quoted_cost_ngn)
      const displayVal      = r.display_value_override ? Number(r.display_value_override) : partnerCost
      const status          = statusMap[r.container_db_id] ?? 'ordered'
      const presale         = presaleMap[r.container_db_id]
      const trip            = tripMap[r.trip_id]

      let salesStatus = 'not_started'
      if (actualSales > 0 && status === 'completed') salesStatus = 'completed'
      else if (actualSales > 0) salesStatus = 'in_progress'

      return {
        container_db_id:         r.container_db_id,
        container_id:            r.container_ref,
        tracking_number:         r.tracking_number,
        trip_title:              trip?.title ?? '—',
        percentage:              Number(r.percentage),
        partner_quoted_cost_ngn: partnerCost,
        amount_received_ngn:     Number(r.amount_received_ngn),
        topup_needed_ngn:        Number(r.topup_needed_ngn),
        display_value:           displayVal,
        partner_expected_return: Number(presale?.expected_sale_revenue ?? 0) * pct,
        partner_revenue_share:   partnerRevShare,
        partner_profit:          partnerRevShare - partnerCost,
        partner_credited_ngn:    Number(r.partner_credited_ngn ?? 0),
        sales_status:            salesStatus,
        container_status:        status,
      }
    }))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openMessage(msg: MyMessage) {
    setSelectedMessage(msg)
    setReplyText('')
    // Update partner_last_read_at
    const supabase = createClient()
    await supabase.from('requestbox_messages')
      .update({ partner_last_read_at: new Date().toISOString() })
      .eq('id', msg.id)
    setMyMessages(prev => prev.map(m => m.id === msg.id ? { ...m, has_unread_reply: false } : m))
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedMessage || !partner) return
    setSendingReply(true)
    const supabase = createClient()
    await supabase.from('requestbox_replies').insert({
      message_id: selectedMessage.id,
      body: replyText.trim(),
      from_partner_id: partner.id,
    })
    // Mark message as unread for admin
    await supabase.from('requestbox_messages')
      .update({ status: 'unread' })
      .eq('id', selectedMessage.id)
    setSendingReply(false)
    setReplyText('')
    load()
  }

  async function submitPayout(e: React.FormEvent) {
    e.preventDefault()
    if (!payoutAmount || !partner) return
    setSavingPayout(true)
    const supabase = createClient()
    await supabase.from('requestbox_messages').insert({
      message_id: `RBM-${Date.now().toString().slice(-6)}`,
      type: 'payout_request',
      subject: `Payout request — ${partner.name}`,
      body: `${partner.name} is requesting a payout of ${fmt(parseFloat(payoutAmount))}.${payoutNote ? ` Note: ${payoutNote}` : ''}`,
      status: 'unread',
      priority: 'normal',
      from_partner_id: partner.id,
      amount: parseFloat(payoutAmount),
    })
    setSavingPayout(false)
    setPayoutOpen(false)
    setPayoutAmount('')
    setPayoutNote('')
    setPayoutSuccess(true)
    setTimeout(() => setPayoutSuccess(false), 5000)
    load()
  }

  async function submitMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!messageSubject || !partner) return
    setSavingMessage(true)
    const supabase = createClient()
    await supabase.from('requestbox_messages').insert({
      message_id: `RBM-${Date.now().toString().slice(-6)}`,
      type: 'message',
      subject: messageSubject,
      body: messageBody || null,
      status: 'unread',
      priority: 'normal',
      from_partner_id: partner.id,
    })
    setSavingMessage(false)
    setMessageOpen(false)
    setMessageSubject('')
    setMessageBody('')
    setMessageSuccess(true)
    setTimeout(() => setMessageSuccess(false), 4000)
    load()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-600" size={28} /></div>

  if (!partner) return (
    <div className="text-center py-20">
      <Package size={32} className="text-gray-200 mx-auto mb-3" />
      <p className="text-sm text-gray-400">No partner account linked to your profile.</p>
      <p className="text-xs text-gray-300 mt-1">Contact your administrator.</p>
    </div>
  )

  const totalTopup   = containers.reduce((s, c) => s + Math.max(c.topup_needed_ngn, 0), 0)
  const totalPosition = partner.wallet_balance + partner.wallet_allocated
  const unreadMsgs   = myMessages.filter(m => m.has_unread_reply).length

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* Welcome header */}
      <div className="bg-gradient-to-br from-brand-700 to-brand-900 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-brand-300 text-xs font-medium uppercase tracking-wide mb-1">Partner portal</p>
            <h1 className="text-2xl font-bold">{partner.name}</h1>
            <p className="text-brand-300 text-xs mt-1 font-mono">{partner.partner_id}</p>
          </div>
          <div className="text-right">
            <p className="text-brand-300 text-xs">Available wallet</p>
            <p className="text-3xl font-bold">{fmt(partner.wallet_balance)}</p>
            <p className="text-brand-300 text-xs mt-1">Total position: {fmt(totalPosition)}</p>
          </div>
        </div>

        {totalTopup > 0 && (
          <div className="mt-4 p-3 bg-amber-400/20 border border-amber-300/30 rounded-xl flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-300 shrink-0" />
            <p className="text-xs text-amber-100 font-medium">
              Outstanding top-up of <span className="font-bold text-white">{fmt(totalTopup)}</span> required for your container investments.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 mt-5 flex-wrap">
          <button onClick={() => setPayoutOpen(true)} disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50 border border-white/20">
            <ArrowDownCircle size={14} /> Request payout
          </button>
          <button onClick={() => setMessageOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-xl transition-colors border border-white/20">
            <MessageSquare size={14} /> Send message
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
      {messageSuccess && (
        <div className="flex items-center gap-3 p-4 bg-brand-50 rounded-xl border border-brand-200">
          <CheckCircle2 size={16} className="text-brand-600 shrink-0" />
          <p className="text-sm font-medium text-brand-700">Message sent. Our team will respond shortly.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {[
            { key: 'overview',    label: 'Overview' },
            { key: 'containers',  label: 'My containers',  count: containers.length },
            { key: 'wallet',      label: 'Wallet',         count: walletTxns.length },
            { key: 'messages',    label: 'Messages',       count: myMessages.length, unread: unreadMsgs },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              {tab.count != null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.count}
                </span>
              )}
              {(tab.unread ?? 0) > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {tab.unread}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Available wallet',       value: fmt(partner.wallet_balance),   color: 'text-brand-700', sub: 'Ready to use or withdraw' },
                { label: 'Allocated to containers', value: fmt(partner.wallet_allocated), color: 'text-blue-700',  sub: 'Locked in investments' },
                { label: 'Total profit earned',    value: partner.total_profit > 0 ? fmt(partner.total_profit) : '—', color: 'text-green-700', sub: 'From completed sales' },
                { label: 'Total withdrawn',        value: fmt(partner.total_withdrawn),  color: 'text-gray-600',  sub: 'All-time payouts to bank' },
              ].map(m => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                  <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Investment summary</p>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { label: 'Active containers',     value: containers.filter(c => c.container_status !== 'completed').length, warn: false },
                  { label: 'Sales completed',       value: containers.filter(c => c.sales_status === 'completed').length, warn: false },
                  { label: 'Outstanding top-ups',   value: containers.filter(c => c.topup_needed_ngn > 0).length, warn: true },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-600">{item.label}</span>
                    <span className={`text-sm font-bold ${item.warn && item.value > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CONTAINERS */}
        {activeTab === 'containers' && (
          <div className="divide-y divide-gray-50">
            {containers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Package size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No containers allocated yet.</p>
              </div>
            ) : containers.map(c => {
              const isExpanded = expandedContainer === c.container_db_id
              const hasTopup   = c.topup_needed_ngn > 0
              return (
                <div key={c.container_db_id}>
                  <button className="w-full px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
                    onClick={() => setExpandedContainer(isExpanded ? null : c.container_db_id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{c.container_id}</span>
                          {c.tracking_number && <span className="text-xs text-gray-400 font-mono">{c.tracking_number}</span>}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                            ${c.sales_status === 'completed'   ? 'bg-green-50 text-green-700'
                            : c.sales_status === 'in_progress' ? 'bg-amber-50 text-amber-700'
                            : 'bg-gray-100 text-gray-500'}`}>
                            {c.sales_status === 'completed' ? 'Sales completed'
                              : c.sales_status === 'in_progress' ? 'Sales in progress'
                              : 'Not yet sold'}
                          </span>
                          <span className="text-xs text-gray-400">{c.percentage}% stake</span>
                          {hasTopup && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              <AlertTriangle size={10} /> Top-up: {fmt(c.topup_needed_ngn)}
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
                  {isExpanded && (
                    <div className="px-5 pb-4 bg-gray-50/30 border-t border-gray-50">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3">
                        {[
                          { label: 'Quoted landing cost (my share)', value: fmt(c.partner_quoted_cost_ngn), color: 'text-gray-900' },
                          { label: 'Amount paid',                    value: fmt(c.amount_received_ngn),     color: 'text-green-700' },
                          { label: 'Outstanding top-up',             value: hasTopup ? fmt(c.topup_needed_ngn) : '✓ Fully paid', color: hasTopup ? 'text-amber-700' : 'text-green-700' },
                          { label: 'Expected return',                value: c.partner_expected_return > 0 ? fmt(c.partner_expected_return) : 'Pending presale', color: 'text-blue-700' },
                          { label: 'Credited to my wallet',          value: c.partner_credited_ngn > 0 ? fmt(c.partner_credited_ngn) : '—', color: 'text-emerald-700' },
                          { label: 'Profit',                         value: c.partner_revenue_share > 0 ? `${c.partner_profit >= 0 ? '+' : ''}${fmt(c.partner_profit)}` : 'Pending sale', color: c.partner_revenue_share > 0 ? (c.partner_profit >= 0 ? 'text-green-700' : 'text-red-600') : 'text-gray-400' },
                        ].map(m => (
                          <div key={m.label} className="bg-white rounded-lg p-3 border border-gray-100">
                            <p className="text-xs text-gray-400 mb-0.5 leading-tight">{m.label}</p>
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

        {/* WALLET */}
        {activeTab === 'wallet' && (
          <div>
            <div className="px-5 py-4 bg-brand-50/30 border-b border-gray-100 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400">Available balance</p>
                <p className="text-xl font-bold text-brand-700">{fmt(partner.wallet_balance)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Allocated</p>
                <p className="text-xl font-bold text-blue-700">{fmt(partner.wallet_allocated)}</p>
              </div>
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
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${txn.amount > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                      {txn.amount > 0
                        ? <TrendingUp size={14} className="text-green-600" />
                        : <ArrowDownCircle size={14} className="text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{TXN_TYPE_LABEL[txn.type] ?? txn.type}</p>
                      {txn.description && <p className="text-xs text-gray-400 truncate">{txn.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${txn.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {txn.amount > 0 ? '+' : ''}{fmt(Math.abs(txn.amount))}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(txn.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MESSAGES */}
        {activeTab === 'messages' && (
          <div className="flex" style={{ minHeight: '400px' }}>
            {/* Message list */}
            <div className={`border-r border-gray-100 flex flex-col ${selectedMessage ? 'w-64 shrink-0' : 'flex-1'}`}>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">My messages & requests</p>
                <button onClick={() => setMessageOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                  <MessageSquare size={11} /> New
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                {myMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Inbox size={20} className="text-gray-200" />
                    <p className="text-xs text-gray-400">No messages yet</p>
                  </div>
                ) : myMessages.map(msg => (
                  <button key={msg.id}
                    onClick={() => openMessage(msg)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                      ${selectedMessage?.id === msg.id ? 'bg-brand-50/50 border-l-2 border-brand-500' : ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        {msg.has_unread_reply && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                        <span className={`text-xs truncate ${msg.has_unread_reply ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {TYPE_LABEL[msg.type] ?? msg.type}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{timeAgo(msg.created_at)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{msg.subject}</p>
                    {msg.amount && <p className="text-xs font-semibold text-brand-600 mt-0.5">{fmt(msg.amount)}</p>}
                  </button>
                ))}
              </div>
            </div>

            {/* Message detail */}
            {selectedMessage && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{selectedMessage.subject}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                      <span>{TYPE_LABEL[selectedMessage.type] ?? selectedMessage.type}</span>
                      <span>·</span>
                      <span>{timeAgo(selectedMessage.created_at)}</span>
                      {selectedMessage.amount && (
                        <><span>·</span><span className="font-semibold text-brand-600">{fmt(selectedMessage.amount)}</span></>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelectedMessage(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400 shrink-0">
                    <X size={14} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {selectedMessage.body && (
                    <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-700 leading-relaxed">
                      {selectedMessage.body}
                    </div>
                  )}
                  {selectedMessage.replies.map(reply => (
                    <div key={reply.id} className={`flex items-start gap-2 ${reply.from_partner ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${reply.from_partner ? 'bg-brand-100' : 'bg-gray-200'}`}>
                        <span className={`text-xs font-bold ${reply.from_partner ? 'text-brand-700' : 'text-gray-600'}`}>
                          {reply.sender_name[0].toUpperCase()}
                        </span>
                      </div>
                      <div className={`max-w-[75%] ${reply.from_partner ? 'items-end flex flex-col' : ''}`}>
                        <p className="text-xs text-gray-400 mb-0.5">{reply.from_partner ? 'You' : reply.sender_name} · {timeAgo(reply.created_at)}</p>
                        <div className={`px-3 py-2 rounded-xl text-sm ${reply.from_partner ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          {reply.body}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedMessage.status !== 'resolved' && selectedMessage.status !== 'rejected' && (
                  <div className="px-5 py-3 border-t border-gray-100 flex items-end gap-2">
                    <textarea rows={2} value={replyText} onChange={e => setReplyText(e.target.value)}
                      placeholder="Reply to support..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
                    <button onClick={sendReply} disabled={sendingReply || !replyText.trim()}
                      className="p-2.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 shrink-0">
                      {sendingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PAYOUT MODAL */}
      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="Request a payout" size="sm">
        <form onSubmit={submitPayout} className="space-y-4">
          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <p className="text-xs text-brand-700 font-medium">Available: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-brand-600 mt-0.5">Your request will be sent to our team. You will receive a notification when processed.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={payoutAmount} onChange={setPayoutAmount} placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (optional)</label>
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

      {/* SEND MESSAGE MODAL */}
      <Modal open={messageOpen} onClose={() => setMessageOpen(false)} title="Send a message" size="sm">
        <form onSubmit={submitMessage} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject <span className="text-red-400">*</span></label>
            <input required value={messageSubject} onChange={e => setMessageSubject(e.target.value)}
              placeholder="What is this about?"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
            <textarea rows={4} value={messageBody} onChange={e => setMessageBody(e.target.value)}
              placeholder="Write your message to Hydevest support..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setMessageOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingMessage || !messageSubject}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingMessage ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
