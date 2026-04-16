'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, Package, TrendingUp,
  Wallet, AlertTriangle, Pencil, Check, Plus
} from 'lucide-react'
import Link from 'next/link'
import AmountInput from '@/components/ui/AmountInput'
import Modal from '@/components/ui/Modal'
import { usePermissions, can } from '@/lib/permissions/hooks'

interface ContainerDetail {
  container_id: string
  tracking_number: string | null
  trip_id: string
  trip_title: string
  container_status: string
  sale_type: string | null
  pieces_purchased: number
  quoted_price_usd: number | null
  unit_price_usd: number
  shipping_amount_usd: number
  surcharge_ngn: number
  waer: number
  general_expense_share_ngn: number
  full_quoted_landing_cost_ngn: number
  expected_sale_revenue: number
  actual_sales: number
  sales_status: string
}

interface PartnerFunder {
  funder_record_id: string
  partner_db_id: string
  funder_name: string
  percentage: number
  partner_quoted_cost_ngn: number
  amount_received_ngn: number
  topup_needed_ngn: number
  partner_revenue_share: number
  partner_profit: number
  display_value_override: number | null
  display_value_note: string | null
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PartnershipContainerDrilldownPage() {
  const params = useParams()
  const containerDbId = params.id as string

  const { permissions, isSuperAdmin } = usePermissions()
  const canViewCosts = can(permissions, isSuperAdmin, 'view_costs')

  const [container, setContainer] = useState<ContainerDetail | null>(null)
  const [funders, setFunders] = useState<PartnerFunder[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  // Edit received amount modal
  const [editReceivedOpen, setEditReceivedOpen] = useState(false)
  const [editFunder, setEditFunder] = useState<PartnerFunder | null>(null)
  const [editReceivedValue, setEditReceivedValue] = useState('')
  const [editReceivedNote, setEditReceivedNote] = useState('')
  const [savingReceived, setSavingReceived] = useState(false)

  // Edit display value modal
  const [editDisplayOpen, setEditDisplayOpen] = useState(false)
  const [editDisplayFunder, setEditDisplayFunder] = useState<PartnerFunder | null>(null)
  const [editDisplayValue, setEditDisplayValue] = useState('')
  const [editDisplayNote, setEditDisplayNote] = useState('')
  const [savingDisplay, setSavingDisplay] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: viewData } = await supabase
      .from('partnership_container_view')
      .select('*')
      .eq('container_db_id', containerDbId)

    if (!viewData?.length) { setLoading(false); return }

    const row = viewData[0]
    const trip = await supabase.from('trips').select('trip_id, title').eq('id', row.trip_id).single()
    const presale = await supabase.from('presales').select('expected_sale_revenue, sale_type').eq('container_id', containerDbId).single()
    const salesOrders = await supabase.from('sales_orders').select('customer_payable').eq('container_id', containerDbId)
    const containerData = await supabase.from('containers').select('status').eq('id', containerDbId).single()

    const actualSales = (salesOrders.data ?? []).reduce((s, so) => s + Number(so.customer_payable), 0)
    const status = containerData.data?.status ?? 'ordered'

    let salesStatus = 'not_started'
    if (actualSales > 0 && status === 'completed') salesStatus = 'completed'
    else if (actualSales > 0) salesStatus = 'in_progress'

    setContainer({
      container_id: row.container_ref,
      tracking_number: row.tracking_number,
      trip_id: trip.data?.trip_id ?? '—',
      trip_title: trip.data?.title ?? '—',
      container_status: status,
      sale_type: presale.data?.sale_type ?? null,
      pieces_purchased: row.pieces_purchased,
      quoted_price_usd: row.quoted_price_usd ? Number(row.quoted_price_usd) : null,
      unit_price_usd: Number(row.unit_price_usd),
      shipping_amount_usd: Number(row.shipping_amount_usd ?? 0),
      surcharge_ngn: Number(row.surcharge_ngn ?? 0),
      waer: Number(row.waer),
      general_expense_share_ngn: Number(row.general_expense_share_ngn ?? 0),
      full_quoted_landing_cost_ngn: Number(row.full_quoted_landing_cost_ngn),
      expected_sale_revenue: Number(presale.data?.expected_sale_revenue ?? 0),
      actual_sales: actualSales,
      sales_status: salesStatus,
    })

    setFunders(viewData.map(r => {
      const pct = Number(r.percentage) / 100
      const partnerRevShare = actualSales * pct
      const partnerCost = Number(r.partner_quoted_cost_ngn)
      return {
        funder_record_id: r.funder_id,
        partner_db_id: r.partner_db_id,
        funder_name: r.funder_name,
        percentage: Number(r.percentage),
        partner_quoted_cost_ngn: partnerCost,
        amount_received_ngn: Number(r.amount_received_ngn),
        topup_needed_ngn: Number(r.topup_needed_ngn),
        partner_revenue_share: partnerRevShare,
        partner_profit: partnerRevShare - partnerCost,
        display_value_override: r.display_value_override ? Number(r.display_value_override) : null,
        display_value_note: r.display_value_note,
      }
    }))

    setLoading(false)
  }, [containerDbId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  async function saveReceivedAmount(e: React.FormEvent) {
    e.preventDefault()
    if (!editFunder) return
    setSavingReceived(true)
    const supabase = createClient()
    await supabase.from('container_funders')
      .update({ amount_received_ngn: parseFloat(editReceivedValue) || 0 })
      .eq('id', editFunder.funder_record_id)
    setSavingReceived(false)
    setEditReceivedOpen(false)
    load()
  }

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
      .eq('id', editDisplayFunder.funder_record_id)
    setSavingDisplay(false)
    setEditDisplayOpen(false)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )
  if (!container) return <div className="text-center py-16 text-gray-400">Container not found.</div>

  const totalTopup = funders.reduce((s, f) => s + Math.max(f.topup_needed_ngn, 0), 0)
  const totalReceived = funders.reduce((s, f) => s + f.amount_received_ngn, 0)
  const totalRevShare = funders.reduce((s, f) => s + f.partner_revenue_share, 0)

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/partnership"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{container.container_id}</span>
            <span className="font-mono text-xs text-gray-500">{container.tracking_number ?? '—'}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize
              ${container.container_status === 'completed' ? 'bg-green-50 text-green-700'
                : container.container_status === 'in_transit' ? 'bg-amber-50 text-amber-700'
                : 'bg-blue-50 text-blue-700'}`}>
              {container.container_status}
            </span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mt-0.5">{container.trip_title}</h1>
          <p className="text-xs text-gray-400">{container.trip_id} · {container.pieces_purchased.toLocaleString()} pieces · WAER: ₦{container.waer.toLocaleString()}</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ...(canViewCosts ? [{ label: 'Full quoted landing cost', value: fmt(container.full_quoted_landing_cost_ngn), color: 'text-gray-900', bg: 'bg-white' }] : []),
          { label: 'Expected sale revenue', value: container.expected_sale_revenue > 0 ? fmt(container.expected_sale_revenue) : '—', color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Actual sales', value: container.actual_sales > 0 ? fmt(container.actual_sales) : '—', color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Total top-up needed', value: totalTopup > 0 ? fmt(totalTopup) : 'Fully funded', color: totalTopup > 0 ? 'text-amber-700' : 'text-green-700', bg: totalTopup > 0 ? 'bg-amber-50' : 'bg-green-50' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-sm font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Cost breakdown */}
      {canViewCosts && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Quoted landing cost breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            {[
              { label: 'Quoted price/pc (USD)', value: `$${(container.quoted_price_usd ?? container.unit_price_usd).toFixed(2)}` },
              { label: 'Pieces purchased', value: container.pieces_purchased.toLocaleString() },
              { label: 'Shipping (USD)', value: `$${container.shipping_amount_usd.toFixed(2)}` },
              { label: 'Surcharge (NGN)', value: fmt(container.surcharge_ngn) },
              { label: 'General expenses share', value: fmt(container.general_expense_share_ngn) },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                <p className="text-sm font-semibold text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">WAER used: <span className="font-semibold text-gray-700">₦{container.waer.toLocaleString()}</span></p>
            <p className="text-sm font-bold text-gray-900">Total: {fmt(container.full_quoted_landing_cost_ngn)}</p>
          </div>
        </div>
      )}

      {/* Partner breakdown table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Partner breakdown</h2>
          <p className="text-xs text-gray-400 mt-0.5">{funders.length} partner{funders.length !== 1 ? 's' : ''} · Total received: {fmt(totalReceived)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Partner</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Stake %</th>
                {canViewCosts && (
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Investment (quoted cost)</th>
                )}
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Amount received</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Top-up needed</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Display value</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Expected return</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Actual return</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Profit</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {funders.map(f => {
                const hasTopup = f.topup_needed_ngn > 0
                const profitPositive = f.partner_profit >= 0
                const displayVal = f.display_value_override ?? f.partner_quoted_cost_ngn
                const expectedReturn = container.expected_sale_revenue * (f.percentage / 100)
                return (
                  <tr key={f.partner_db_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                          <span className="text-brand-700 text-xs font-bold">{f.funder_name[0].toUpperCase()}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{f.funder_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-sm font-bold text-brand-700">{f.percentage.toFixed(0)}%</span>
                    </td>
                    {canViewCosts && (
                      <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap text-xs">{fmt(f.partner_quoted_cost_ngn)}</td>
                    )}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-xs font-medium text-green-600">{fmt(f.amount_received_ngn)}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {hasTopup ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={10} /> {fmt(f.topup_needed_ngn)}
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 font-medium">✓ Funded</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-semibold ${f.display_value_override ? 'text-blue-700' : 'text-gray-700'}`}>
                          {fmt(displayVal)}
                        </span>
                        {f.display_value_override && (
                          <span className="text-xs bg-blue-50 text-blue-500 px-1 rounded" title={f.display_value_note ?? ''}>✎</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {container.expected_sale_revenue > 0 ? fmt(expectedReturn) : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {f.partner_revenue_share > 0
                        ? <span className="text-xs font-semibold text-green-600">{fmt(f.partner_revenue_share)}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {f.partner_revenue_share > 0 ? (
                        <span className={`text-xs font-bold ${profitPositive ? 'text-green-600' : 'text-red-500'}`}>
                          {profitPositive ? '+' : ''}{fmt(f.partner_profit)}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditFunder(f); setEditReceivedValue(f.amount_received_ngn.toString()); setEditReceivedOpen(true) }}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-gray-300 hover:text-green-600 transition-colors"
                          title="Update amount received">
                          <Wallet size={13} />
                        </button>
                        <button
                          onClick={() => { setEditDisplayFunder(f); setEditDisplayValue(f.display_value_override?.toString() ?? ''); setEditDisplayNote(f.display_value_note ?? ''); setEditDisplayOpen(true) }}
                          className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors"
                          title="Edit display value">
                          <Pencil size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit received amount modal */}
      <Modal open={editReceivedOpen} onClose={() => setEditReceivedOpen(false)}
        title="Update amount received" description={editFunder?.funder_name ?? ''} size="sm">
        <form onSubmit={saveReceivedAmount} className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1 text-xs text-gray-600">
            {canViewCosts && (
              <div className="flex justify-between">
                <span>Partner investment (quoted cost)</span>
                <span className="font-semibold">{editFunder ? fmt(editFunder.partner_quoted_cost_ngn) : '—'}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Currently received</span>
              <span className="font-semibold text-green-600">{editFunder ? fmt(editFunder.amount_received_ngn) : '—'}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1">
              <span>Top-up needed</span>
              <span className={`font-semibold ${(editFunder?.topup_needed_ngn ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {editFunder ? fmt(Math.max(editFunder.topup_needed_ngn, 0)) : '—'}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Total amount received (NGN) <span className="text-red-400">*</span></label>
            <AmountInput required value={editReceivedValue} onChange={setEditReceivedValue}
              placeholder="0.00"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditReceivedOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={savingReceived}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {savingReceived ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit display value modal */}
      <Modal open={editDisplayOpen} onClose={() => setEditDisplayOpen(false)}
        title="Edit display value" description={editDisplayFunder?.funder_name ?? ''} size="sm">
        <form onSubmit={saveDisplayValue} className="space-y-4">
          {canViewCosts && (
            <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
              <p className="text-xs text-brand-700 font-medium">
                Calculated value: <span className="font-bold">{editDisplayFunder ? fmt(editDisplayFunder.partner_quoted_cost_ngn) : '—'}</span>
              </p>
              <p className="text-xs text-brand-600 mt-0.5">Override this to show a custom value to the partner in their dashboard.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display value (NGN)</label>
            <AmountInput value={editDisplayValue} onChange={setEditDisplayValue}
              placeholder="Leave blank to use calculated value"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Internal note</label>
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
    </div>
  )
}

