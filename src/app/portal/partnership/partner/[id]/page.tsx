'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Wallet, AlertTriangle,
  Plus, ArrowDownCircle, TrendingUp, Package,
  RefreshCw, Info
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
  wallet_allocated: number
  total_invested: number
  total_profit: number
  total_withdrawn: number
  is_active: boolean
}

interface ContainerAllocation {
  funder_record_id: string
  container_db_id: string
  container_id: string
  tracking_number: string | null
  trip_id: string
  percentage: number
  partner_quoted_cost_ngn: number
  amount_received_ngn: number
  partner_credited_ngn: number
  topup_needed_ngn: number
  display_value: number
  partner_expected_return: number
  partner_revenue_share: number
  partner_profit: number
  sales_status: string
  container_status: string
  total_recovered_ngn: number
  is_fully_funded: boolean
  max_creditable_ngn: number
}

interface WalletTxn {
  id: string
  type: string
  amount: number
  description: string | null
  reference_ref: string | null
  created_at: string
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TXN_TYPE_COLOR: Record<string, string> = {
  topup:        'bg-green-50 text-green-700',
  credit:       'bg-green-50 text-green-700',
  debit:        'bg-red-50 text-red-600',
  payout:       'bg-red-50 text-red-600',
  allocation:   'bg-blue-50 text-blue-700',
  reinvestment: 'bg-brand-50 text-brand-700',
  sale_credit:  'bg-emerald-50 text-emerald-700',
}

const TXN_DESCRIPTIONS: Record<string, (ref?: string) => string> = {
  topup:       (ref) => `Cash received into Hydevest account${ref ? ` — ref: ${ref}` : ''}`,
  allocation:  (ref) => `Wallet funds allocated to container${ref ? ` ${ref}` : ''}`,
  sale_credit: (ref) => `Container${ref ? ` ${ref}` : ''} sale proceeds credited to wallet`,
  payout:      (ref) => `Funds sent to partner bank account${ref ? ` — ref: ${ref}` : ''}`,
  debit:       (ref) => `Deduction from wallet${ref ? ` — ${ref}` : ''}`,
  reinvestment:(ref) => `Funds moved to reinvestment pool${ref ? ` — ref: ${ref}` : ''}`,
}

export default function PartnerAdminPage() {
  const params = useParams()
  const router = useRouter()
  const partnerDbId = params.id as string

  const [partner, setPartner] = useState<Partner | null>(null)
  const [allocations, setAllocations] = useState<ContainerAllocation[]>([])
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'containers' | 'wallet'>('containers')
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  // Top-up wallet modal
  const [topupOpen, setTopupOpen] = useState(false)
  const [topupAmount, setTopupAmount] = useState('')
  const [topupNote, setTopupNote] = useState('')
  const [savingTopup, setSavingTopup] = useState(false)

  // Allocate to container modal
  const [allocateOpen, setAllocateOpen] = useState(false)
  const [allocateContainerId, setAllocateContainerId] = useState('')
  const [allocateAmount, setAllocateAmount] = useState('')
  const [allocateNote, setAllocateNote] = useState('')
  const [savingAllocate, setSavingAllocate] = useState(false)

  // Credit from sale modal
  const [saleOpen, setSaleOpen] = useState(false)
  const [saleContainerId, setSaleContainerId] = useState('')
  const [saleAmount, setSaleAmount] = useState('')
  const [saleNote, setSaleNote] = useState('')
  const [savingSale, setSavingSale] = useState(false)

  // Deduct / payout modal
  const [deductOpen, setDeductOpen] = useState(false)
  const [deductAmount, setDeductAmount] = useState('')
  const [deductNote, setDeductNote] = useState('')
  const [deductType, setDeductType] = useState<'payout' | 'debit'>('payout')
  const [savingDeduct, setSavingDeduct] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [
      { data: partnerData },
      { data: viewData },
      { data: walletData },
    ] = await Promise.all([
      supabase.from('partners').select('*').eq('id', partnerDbId).single(),
      supabase.from('partnership_container_view').select('*').eq('partner_db_id', partnerDbId),
      supabase.from('partner_wallet_transactions')
        .select('id, type, amount, description, reference_ref, created_at')
        .eq('partner_id', partnerDbId)
        .order('created_at', { ascending: false }),
    ])

    setPartner({
      ...partnerData,
      wallet_balance:   Number(partnerData?.wallet_balance ?? 0),
      wallet_allocated: Number(partnerData?.wallet_allocated ?? 0),
      total_invested:   Number(partnerData?.total_invested ?? 0),
      total_profit:     Number(partnerData?.total_profit ?? 0),
      total_withdrawn:  Number(partnerData?.total_withdrawn ?? 0),
    })
    setWalletTxns((walletData ?? []).map(w => ({ ...w, amount: Number(w.amount) })))

    if (!viewData?.length) { setLoading(false); return }

    const containerDbIds = viewData.map(r => r.container_db_id)

    const [{ data: containerData }, { data: salesOrders }, { data: presales }, { data: trips }] = await Promise.all([
      supabase.from('containers').select('id, status').in('id', containerDbIds),
      supabase.from('sales_orders').select('id, container_id, customer_payable, outstanding_balance, payment_status').in('container_id', containerDbIds),
      supabase.from('presales').select('container_id, expected_sale_revenue').in('container_id', containerDbIds),
      supabase.from('trips').select('id, trip_id').in('id', [...new Set(viewData.map(r => r.trip_id))]),
    ])

    const salesOrderIds = (salesOrders ?? []).map(so => so.id)
    const { data: recoveries } = salesOrderIds.length > 0
      ? await supabase.from('recoveries')
          .select('sales_order_id, amount_paid')
          .in('sales_order_id', salesOrderIds)
      : { data: [] }

    const statusMap    = Object.fromEntries((containerData ?? []).map(c => [c.id, c.status]))
    const tripMap      = Object.fromEntries((trips ?? []).map(t => [t.id, t]))
    const presaleMap   = Object.fromEntries((presales ?? []).map(p => [p.container_id, p]))

    // Total sales revenue per container
    const revenueByContainer = (salesOrders ?? []).reduce((acc, so) => {
      acc[so.container_id] = (acc[so.container_id] ?? 0) + Number(so.customer_payable)
      return acc
    }, {} as Record<string, number>)

    // Total recoveries per sales order → per container
    const salesOrderContainerMap = Object.fromEntries((salesOrders ?? []).map(so => [so.id, so.container_id]))
    const recoveredByContainer = (recoveries ?? []).reduce((acc, r) => {
      const cId = salesOrderContainerMap[r.sales_order_id]
      if (cId) acc[cId] = (acc[cId] ?? 0) + Number(r.amount_paid)
      return acc
    }, {} as Record<string, number>)

    setAllocations(viewData.map(r => {
      const pct              = Number(r.percentage) / 100
      const actualSales      = revenueByContainer[r.container_db_id] ?? 0
      const totalRecovered   = recoveredByContainer[r.container_db_id] ?? 0
      const partnerRevShare  = actualSales * pct
      const partnerRecovered = totalRecovered * pct
      const partnerCost      = Number(r.partner_quoted_cost_ngn)
      const partnerCredited  = Number(r.partner_credited_ngn ?? 0)
      const displayVal       = r.display_value_override ? Number(r.display_value_override) : partnerCost
      const status           = statusMap[r.container_db_id] ?? 'ordered'
      const presale          = presaleMap[r.container_db_id]
      const trip             = tripMap[r.trip_id]
      const isFullyFunded    = Number(r.amount_received_ngn) >= partnerCost
      // Max creditable = partner's share of actual recoveries - what has already been credited
      const maxCreditable    = Math.max(partnerRecovered - partnerCredited, 0)

      let salesStatus = 'not_started'
      if (actualSales > 0 && status === 'completed') salesStatus = 'completed'
      else if (actualSales > 0) salesStatus = 'in_progress'

      return {
        funder_record_id:      r.funder_id,
        container_db_id:       r.container_db_id,
        container_id:          r.container_ref,
        tracking_number:       r.tracking_number,
        trip_id:               trip?.trip_id ?? '—',
        percentage:            Number(r.percentage),
        partner_quoted_cost_ngn: partnerCost,
        amount_received_ngn:   Number(r.amount_received_ngn),
        partner_credited_ngn:  partnerCredited,
        topup_needed_ngn:      Number(r.topup_needed_ngn),
        display_value:         displayVal,
        partner_expected_return: Number(presale?.expected_sale_revenue ?? 0) * pct,
        partner_revenue_share: partnerRevShare,
        partner_profit:        partnerRevShare - partnerCost,
        sales_status:          salesStatus,
        container_status:      status,
        total_recovered_ngn:   totalRecovered,
        is_fully_funded:       isFullyFunded,
        max_creditable_ngn:    maxCreditable,
      }
    }))

    setLoading(false)
  }, [partnerDbId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  // ── WALLET ACTIONS ────────────────────────────────────────────────

  async function doTopup(e: React.FormEvent) {
    e.preventDefault()
    if (!topupAmount) return
    setSavingTopup(true)
    const supabase = createClient()
    const amount = parseFloat(topupAmount)
    const desc = topupNote
      ? `Cash received — ${topupNote}`
      : TXN_DESCRIPTIONS.topup()

    await supabase.from('partner_wallet_transactions').insert({
      partner_id: partnerDbId, type: 'topup', amount,
      description: desc, performed_by: currentUser?.id,
    })
    await supabase.from('partners').update({
      wallet_balance: (partner?.wallet_balance ?? 0) + amount,
    }).eq('id', partnerDbId)

    setSavingTopup(false); setTopupOpen(false); setTopupAmount(''); setTopupNote('')
    load()
  }

  async function doAllocate(e: React.FormEvent) {
    e.preventDefault()
    if (!allocateAmount || !allocateContainerId) return
    setSavingAllocate(true)
    const supabase = createClient()
    const amount    = parseFloat(allocateAmount)
    const container = allocations.find(a => a.container_db_id === allocateContainerId)
    const desc      = TXN_DESCRIPTIONS.allocation(container?.container_id)

    await supabase.from('partner_wallet_transactions').insert({
      partner_id: partnerDbId, type: 'allocation', amount: -amount,
      description: allocateNote ? `${desc} — ${allocateNote}` : desc,
      reference_type: 'container', reference_id: allocateContainerId,
      reference_ref: container?.container_id ?? null,
      performed_by: currentUser?.id,
    })

    // Update amount_received on container_funders
    const newReceived = (container?.amount_received_ngn ?? 0) + amount
    await supabase.from('container_funders')
      .update({ amount_received_ngn: newReceived })
      .eq('id', container?.funder_record_id)

    await supabase.from('partners').update({
      wallet_balance:   Math.max((partner?.wallet_balance ?? 0) - amount, 0),
      wallet_allocated: (partner?.wallet_allocated ?? 0) + amount,
    }).eq('id', partnerDbId)

    setSavingAllocate(false); setAllocateOpen(false)
    setAllocateContainerId(''); setAllocateAmount(''); setAllocateNote('')
    load()
  }

  async function doSaleCredit(e: React.FormEvent) {
    e.preventDefault()
    if (!saleAmount) return
    setSavingSale(true)
    const supabase = createClient()
    const amount    = parseFloat(saleAmount)
    const container = allocations.find(a => a.container_db_id === saleContainerId)
    const desc      = TXN_DESCRIPTIONS.sale_credit(container?.container_id)

    await supabase.from('partner_wallet_transactions').insert({
      partner_id: partnerDbId, type: 'sale_credit', amount,
      description: saleNote ? `${desc} — ${saleNote}` : desc,
      reference_type: 'container', reference_id: saleContainerId || null,
      reference_ref: container?.container_id ?? null,
      performed_by: currentUser?.id,
    })

    // Update partner_credited_ngn on container_funders
    if (container) {
      const newCredited = (container.partner_credited_ngn ?? 0) + amount
      await supabase.from('container_funders')
        .update({ partner_credited_ngn: newCredited })
        .eq('id', container.funder_record_id)
    }

    // Wallet balance increases, allocated decreases if container fully settled
    const isFullySettled = container
      ? (container.partner_credited_ngn + amount) >= container.partner_revenue_share
      : false

    await supabase.from('partners').update({
      wallet_balance:   (partner?.wallet_balance ?? 0) + amount,
      wallet_allocated: isFullySettled
        ? Math.max((partner?.wallet_allocated ?? 0) - (container?.amount_received_ngn ?? 0), 0)
        : partner?.wallet_allocated,
    }).eq('id', partnerDbId)

    setSavingSale(false); setSaleOpen(false)
    setSaleContainerId(''); setSaleAmount(''); setSaleNote('')
    load()
  }

  async function doDeduct(e: React.FormEvent) {
    e.preventDefault()
    if (!deductAmount) return
    setSavingDeduct(true)
    const supabase = createClient()
    const amount = parseFloat(deductAmount)
    const desc   = deductNote
      ? `${TXN_DESCRIPTIONS[deductType]()} — ${deductNote}`
      : TXN_DESCRIPTIONS[deductType]()

    await supabase.from('partner_wallet_transactions').insert({
      partner_id: partnerDbId, type: deductType, amount: -amount,
      description: desc, performed_by: currentUser?.id,
    })

    await supabase.from('partners').update({
      wallet_balance:   Math.max((partner?.wallet_balance ?? 0) - amount, 0),
      total_withdrawn:  deductType === 'payout'
        ? (partner?.total_withdrawn ?? 0) + amount
        : partner?.total_withdrawn,
    }).eq('id', partnerDbId)

    // Notify partner via requestbox if payout
    if (deductType === 'payout' && partner) {
      await supabase.from('requestbox_messages').insert({
        message_id: `RBM-${Date.now().toString().slice(-6)}`,
        type: 'message',
        subject: `Payout processed — ${fmt(amount)}`,
        body: `Your payout of ${fmt(amount)} has been processed and sent to your bank account.${deductNote ? ` Note: ${deductNote}` : ''}`,
        status: 'unread',
        priority: 'normal',
        from_partner_id: partner.id,
      })
    }

    setSavingDeduct(false); setDeductOpen(false); setDeductAmount(''); setDeductNote('')
    load()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-600" size={28} /></div>
  if (!partner) return <div className="text-center py-16 text-gray-400">Partner not found.</div>

  const totalTopup      = allocations.reduce((s, a) => s + Math.max(a.topup_needed_ngn, 0), 0)
  const totalProfit     = allocations.reduce((s, a) => s + (a.partner_revenue_share > 0 ? a.partner_profit : 0), 0)
  const totalRevShare   = allocations.reduce((s, a) => s + a.partner_revenue_share, 0)
  const selectedAlloc   = allocations.find(a => a.container_db_id === saleContainerId)

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
          <button onClick={() => setTopupOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-green-200 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
            <Plus size={14} /> Top up wallet
          </button>
          <button onClick={() => setAllocateOpen(true)} disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors">
            <Package size={14} /> Allocate to container
          </button>
          <button onClick={() => setSaleOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors">
            <TrendingUp size={14} /> Credit from sale
          </button>
          <button onClick={() => setDeductOpen(true)} disabled={partner.wallet_balance <= 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors">
            <ArrowDownCircle size={14} /> Deduct / Payout
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Available wallet',      value: fmt(partner.wallet_balance),   color: 'text-brand-700',  bg: 'bg-brand-50',   sub: 'Not allocated' },
          { label: 'Allocated',             value: fmt(partner.wallet_allocated),  color: 'text-blue-700',   bg: 'bg-blue-50',    sub: 'Locked in containers' },
          { label: 'Total position',        value: fmt(partner.wallet_balance + partner.wallet_allocated), color: 'text-gray-900', bg: 'bg-white', sub: 'Wallet + allocated' },
          { label: 'Total profit earned',   value: totalRevShare > 0 ? fmt(totalProfit) : '—', color: totalProfit >= 0 ? 'text-green-700' : 'text-red-600', bg: 'bg-green-50', sub: 'Across all sales' },
          { label: 'Total withdrawn',       value: fmt(partner.total_withdrawn),   color: 'text-gray-600',   bg: 'bg-gray-50',    sub: 'All-time payouts' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-3`}>
            <p className="text-xs text-gray-400 mb-1 leading-tight">{m.label}</p>
            <p className={`text-sm font-bold truncate ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Top-up alert */}
      {totalTopup > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm font-medium text-amber-800">
            Outstanding top-up of <span className="font-bold">{fmt(totalTopup)}</span> across allocated containers.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'containers', label: 'Container allocations', count: allocations.length },
            { key: 'wallet',     label: 'Wallet transactions',   count: walletTxns.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
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

        {/* Containers tab */}
        {activeTab === 'containers' && (
          <div className="overflow-x-auto">
            {allocations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Package size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No containers allocated yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Container','Trip','Stake','Quoted cost','Allocated','Gap','Credited','Exp. return','Actual return','Profit','Status'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allocations.map(a => (
                    <tr key={a.container_db_id}
                      onClick={() => router.push(`/portal/partnership/${a.container_db_id}`)}
                      className="border-b border-gray-50 hover:bg-brand-50/20 transition-colors cursor-pointer group">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="font-mono text-xs font-semibold text-brand-700">{a.container_id}</p>
                        <p className="text-xs text-gray-400 font-mono">{a.tracking_number ?? '—'}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{a.trip_id}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-sm font-bold text-brand-700">{a.percentage.toFixed(0)}%</span>
                      </td>
                      <td className="px-3 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">{fmt(a.partner_quoted_cost_ngn)}</td>
                      <td className="px-3 py-3 text-xs text-green-600 font-medium whitespace-nowrap">{fmt(a.amount_received_ngn)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {a.topup_needed_ngn > 0
                          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              <AlertTriangle size={10} />{fmt(a.topup_needed_ngn)}
                            </span>
                          : <span className="text-xs text-green-600 font-medium">✓ Funded</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {a.partner_credited_ngn > 0
                          ? <span className="text-xs font-semibold text-emerald-600">{fmt(a.partner_credited_ngn)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {a.partner_expected_return > 0 ? fmt(a.partner_expected_return) : '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {a.partner_revenue_share > 0
                          ? <span className="text-xs font-semibold text-green-600">{fmt(a.partner_revenue_share)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {a.partner_revenue_share > 0
                          ? <span className={`text-xs font-bold ${a.partner_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {a.partner_profit >= 0 ? '+' : ''}{fmt(a.partner_profit)}
                            </span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${a.sales_status === 'completed'   ? 'bg-green-50 text-green-700'
                          : a.sales_status === 'in_progress' ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-500'}`}>
                          {a.sales_status === 'completed' ? 'Completed' : a.sales_status === 'in_progress' ? 'In progress' : 'Not started'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Wallet tab */}
        {activeTab === 'wallet' && (
          <div>
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-gray-400">Available</p>
                  <p className="text-lg font-bold text-brand-700">{fmt(partner.wallet_balance)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Allocated</p>
                  <p className="text-lg font-bold text-blue-700">{fmt(partner.wallet_allocated)}</p>
                </div>
              </div>
              <button onClick={() => setTopupOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                <Plus size={12} /> Top up
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
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${TXN_TYPE_COLOR[txn.type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {txn.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-bold text-sm ${txn.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {txn.amount > 0 ? '+' : ''}{fmt(Math.abs(txn.amount))}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 max-w-[240px] truncate">{txn.description ?? '—'}</td>
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
      </div>

      {/* TOP UP MODAL */}
      <Modal open={topupOpen} onClose={() => setTopupOpen(false)} title="Top up partner wallet" size="sm">
        <form onSubmit={doTopup} className="space-y-4">
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-green-700 font-medium">Current balance: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-green-600 mt-0.5">Record cash received from partner into Hydevest bank account.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount received (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={topupAmount} onChange={setTopupAmount} placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reference / note</label>
            <input value={topupNote} onChange={e => setTopupNote(e.target.value)}
              placeholder="e.g. Bank transfer ref: TRF-20250115"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setTopupOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingTopup || !topupAmount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingTopup ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Top up wallet
            </button>
          </div>
        </form>
      </Modal>

      {/* ALLOCATE MODAL */}
      <Modal open={allocateOpen} onClose={() => setAllocateOpen(false)} title="Allocate to container" size="sm">
        <form onSubmit={doAllocate} className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-700 font-medium">Available wallet: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
            <p className="text-xs text-blue-600 mt-0.5">Deducts from wallet and records against the container investment.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Container <span className="text-red-400">*</span></label>
            <select required value={allocateContainerId}
              onChange={e => {
                const a = allocations.find(a => a.container_db_id === e.target.value)
                setAllocateContainerId(e.target.value)
                if (a) setAllocateAmount(Math.min(a.topup_needed_ngn, partner.wallet_balance).toFixed(2))
              }}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">Select container...</option>
              {allocations.map(a => (
                <option key={a.container_db_id} value={a.container_db_id}
                  disabled={a.is_fully_funded && a.topup_needed_ngn <= 0}>
                  {a.container_id} — {a.percentage}%
                  {a.is_fully_funded && a.topup_needed_ngn <= 0
                    ? ' — ✓ Fully funded'
                    : ` — gap: ${fmt(a.topup_needed_ngn)}`}
                </option>
              ))}
            </select>
            {allocateContainerId && (() => {
              const a = allocations.find(a => a.container_db_id === allocateContainerId)
              if (!a) return null
              if (a.is_fully_funded && a.topup_needed_ngn <= 0) {
                return (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-green-50 rounded-lg border border-green-100">
                    <Info size={13} className="text-green-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-green-700">This container is fully funded. No allocation needed.</p>
                  </div>
                )
              }
              if (partner.wallet_balance < a.topup_needed_ngn) {
                return (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                    <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">
                      Wallet balance ({fmt(partner.wallet_balance)}) is less than gap ({fmt(a.topup_needed_ngn)}).
                      You can allocate a partial amount or top up the wallet first.
                    </p>
                  </div>
                )
              }
              return null
            })()}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to allocate (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={allocateAmount} onChange={setAllocateAmount} placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max available: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
            <input value={allocateNote} onChange={e => setAllocateNote(e.target.value)}
              placeholder="e.g. First tranche for CON-0001"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setAllocateOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit"
              disabled={savingAllocate || !allocateAmount || !allocateContainerId ||
                (allocations.find(a => a.container_db_id === allocateContainerId)?.is_fully_funded &&
                 (allocations.find(a => a.container_db_id === allocateContainerId)?.topup_needed_ngn ?? 0) <= 0)}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingAllocate ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />} Allocate
            </button>
          </div>
        </form>
      </Modal>

      {/* CREDIT FROM SALE MODAL */}
      <Modal open={saleOpen} onClose={() => setSaleOpen(false)} title="Credit from container sale" size="sm">
        <form onSubmit={doSaleCredit} className="space-y-4">
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
            <p className="text-xs text-emerald-700 font-medium">Only recovered amounts can be credited. You cannot credit more than the partner's share of actual recoveries received.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Container</label>
            <select value={saleContainerId}
              onChange={e => {
                const a = allocations.find(a => a.container_db_id === e.target.value)
                setSaleContainerId(e.target.value)
                if (a) setSaleAmount(a.max_creditable_ngn > 0 ? a.max_creditable_ngn.toFixed(2) : '')
              }}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="">No container reference</option>
              {allocations.filter(a => a.partner_revenue_share > 0 || a.total_recovered_ngn > 0).map(a => (
                <option key={a.container_db_id} value={a.container_db_id}>
                  {a.container_id} — recoverable: {fmt(a.max_creditable_ngn)}
                </option>
              ))}
            </select>

            {/* Recovery breakdown */}
            {selectedAlloc && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total recovered from customers</span>
                  <span className="font-semibold text-gray-700">{fmt(selectedAlloc.total_recovered_ngn)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Partner's share ({selectedAlloc.percentage}%)</span>
                  <span className="font-semibold text-gray-700">{fmt(selectedAlloc.total_recovered_ngn * selectedAlloc.percentage / 100)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5">
                  <span className="text-gray-500">Already credited</span>
                  <span className="font-semibold text-emerald-600">{fmt(selectedAlloc.partner_credited_ngn)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-700">Max creditable now</span>
                  <span className={`font-bold ${selectedAlloc.max_creditable_ngn > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                    {fmt(selectedAlloc.max_creditable_ngn)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to credit (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={saleAmount} onChange={v => {
              // Cap at max creditable
              const maxC = selectedAlloc?.max_creditable_ngn ?? Infinity
              const parsed = parseFloat(v) || 0
              setSaleAmount(parsed > maxC ? maxC.toFixed(2) : v)
            }} placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            {selectedAlloc && (
              <p className="text-xs text-gray-400 mt-1">
                Max: {fmt(selectedAlloc.max_creditable_ngn)}
                {selectedAlloc.max_creditable_ngn <= 0 && ' — no new recoveries to credit'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
            <input value={saleNote} onChange={e => setSaleNote(e.target.value)}
              placeholder="e.g. Partial recovery credit — Jan 2025"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setSaleOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit"
              disabled={savingSale || !saleAmount || (selectedAlloc?.max_creditable_ngn ?? 0) <= 0}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingSale ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />} Credit wallet
            </button>
          </div>
        </form>
      </Modal>

      {/* DEDUCT / PAYOUT MODAL */}
      <Modal open={deductOpen} onClose={() => setDeductOpen(false)} title="Deduct from wallet" size="sm">
        <form onSubmit={doDeduct} className="space-y-4">
          <div className="p-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs text-red-700 font-medium">Available: <span className="font-bold">{fmt(partner.wallet_balance)}</span></p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'payout', label: 'Payout to bank',   desc: 'Money sent to partner' },
                { value: 'debit',  label: 'General debit',    desc: 'Other deduction' },
              ] as const).map(opt => (
                <button key={opt.value} type="button" onClick={() => setDeductType(opt.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all
                    ${deductType === opt.value ? 'border-red-400 bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <p className={`text-xs font-semibold ${deductType === opt.value ? 'text-red-700' : 'text-gray-700'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={deductAmount} onChange={setDeductAmount} placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Max: {fmt(partner.wallet_balance)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reference / note</label>
            <input value={deductNote} onChange={e => setDeductNote(e.target.value)}
              placeholder={deductType === 'payout' ? 'e.g. Sent to GTB acct ending 4521' : 'Reason for deduction'}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setDeductOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingDeduct || !deductAmount}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingDeduct ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownCircle size={14} />}
              {deductType === 'payout' ? 'Confirm payout' : 'Deduct'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
