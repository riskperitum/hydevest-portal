'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, ChevronRight, CheckCircle2 } from 'lucide-react'

interface BadDebt {
  id: string
  bad_debt_id: string
  amount_ngn: number
  note: string | null
  status: string
  created_at: string
  approved_at: string | null
  customer_name: string
  customer_id: string
  order_id: string
  sales_order_id: string
  container_id_ref: string
  requested_by_name: string
  approved_by_name: string | null
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Pending approval', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approved',         color: 'bg-red-50 text-red-600'     },
  rejected: { label: 'Rejected',         color: 'bg-gray-100 text-gray-500'  },
}

export default function BadDebtsPage() {
  const router = useRouter()
  const [debts, setDebts]         = useState<BadDebt[]>([])
  const [loading, setLoading]     = useState(true)
  const [statusFilter, setStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data } = await supabase
      .from('bad_debts')
      .select(`
        id, bad_debt_id, amount_ngn, note, status, created_at, approved_at,
        customer:customers!bad_debts_customer_id_fkey(name, customer_id),
        sales_order:sales_orders!bad_debts_sales_order_id_fkey(order_id, id,
          container:containers!sales_orders_container_id_fkey(container_id)
        ),
        requested_by_profile:profiles!bad_debts_requested_by_fkey(full_name, email),
        approved_by_profile:profiles!bad_debts_approved_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    setDebts((data ?? []).map(d => ({
      id:                d.id,
      bad_debt_id:       d.bad_debt_id,
      amount_ngn:        Number(d.amount_ngn),
      note:              d.note,
      status:            d.status,
      created_at:        d.created_at,
      approved_at:       d.approved_at,
      customer_name:     (d.customer as any)?.name ?? '—',
      customer_id:       (d.customer as any)?.customer_id ?? '—',
      order_id:          (d.sales_order as any)?.order_id ?? '—',
      sales_order_id:    (d.sales_order as any)?.id ?? '',
      container_id_ref:  (d.sales_order as any)?.container?.container_id ?? '—',
      requested_by_name: (d.requested_by_profile as any)?.full_name ?? (d.requested_by_profile as any)?.email ?? '—',
      approved_by_name:  (d.approved_by_profile as any)?.full_name ?? (d.approved_by_profile as any)?.email ?? null,
    })))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = debts.filter(d => statusFilter === '' || d.status === statusFilter)

  const totalApproved = debts.filter(d => d.status === 'approved').reduce((s, d) => s + d.amount_ngn, 0)
  const totalPending  = debts.filter(d => d.status === 'pending').reduce((s, d) => s + d.amount_ngn, 0)

  return (
    <div className="space-y-5 max-w-6xl">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Bad debts</h1>
          <p className="text-sm text-gray-400 mt-0.5">Outstanding balances written off as uncollectable</p>
        </div>
        <button onClick={load}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-xl border border-white shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Total written off</p>
          <p className="text-xl font-bold text-red-700">{fmt(totalApproved)}</p>
          <p className="text-xs text-gray-400 mt-1">{debts.filter(d => d.status === 'approved').length} approved write-offs</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-white shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Pending approval</p>
          <p className="text-xl font-bold text-amber-700">{fmt(totalPending)}</p>
          <p className="text-xs text-gray-400 mt-1">{debts.filter(d => d.status === 'pending').length} awaiting approval</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-white shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Total cases</p>
          <p className="text-xl font-bold text-gray-700">{debts.length}</p>
          <p className="text-xs text-gray-400 mt-1">All time</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {[
          { key: '',         label: 'All' },
          { key: 'pending',  label: 'Pending' },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
        ].map(f => (
          <button key={f.key} onClick={() => setStatus(f.key)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors
              ${statusFilter === f.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 border-b animate-pulse flex gap-4">
              <div className="h-4 bg-gray-100 rounded w-24" />
              <div className="h-4 bg-gray-100 rounded flex-1" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <CheckCircle2 size={24} className="text-green-300" />
            <p className="text-sm text-gray-400">No bad debts recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Ref','Customer','Container','Sales order','Amount','Note','Requested by','Status','Approved by','Date',''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(d => {
                  const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.pending
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded">
                          {d.bad_debt_id}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-900">{d.customer_name}</p>
                        <p className="text-xs text-gray-400">{d.customer_id}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">
                          {d.container_id_ref}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <button
                          onClick={() => router.push(`/portal/sales/orders/${d.sales_order_id}`)}
                          className="font-mono text-xs text-brand-600 hover:underline">
                          {d.order_id}
                        </button>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-sm font-bold text-red-600">{fmt(d.amount_ngn)}</span>
                      </td>
                      <td className="px-3 py-3 max-w-[160px]">
                        <p className="text-xs text-gray-500 truncate">{d.note ?? '—'}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                        {d.requested_by_name}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                        {d.approved_by_name ?? '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-400">
                        {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-3">
                        <ChevronRight size={14} className="text-gray-300" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-gray-600">
                    Total approved write-offs
                  </td>
                  <td className="px-3 py-2.5 text-sm font-bold text-red-700">
                    {fmt(totalApproved)}
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
