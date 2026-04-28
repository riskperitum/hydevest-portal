'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, TrendingUp, Clock, CheckCircle2,
  AlertTriangle, Scale, FileText, Loader2,
  Phone, MapPin, User, ChevronRight
} from 'lucide-react'

interface CustomerProfile {
  id: string
  customer_id: string
  name: string
  phone: string | null
  address: string | null
  notes: string | null
  referrer: string | null
  guarantor: string | null
  is_active: boolean
  created_at: string
}

interface SalesOrder {
  id: string
  order_id: string
  sale_type: string
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  payment_status: string
  created_at: string
  container_id: string | null
  container: { container_id: string; tracking_number: string | null } | null
}

interface BadDebt {
  id: string
  bad_debt_id: string
  amount_ngn: number
  status: string
  note: string | null
  created_at: string
}

interface LegalCase {
  id: string
  case_id: string
  title: string
  status: string
  case_type: string
  opened_date: string
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  paid:        { label: 'Fully paid',  color: 'bg-green-50 text-green-700' },
  partial:     { label: 'Partial',     color: 'bg-amber-50 text-amber-700' },
  outstanding: { label: 'Outstanding', color: 'bg-red-50 text-red-600'    },
}

const CASE_STATUS: Record<string, { label: string; color: string }> = {
  open:          { label: 'Open',          color: 'bg-blue-50 text-blue-700'    },
  in_progress:   { label: 'In progress',   color: 'bg-amber-50 text-amber-700'  },
  pending_court: { label: 'Pending court', color: 'bg-purple-50 text-purple-700'},
  police_arrest: { label: 'Police arrest', color: 'bg-red-50 text-red-700'      },
  settled:       { label: 'Settled',       color: 'bg-green-50 text-green-700'  },
  closed:        { label: 'Closed',        color: 'bg-gray-100 text-gray-500'   },
  won:           { label: 'Won',           color: 'bg-green-50 text-green-700'  },
  lost:          { label: 'Lost',          color: 'bg-red-50 text-red-600'      },
}

export default function CustomerProfilePage() {
  const params     = useParams()
  const router     = useRouter()
  const customerId = params.customerId as string

  const [customer, setCustomer]   = useState<CustomerProfile | null>(null)
  const [orders, setOrders]       = useState<SalesOrder[]>([])
  const [badDebts, setBadDebts]   = useState<BadDebt[]>([])
  const [legalCases, setLegalCases] = useState<LegalCase[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState<'orders' | 'bad_debts' | 'legal' | 'outlier'>('orders')
  const [outlierSales, setOutlierSales] = useState<any[]>([])

  const load = useCallback(async () => {
    const supabase = createClient()

    const [
      { data: customerData },
      { data: ordersData },
      { data: badDebtData },
      { data: legalData },
      { data: outlierData },
    ] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('sales_orders').select(`
        id, order_id, sale_type, customer_payable, amount_paid,
        outstanding_balance, payment_status, created_at, container_id,
        container:containers!sales_orders_container_id_fkey(container_id, tracking_number)
      `).eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('bad_debts').select('id, bad_debt_id, amount_ngn, status, note, created_at')
        .eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('legal_case_customers').select(`
        case:legal_cases!legal_case_customers_case_id_fkey(
          id, case_id, title, status, case_type, opened_date
        )
      `).eq('customer_id', customerId),
      supabase.from('outlier_sales').select(`
        id, sale_id, type, quantity_sold, pricing_mode, price_per_piece,
        total_price, amount_paid, outstanding, payment_status, status, created_at
      `).eq('customer_id', customerId).order('created_at', { ascending: false }),
    ])

    setCustomer(customerData)
    setOrders((ordersData ?? []) as any)
    setBadDebts(badDebtData ?? [])
    setLegalCases((legalData ?? []).map(l => (l.case as any)))
    setOutlierSales(outlierData ?? [])
    setLoading(false)
  }, [customerId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-600" />
    </div>
  )

  if (!customer) return (
    <div className="text-center py-16 text-gray-400">Customer not found.</div>
  )

  // Computed metrics
  const totalRevenue     = orders.reduce((s, o) => s + Number(o.customer_payable), 0)
  const totalPaid        = orders.reduce((s, o) => s + Number(o.amount_paid), 0)
  const totalOutstanding = orders.reduce((s, o) => s + Number(o.outstanding_balance), 0)
  const totalBadDebt     = badDebts.filter(b => b.status === 'approved').reduce((s, b) => s + Number(b.amount_ngn), 0)
  const outlierApproved  = outlierSales.filter(s => s.status === 'approved')
  const outlierRevenue   = outlierApproved.reduce((s: number, sa: any) => s + Number(sa.total_price), 0)
  const outlierPaid      = outlierApproved.reduce((s: number, sa: any) => s + Number(sa.amount_paid ?? 0), 0)
  const outlierOutstanding = outlierApproved.reduce((s: number, sa: any) => s + Number(sa.outstanding ?? 0), 0)
  const grandRevenue     = totalRevenue + outlierRevenue
  const grandPaid        = totalPaid + outlierPaid
  const grandOutstanding = totalOutstanding + outlierOutstanding
  const recoveryPct      = grandRevenue > 0 ? (grandPaid / grandRevenue) * 100 : 0
  const activeCases      = legalCases.filter(c => !['closed', 'settled', 'won', 'lost'].includes(c?.status ?? '')).length

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 mt-1 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{customer.name}</h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded font-medium"
                style={{ background: '#f0ecfc', color: '#55249E' }}>
                {customer.customer_id}
              </span>
              {!customer.is_active && (
                <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              {customer.phone && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Phone size={11} /> {customer.phone}
                </span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin size={11} /> {customer.address}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total revenue',    value: fmt(grandRevenue),     color: 'text-gray-800',  bg: 'bg-gray-50'   },
          { label: 'Total paid',       value: fmt(grandPaid),        color: 'text-green-700', bg: 'bg-green-50'  },
          { label: 'Outstanding',      value: fmt(grandOutstanding), color: grandOutstanding > 0 ? 'text-amber-700' : 'text-green-700', bg: grandOutstanding > 0 ? 'bg-amber-50' : 'bg-green-50' },
          { label: 'Bad debts',        value: fmt(totalBadDebt),     color: totalBadDebt > 0 ? 'text-red-700' : 'text-gray-500', bg: totalBadDebt > 0 ? 'bg-red-50' : 'bg-gray-50' },
          { label: 'Active cases',     value: activeCases.toString(), color: activeCases > 0 ? 'text-purple-700' : 'text-gray-500', bg: activeCases > 0 ? 'bg-purple-50' : 'bg-gray-50' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <p className="text-xs text-gray-500 mb-1">{m.label}</p>
            <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Recovery progress bar */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span className="font-medium text-gray-700">Recovery progress</span>
          <span className={`font-semibold ${recoveryPct >= 100 ? 'text-green-600' : recoveryPct >= 50 ? 'text-brand-600' : 'text-amber-600'}`}>
            {recoveryPct.toFixed(1)}% collected
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${recoveryPct >= 100 ? 'bg-green-500' : recoveryPct >= 50 ? 'bg-brand-500' : 'bg-amber-400'}`}
            style={{ width: `${Math.min(recoveryPct, 100)}%` }} />
        </div>
        <div className="flex justify-between mt-1.5 text-xs text-gray-400">
          <span>Paid: {fmt(grandPaid)}</span>
          <span>Outstanding: {fmt(grandOutstanding)}</span>
        </div>
      </div>

      {/* Customer details */}
      {(customer.referrer || customer.guarantor || customer.notes) && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 grid grid-cols-3 gap-4">
          {customer.referrer && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Referrer</p>
              <p className="text-sm font-medium text-gray-800">{customer.referrer}</p>
            </div>
          )}
          {customer.guarantor && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Guarantor</p>
              <p className="text-sm font-medium text-gray-800">{customer.guarantor}</p>
            </div>
          )}
          {customer.notes && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-600">{customer.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {[
            { key: 'orders',    label: 'Sales orders',  count: orders.length       },
            { key: 'outlier',   label: 'Outlier sales', count: outlierSales.length },
            { key: 'bad_debts', label: 'Bad debts',     count: badDebts.length     },
            { key: 'legal',     label: 'Legal cases',   count: legalCases.length   },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              {tab.count > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="overflow-x-auto">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <FileText size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No sales orders yet</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['Order ID','Container','Sale type','Payable','Paid','Outstanding','Status','Date',''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map(o => {
                    const paymentCfg = PAYMENT_STATUS[o.payment_status] ?? PAYMENT_STATUS.outstanding
                    return (
                      <tr key={o.id}
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/portal/sales/orders/${o.id}`)}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{o.order_id}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                          {(o.container as any)?.tracking_number ?? (o.container as any)?.container_id ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 capitalize">
                          {o.sale_type?.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-gray-800">{fmt(o.customer_payable)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-green-700">{fmt(o.amount_paid)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-bold ${Number(o.outstanding_balance) > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                            {fmt(o.outstanding_balance)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${paymentCfg.color}`}>
                            {paymentCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">
                          {new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight size={14} className="text-gray-300" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-bold text-gray-700">Totals</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-800">{fmt(totalRevenue)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-green-700">{fmt(totalPaid)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-amber-700">{fmt(totalOutstanding)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* BAD DEBTS TAB */}
        {activeTab === 'bad_debts' && (
          <div className="p-5">
            {badDebts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 size={24} className="text-green-300" />
                <p className="text-sm text-gray-400">No bad debts recorded</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Ref','Amount','Status','Note','Date'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {badDebts.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded">{b.bad_debt_id}</span>
                      </td>
                      <td className="px-3 py-3 text-sm font-bold text-red-600">{fmt(Number(b.amount_ngn))}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${b.status === 'approved' ? 'bg-red-50 text-red-600' :
                            b.status === 'pending'  ? 'bg-amber-50 text-amber-700' :
                            'bg-gray-100 text-gray-500'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[200px] truncate">{b.note ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* LEGAL CASES TAB */}
        {activeTab === 'legal' && (
          <div className="p-5">
            {legalCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Scale size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No legal cases</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Case ID','Title','Type','Status','Opened',''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {legalCases.filter(Boolean).map(c => {
                    const caseCfg = CASE_STATUS[c.status] ?? CASE_STATUS.open
                    return (
                      <tr key={c.id}
                        className="hover:bg-gray-50/50 cursor-pointer"
                        onClick={() => router.push(`/portal/legal/cases/${c.id}`)}>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs px-2 py-0.5 rounded font-medium"
                            style={{ background: '#f0ecfc', color: '#55249E' }}>
                            {c.case_id}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium text-gray-800 max-w-[200px] truncate">{c.title}</td>
                        <td className="px-3 py-3 text-xs text-gray-500 capitalize">{c.case_type?.replace('_', ' ')}</td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${caseCfg.color}`}>
                            {caseCfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(c.opened_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-3">
                          <ChevronRight size={14} className="text-gray-300" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* OUTLIER SALES TAB */}
        {activeTab === 'outlier' && (
          <div className="p-5">
            {outlierSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-sm text-gray-400">No outlier sales</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Sale ID','Type','Qty','Total','Paid','Outstanding','Status','Date',''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {outlierSales.map((s: any) => {
                    const out = Number(s.outstanding ?? 0)
                    const typeColors: Record<string, string> = {
                      ISINLE:    'bg-blue-50 text-blue-700 border-blue-200',
                      BAYA:      'bg-purple-50 text-purple-700 border-purple-200',
                      BLEACHING: 'bg-amber-50 text-amber-700 border-amber-200',
                    }
                    return (
                      <tr key={s.id} className="hover:bg-gray-50/50 cursor-pointer"
                        onClick={() => router.push(`/portal/inventory/outlier/sale/${s.id}`)}>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{s.sale_id}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${typeColors[s.type] ?? ''}`}>{s.type}</span>
                        </td>
                        <td className="px-3 py-3 font-bold text-gray-900">{Number(s.quantity_sold).toLocaleString()}</td>
                        <td className="px-3 py-3 font-bold text-gray-900">{fmt(Number(s.total_price))}</td>
                        <td className="px-3 py-3 font-medium text-green-700">{fmt(Number(s.amount_paid ?? 0))}</td>
                        <td className={`px-3 py-3 font-bold ${out > 0 ? 'text-red-600' : 'text-gray-400'}`}>{out > 0 ? fmt(out) : '—'}</td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">{s.status?.replace('_', ' ')}</span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-3 py-3">
                          <ChevronRight size={14} className="text-gray-300" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
