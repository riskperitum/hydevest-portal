'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Package, TrendingUp,
  Wallet, AlertTriangle
} from 'lucide-react'
import Link from 'next/link'

interface PartnerContainerRow {
  container_db_id: string
  container_id: string
  tracking_number: string | null
  trip_id: string
  trip_title: string
  container_status: string
  percentage: number
  full_quoted_landing_cost_ngn: number
  partner_quoted_cost_ngn: number
  amount_received_ngn: number
  topup_needed_ngn: number
  display_value: number
  expected_sale_revenue: number
  partner_expected_return: number
  actual_sales: number
  partner_revenue_share: number
  partner_profit: number
  sales_status: string
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PartnerViewPage() {
  const params = useParams()
  const router = useRouter()
  const partnerDbId = params.id as string

  const [partnerName, setPartnerName] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [containers, setContainers] = useState<PartnerContainerRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: viewData } = await supabase
      .from('partnership_container_view')
      .select('*')
      .eq('partner_db_id', partnerDbId)

    if (!viewData?.length) { setLoading(false); return }

    setPartnerName(viewData[0].funder_name)

    // Get partner ID from partners table
    const { data: partnerData } = await supabase
      .from('partners').select('partner_id').eq('id', partnerDbId).single()
    setPartnerId(partnerData?.partner_id ?? '')

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

    const rows: PartnerContainerRow[] = viewData.map(r => {
      const status = statusMap[r.container_db_id] ?? 'ordered'
      const actualSales = revenueByContainer[r.container_db_id] ?? 0
      const pct = Number(r.percentage) / 100
      const partnerRevShare = actualSales * pct
      const partnerCost = Number(r.partner_quoted_cost_ngn)
      const presale = presaleMap[r.container_db_id]
      const trip = tripMap[r.trip_id]
      const displayVal = r.display_value_override ? Number(r.display_value_override) : partnerCost

      let salesStatus = 'not_started'
      if (actualSales > 0 && status === 'completed') salesStatus = 'completed'
      else if (actualSales > 0) salesStatus = 'in_progress'

      return {
        container_db_id: r.container_db_id,
        container_id: r.container_ref,
        tracking_number: r.tracking_number,
        trip_id: trip?.trip_id ?? '—',
        trip_title: trip?.title ?? '—',
        container_status: status,
        percentage: Number(r.percentage),
        full_quoted_landing_cost_ngn: Number(r.full_quoted_landing_cost_ngn),
        partner_quoted_cost_ngn: partnerCost,
        amount_received_ngn: Number(r.amount_received_ngn),
        topup_needed_ngn: Number(r.topup_needed_ngn),
        display_value: displayVal,
        expected_sale_revenue: Number(presale?.expected_sale_revenue ?? 0),
        partner_expected_return: Number(presale?.expected_sale_revenue ?? 0) * pct,
        actual_sales: actualSales,
        partner_revenue_share: partnerRevShare,
        partner_profit: partnerRevShare - partnerCost,
        sales_status: salesStatus,
      }
    })

    setContainers(rows)
    setLoading(false)
  }, [partnerDbId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  const totalInvestment = containers.reduce((s, c) => s + c.partner_quoted_cost_ngn, 0)
  const totalReceived = containers.reduce((s, c) => s + c.amount_received_ngn, 0)
  const totalTopup = containers.reduce((s, c) => s + Math.max(c.topup_needed_ngn, 0), 0)
  const totalExpectedReturn = containers.reduce((s, c) => s + c.partner_expected_return, 0)
  const totalActualReturn = containers.reduce((s, c) => s + c.partner_revenue_share, 0)
  const totalProfit = containers.reduce((s, c) => s + c.partner_profit, 0)

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/partnership"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
            <span className="text-brand-700 text-lg font-bold">{(partnerName || 'P')[0].toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{partnerName}</h1>
            <p className="text-xs text-gray-400 font-mono">{partnerId} · {containers.length} container{containers.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total investment', value: fmt(totalInvestment), color: 'text-gray-900' },
          { label: 'Amount received', value: fmt(totalReceived), color: 'text-green-700' },
          { label: 'Top-up needed', value: totalTopup > 0 ? fmt(totalTopup) : '—', color: totalTopup > 0 ? 'text-amber-700' : 'text-green-700' },
          { label: 'Expected return', value: totalExpectedReturn > 0 ? fmt(totalExpectedReturn) : '—', color: 'text-blue-700' },
          { label: 'Actual return', value: totalActualReturn > 0 ? fmt(totalActualReturn) : '—', color: 'text-green-700' },
          { label: 'Total profit', value: totalActualReturn > 0 ? fmt(totalProfit) : '—', color: totalProfit >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <p className="text-xs text-gray-400 mb-1 leading-tight">{m.label}</p>
            <p className={`text-sm font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Container breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Container investments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Container','Trip','Stake','Investment','Received','Top-up','Display value','Exp. return','Actual return','Profit','Sales status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {containers.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-400">No containers found.</td></tr>
              ) : containers.map(c => {
                const profitPositive = c.partner_profit >= 0
                const hasTopup = c.topup_needed_ngn > 0
                return (
                  <tr key={c.container_db_id}
                    onClick={() => router.push(`/portal/partnership/${c.container_db_id}`)}
                    className="border-b border-gray-50 hover:bg-brand-50/20 transition-colors cursor-pointer group">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="font-mono text-xs font-semibold text-brand-700 group-hover:text-brand-800">{c.container_id}</p>
                      <p className="text-xs text-gray-400 font-mono">{c.tracking_number ?? '—'}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-700">{c.trip_id}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[80px]">{c.trip_title}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-sm font-bold text-brand-700">{c.percentage.toFixed(0)}%</span>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap text-xs">{fmt(c.partner_quoted_cost_ngn)}</td>
                    <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap text-xs">{fmt(c.amount_received_ngn)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {hasTopup
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} />{fmt(c.topup_needed_ngn)}</span>
                        : <span className="text-xs text-green-600 font-medium">✓</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-blue-700 font-medium whitespace-nowrap">{fmt(c.display_value)}</td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {c.partner_expected_return > 0 ? fmt(c.partner_expected_return) : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {c.partner_revenue_share > 0
                        ? <span className="text-xs font-semibold text-green-600">{fmt(c.partner_revenue_share)}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {c.partner_revenue_share > 0 ? (
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
                        {c.sales_status === 'completed' ? 'Completed'
                          : c.sales_status === 'in_progress' ? 'In progress'
                          : 'Not started'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

