'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Package, Search, RefreshCw, AlertTriangle,
  ChevronRight, Filter
} from 'lucide-react'
import {
  computeContainerStatus, getContainerStatusBadge,
  type ContainerStatusInput, type ContainerComputedStatus
} from '@/lib/utils/containerStatus'
import { usePermissions, can } from '@/lib/permissions/hooks'

interface ContainerRow {
  id: string
  container_id: string
  trip_id: string
  trip_ref: string
  trip_title: string
  trip_status: string
  tracking_number: string | null
  hide_type: string | null
  pieces_purchased: number
  is_modified: boolean
  estimated_landing_cost: number
  presale_count: number
  sale_type: string | null
  presale_pallets: number
  pallet_dist_count: number
  sales_order_count: number
  fully_paid_count: number
  settled_count: number
  total_outstanding: number
  total_written_off: number
  computed_status: ContainerComputedStatus
}

const STAGE_FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'Trip',     label: 'Trip' },
  { key: 'Presale',  label: 'Presale' },
  { key: 'Sale',     label: 'Sale' },
  { key: 'Recovery', label: 'Recovery' },
]

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function ContainersPage() {
  const router = useRouter()
  const { permissions, isSuperAdmin } = usePermissions()
  const canViewCosts = can(permissions, isSuperAdmin, 'view_costs')

  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data } = await supabase
      .from('container_status_view')
      .select('*')
      .order('container_id')

    // Get container details
    const ids = (data ?? []).map(r => r.id)
    const { data: details } = ids.length > 0
      ? await supabase
          .from('containers')
          .select(`
            id, container_id, trip_id, tracking_number, hide_type,
            pieces_purchased, estimated_landing_cost, is_modified,
            trip:trips!containers_trip_id_fkey(trip_id, title, status)
          `)
          .in('id', ids)
      : { data: [] }

    const detailMap = Object.fromEntries((details ?? []).map(d => [d.id, d]))

    setContainers((data ?? []).map(r => {
      const detail = detailMap[r.id] ?? {}
      const statusInput: ContainerStatusInput = {
        trip_status:        r.trip_status ?? 'not_started',
        presale_count:      Number(r.presale_count ?? 0),
        sale_type:          r.sale_type ?? null,
        presale_pallets:    Number(r.presale_pallets ?? 0),
        pallet_dist_count:  Number(r.pallet_dist_count ?? 0),
        sales_order_count:  Number(r.sales_order_count ?? 0),
        fully_paid_count:   Number(r.fully_paid_count ?? 0),
        settled_count:      Number(r.settled_count ?? 0),
        total_outstanding:  Number(r.total_outstanding ?? 0),
        total_written_off:  Number(r.total_written_off ?? 0),
      }
      return {
        id:                     r.id,
        container_id:           r.container_id,
        trip_id:                r.trip_id,
        trip_ref:               (detail.trip as any)?.trip_id ?? '—',
        trip_title:             (detail.trip as any)?.title ?? '—',
        trip_status:            r.trip_status ?? 'not_started',
        tracking_number:        detail.tracking_number ?? null,
        hide_type:              detail.hide_type ?? null,
        pieces_purchased:       Number(detail.pieces_purchased ?? 0),
        is_modified:            r.is_modified ?? false,
        estimated_landing_cost: Number(detail.estimated_landing_cost ?? 0),
        presale_count:          Number(r.presale_count ?? 0),
        sale_type:              r.sale_type ?? null,
        presale_pallets:        Number(r.presale_pallets ?? 0),
        pallet_dist_count:      Number(r.pallet_dist_count ?? 0),
        sales_order_count:      Number(r.sales_order_count ?? 0),
        fully_paid_count:       Number(r.fully_paid_count ?? 0),
        settled_count:          Number(r.settled_count ?? 0),
        total_outstanding:      Number(r.total_outstanding ?? 0),
        total_written_off:      Number(r.total_written_off ?? 0),
        computed_status:        computeContainerStatus(statusInput),
      }
    }))

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = containers.filter(c => {
    const badge = getContainerStatusBadge(c.computed_status)
    const matchSearch = search === '' ||
      c.container_id.toLowerCase().includes(search.toLowerCase()) ||
      c.trip_title.toLowerCase().includes(search.toLowerCase()) ||
      (c.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.hide_type ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStage  = stageFilter === 'all' || badge.stage === stageFilter
    const matchStatus = statusFilter === '' || c.computed_status === statusFilter
    return matchSearch && matchStage && matchStatus
  })

  // Summary counts
  const stageCounts = STAGE_FILTERS.slice(1).reduce((acc, s) => {
    acc[s.key] = containers.filter(c => getContainerStatusBadge(c.computed_status).stage === s.key).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Containers</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {containers.length} containers across all stages
          </p>
        </div>
        <button onClick={load}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Stage summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'All',      count: containers.length,        color: 'bg-gray-50',    text: 'text-gray-700'   },
          { label: 'Trip',     count: stageCounts.Trip ?? 0,    color: 'bg-blue-50',    text: 'text-blue-700'   },
          { label: 'Presale',  count: stageCounts.Presale ?? 0, color: 'bg-purple-50',  text: 'text-purple-700' },
          { label: 'Sale',     count: stageCounts.Sale ?? 0,    color: 'bg-amber-50',   text: 'text-amber-700'  },
          { label: 'Recovery', count: stageCounts.Recovery ?? 0,color: 'bg-green-50',   text: 'text-green-700'  },
        ].map(s => (
          <button key={s.label}
            onClick={() => setStageFilter(s.label === 'All' ? 'all' : s.label)}
            className={`${s.color} rounded-xl p-4 border border-white shadow-sm text-left hover:shadow-md transition-all
              ${(stageFilter === 'all' && s.label === 'All') || stageFilter === s.label ? 'ring-2 ring-brand-400' : ''}`}>
            <p className={`text-2xl font-bold ${s.text}`}>{s.count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search containers, trips, tracking..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="presale_unsold">Presale — Unsold</option>
          <option value="sale_in_progress">Sale — In progress</option>
          <option value="sale_fully_sold">Sale — Fully sold</option>
          <option value="recovery_partial">Recovery — Partial</option>
          <option value="recovery_full">Recovery — Fully paid</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 border-b border-gray-50 animate-pulse flex gap-4">
              <div className="h-4 bg-gray-100 rounded w-24" />
              <div className="h-4 bg-gray-100 rounded flex-1" />
              <div className="h-4 bg-gray-100 rounded w-32" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Package size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No containers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Container</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Trip</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Tracking</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Pieces</th>
                  {canViewCosts && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Landing cost</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Outstanding</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => {
                  const badge = getContainerStatusBadge(c.computed_status)
                  return (
                    <tr key={c.id}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/portal/purchase/trips/${c.trip_id}/containers/${c.id}`)}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">
                            {c.container_id}
                          </span>
                          {c.is_modified && (
                            <span title="Modified after approval"
                              className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                              <AlertTriangle size={10} />
                              Modified
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-800">{c.trip_ref}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[120px]">{c.trip_title}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {c.tracking_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap capitalize">
                        {c.hide_type ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                        {c.pieces_purchased.toLocaleString()}
                      </td>
                      {canViewCosts && (
                        <td className="px-4 py-3 text-right text-xs font-medium text-gray-700 whitespace-nowrap">
                          {fmt(c.estimated_landing_cost)}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${badge.stage === 'Trip'     ? 'bg-blue-50 text-blue-600'     :
                            badge.stage === 'Presale'  ? 'bg-purple-50 text-purple-600' :
                            badge.stage === 'Sale'     ? 'bg-amber-50 text-amber-600'   :
                            badge.stage === 'Recovery' ? 'bg-green-50 text-green-600'   :
                            'bg-gray-100 text-gray-500'}`}>
                          {badge.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {c.total_outstanding > 0 ? (
                          <span className="text-xs font-semibold text-red-600">
                            {fmt(c.total_outstanding)}
                          </span>
                        ) : c.total_written_off > 0 ? (
                          <span className="text-xs font-medium text-gray-400">
                            {fmt(c.total_written_off)} w/off
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight size={14} className="text-gray-300" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
