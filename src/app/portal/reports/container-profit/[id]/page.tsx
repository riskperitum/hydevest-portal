'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown,
  Package, Target, Zap, BarChart2, Minus
} from 'lucide-react'
import Link from 'next/link'

interface ProfitDetail {
  container_id: string
  tracking_number: string | null
  trip_id: string
  trip_title: string
  sale_type: string
  presale_id: string
  estimated_landing_cost: number
  warehouse_confirmed_pieces: number
  price_per_piece: number | null
  expected_sale_revenue: number
  total_sales_to_date: number
  total_recovery_to_date: number
  pieces_sold: number
  pieces_remaining: number
  expected_profit: number
  expected_profit_margin: number
  actual_profit: number
  actual_profit_margin: number
  unearned_profit: number
  sales_status: string
  profit_status: string
}

interface OrderRow {
  order_id: string
  customer_name: string
  sale_type: string
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  pallets_sold: number
  pieces_sold: number
  payment_status: string
  created_at: string
  profit_contribution: number
  profit_margin: number
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

export default function ContainerProfitDrilldownPage() {
  const params = useParams()
  const containerId = params.id as string

  const [detail, setDetail] = useState<ProfitDetail | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: container }, { data: presale }] = await Promise.all([
      supabase.from('containers').select('id, container_id, tracking_number, trip_id, pieces_purchased, estimated_landing_cost, unit_price_usd, shipping_amount_usd').eq('id', containerId).single(),
      supabase.from('presales').select('id, presale_id, sale_type, expected_sale_revenue, price_per_piece, warehouse_confirmed_pieces').eq('container_id', containerId).single(),
    ])

    if (!container || !presale) { setLoading(false); return }

    const [{ data: trip }, { data: salesOrders }, { data: palletDists }] = await Promise.all([
      supabase.from('trips').select('trip_id, title').eq('id', container.trip_id).single(),
      supabase.from('sales_orders').select(`id, order_id, sale_type, customer_payable, amount_paid, outstanding_balance, payment_status, created_at, customer:customers(name)`).eq('container_id', containerId).order('created_at', { ascending: true }),
      supabase.from('presale_pallet_distributions').select('pallet_pieces, number_of_pallets, pallets_sold').eq('presale_id', presale.id),
    ])

    const orderIds = (salesOrders ?? []).map(o => o.id)
    const { data: palletLines } = orderIds.length > 0
      ? await supabase.from('sales_order_pallets').select('order_id, pallets_sold, total_pieces, line_total').in('order_id', orderIds)
      : { data: [] }

    const palletsByOrder = (palletLines ?? []).reduce((acc, pl) => {
      if (!acc[pl.order_id]) acc[pl.order_id] = []
      acc[pl.order_id].push(pl)
      return acc
    }, {} as Record<string, NonNullable<typeof palletLines>[number][]>)

    const landingCost = Number(container.estimated_landing_cost ?? 0)
    const expectedRevenue = Number(presale.expected_sale_revenue ?? 0)
    const pricePerPiece = presale.price_per_piece ? Number(presale.price_per_piece) : null
    const whPieces = presale.warehouse_confirmed_pieces ?? 0
    const salesToDate = (salesOrders ?? []).reduce((s, o) => s + Number(o.customer_payable), 0)

    // Pieces sold/remaining
    let piecesSold = 0
    let piecesRemaining = whPieces
    if (presale.sale_type === 'box_sale') {
      piecesSold = (salesOrders ?? []).length > 0 ? whPieces : 0
      piecesRemaining = (salesOrders ?? []).length > 0 ? 0 : whPieces
    } else {
      piecesSold = (palletDists ?? []).reduce((s, pd) => s + pd.pallet_pieces * pd.pallets_sold, 0)
      piecesRemaining = (palletDists ?? []).reduce((s, pd) => s + pd.pallet_pieces * (pd.number_of_pallets - pd.pallets_sold), 0)
    }

    const expectedProfit = expectedRevenue - landingCost
    const expectedProfitMargin = landingCost > 0 ? (expectedProfit / landingCost) * 100 : 0
    const actualProfit = salesToDate - landingCost
    const actualProfitMargin = landingCost > 0 ? (actualProfit / landingCost) * 100 : 0
    const unearnedRevenue = piecesRemaining * (pricePerPiece ?? 0)
    const proportionalCost = whPieces > 0 ? (piecesRemaining / whPieces) * landingCost : 0
    const unearnedProfit = unearnedRevenue - proportionalCost

    let salesStatus = 'not_started'
    if (presale.sale_type === 'box_sale') {
      salesStatus = (salesOrders ?? []).length > 0 ? 'completed' : 'not_started'
    } else {
      if ((salesOrders ?? []).length === 0) salesStatus = 'not_started'
      else if (piecesRemaining > 0) salesStatus = 'in_progress'
      else salesStatus = 'completed'
    }

    let profitStatus = 'pending'
    const marginToCheck = salesStatus === 'completed' ? actualProfitMargin : expectedProfitMargin
    if (salesStatus !== 'not_started') {
      if (marginToCheck > 2) profitStatus = 'profitable'
      else if (marginToCheck < -2) profitStatus = 'loss'
      else profitStatus = 'break_even'
    }

    setDetail({
      container_id: container.container_id,
      tracking_number: container.tracking_number,
      trip_id: trip?.trip_id ?? '—',
      trip_title: trip?.title ?? '—',
      sale_type: presale.sale_type,
      presale_id: presale.presale_id,
      estimated_landing_cost: landingCost,
      warehouse_confirmed_pieces: whPieces,
      price_per_piece: pricePerPiece,
      expected_sale_revenue: expectedRevenue,
      total_sales_to_date: salesToDate,
      total_recovery_to_date: 0,
      pieces_sold: piecesSold,
      pieces_remaining: piecesRemaining,
      expected_profit: expectedProfit,
      expected_profit_margin: expectedProfitMargin,
      actual_profit: actualProfit,
      actual_profit_margin: actualProfitMargin,
      unearned_profit: unearnedProfit,
      sales_status: salesStatus,
      profit_status: profitStatus,
    })

    // Build order profit rows
    setOrders((salesOrders ?? []).map(o => {
      const lines = palletsByOrder[o.id] ?? []
      const palletsSold = lines.reduce((s, l) => s + l.pallets_sold, 0)
      const piecesSoldInOrder = lines.reduce((s, l) => s + l.total_pieces, 0)
      const proportionalCostForOrder = whPieces > 0 ? (piecesSoldInOrder / whPieces) * landingCost : 0
      const profitContribution = Number(o.customer_payable) - (presale.sale_type === 'box_sale' ? landingCost : proportionalCostForOrder)
      const profitMargin = proportionalCostForOrder > 0 ? (profitContribution / proportionalCostForOrder) * 100 : 0

      return {
        order_id: o.order_id,
        customer_name: (o.customer as any)?.name ?? '—',
        sale_type: o.sale_type,
        customer_payable: Number(o.customer_payable),
        amount_paid: Number(o.amount_paid),
        outstanding_balance: Number(o.outstanding_balance),
        pallets_sold: palletsSold,
        pieces_sold: presale.sale_type === 'box_sale' ? whPieces : piecesSoldInOrder,
        payment_status: o.payment_status,
        created_at: o.created_at,
        profit_contribution: profitContribution,
        profit_margin: presale.sale_type === 'box_sale'
          ? (Number(o.customer_payable) - landingCost) / landingCost * 100
          : profitMargin,
      }
    }))

    setLoading(false)
  }, [containerId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-600" size={28} /></div>
  if (!detail) return <div className="text-center py-16 text-gray-400">Container not found.</div>

  const isCompleted = detail.sales_status === 'completed'
  const isPositive = (isCompleted ? detail.actual_profit : detail.expected_profit) >= 0
  const costCoverage = detail.expected_sale_revenue > 0
    ? (detail.estimated_landing_cost / detail.expected_sale_revenue) * 100
    : 0
  const salesProgress = detail.expected_sale_revenue > 0
    ? Math.min((detail.total_sales_to_date / detail.expected_sale_revenue) * 100, 100)
    : 0

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/reports/container-profit"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{detail.container_id}</span>
            <span className="font-mono text-xs text-gray-500">{detail.tracking_number ?? '—'}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${detail.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
              {detail.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}
            </span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mt-0.5">{detail.trip_title}</h1>
          <p className="text-xs text-gray-400">{detail.trip_id} · Presale: {detail.presale_id}</p>
        </div>
      </div>

      {/* Hero profit card */}
      <div className={`rounded-2xl border p-6 ${isPositive ? 'bg-gradient-to-br from-green-50 to-emerald-50/50 border-green-200' : 'bg-gradient-to-br from-red-50 to-rose-50/50 border-red-200'}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{isCompleted ? 'Actual profit' : 'Expected profit'}</p>
            <div className="flex items-end gap-2">
              {isPositive ? <TrendingUp size={24} className="text-green-600 mb-1" /> : <TrendingDown size={24} className="text-red-500 mb-1" />}
              <p className={`text-3xl font-bold ${isPositive ? 'text-green-700' : 'text-red-600'}`}>
                {isPositive ? '+' : ''}{fmt(isCompleted ? detail.actual_profit : detail.expected_profit)}
              </p>
            </div>
            <p className={`text-lg font-semibold mt-1 ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
              {fmtPct(isCompleted ? detail.actual_profit_margin : detail.expected_profit_margin)} margin
            </p>
          </div>
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            {[
              { label: 'Landing cost', value: fmt(detail.estimated_landing_cost), color: 'text-gray-900' },
              { label: 'Expected revenue', value: fmt(detail.expected_sale_revenue), color: 'text-brand-700' },
              { label: isCompleted ? 'Actual sales' : 'Sales to date', value: detail.total_sales_to_date > 0 ? fmt(detail.total_sales_to_date) : '—', color: 'text-blue-700' },
              { label: 'Unearned profit', value: detail.unearned_profit > 0 ? fmt(detail.unearned_profit) : '—', color: 'text-amber-700' },
            ].map(m => (
              <div key={m.label} className="bg-white/60 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">{m.label}</p>
                <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Profit breakdown bars */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Profit breakdown</h2>

        {/* Cost vs Revenue bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Cost coverage — landing cost as % of expected revenue</span>
            <span className="font-semibold text-gray-700">{costCoverage.toFixed(1)}%</span>
          </div>
          <div className="h-6 bg-gray-100 rounded-lg overflow-hidden flex">
            <div className="h-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium transition-all"
              style={{ width: `${costCoverage}%` }}>
              {costCoverage > 15 && 'Cost'}
            </div>
            <div className={`h-full flex items-center justify-center text-xs font-medium transition-all ${isPositive ? 'bg-green-400 text-white' : 'bg-red-100 text-red-600'}`}
              style={{ width: `${100 - costCoverage}%` }}>
              {(100 - costCoverage) > 15 && (isPositive ? `+${(100 - costCoverage).toFixed(0)}% profit` : 'Gap')}
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Landing cost: {fmt(detail.estimated_landing_cost)}</span>
            <span>Expected revenue: {fmt(detail.expected_sale_revenue)}</span>
          </div>
        </div>

        {/* Sales progress bar */}
        {detail.total_sales_to_date > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Sales progress — actual sales vs expected revenue</span>
              <span className="font-semibold text-gray-700">{salesProgress.toFixed(1)}%</span>
            </div>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${salesProgress >= 100 ? 'bg-green-500' : salesProgress >= 60 ? 'bg-brand-500' : 'bg-amber-400'}`}
                style={{ width: `${salesProgress}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Sales: {fmt(detail.total_sales_to_date)}</span>
              <span>Target: {fmt(detail.expected_sale_revenue)}</span>
            </div>
          </div>
        )}

        {/* Per-piece analysis */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
          {[
            { label: 'W/H pieces', value: detail.warehouse_confirmed_pieces.toLocaleString() },
            { label: 'Pieces sold', value: detail.pieces_sold.toLocaleString() },
            { label: 'Pieces remaining', value: detail.pieces_remaining.toLocaleString() },
            { label: 'Presale price/pc', value: detail.price_per_piece ? fmt(detail.price_per_piece) : '—' },
          ].map(m => (
            <div key={m.label}>
              <p className="text-xs text-gray-400 mb-0.5">{m.label}</p>
              <p className="text-sm font-semibold text-gray-900">{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Order-level profit breakdown */}
      {orders.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-sm font-semibold text-gray-700">Order-level profit breakdown</h2>
            <p className="text-xs text-gray-400 mt-0.5">Profit contribution per sales order</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Order ID','Customer','Pieces sold','Sale revenue','Profit contribution','Profit margin','Payment','Date'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const isProfit = order.profit_contribution >= 0
                  return (
                    <tr key={order.order_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{order.order_id}</span>
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{order.customer_name}</td>
                      <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{order.pieces_sold.toLocaleString()}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(order.customer_payable)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-bold ${isProfit ? 'text-green-600' : 'text-red-500'}`}>
                          {isProfit ? '+' : ''}{fmt(order.profit_contribution)}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isProfit ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {fmtPct(order.profit_margin)}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${order.payment_status === 'paid' ? 'bg-green-50 text-green-700'
                            : order.payment_status === 'partial' ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-600'}`}>
                          {order.payment_status === 'paid' ? 'Paid' : order.payment_status === 'partial' ? 'Partial' : 'Outstanding'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-brand-100">
                  <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Totals</td>
                  <td className="px-3 py-2.5 text-xs font-bold text-brand-700 whitespace-nowrap">{fmt(orders.reduce((s,o)=>s+o.customer_payable,0))}</td>
                  <td className="px-3 py-2.5 text-xs font-bold whitespace-nowrap">
                    <span className={`${orders.reduce((s,o)=>s+o.profit_contribution,0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {orders.reduce((s,o)=>s+o.profit_contribution,0) >= 0 ? '+' : ''}{fmt(orders.reduce((s,o)=>s+o.profit_contribution,0))}
                    </span>
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
