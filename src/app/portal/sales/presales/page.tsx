'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Search, Eye, Trash2,
  Package
} from 'lucide-react'

interface Presale {
  id: string
  presale_id: string
  sale_type: string
  status: string
  created_at: string
  warehouse_confirmed_pieces: number | null
  warehouse_confirmed_avg_weight: number | null
  price_per_kilo: number | null
  price_per_piece: number | null
  expected_sale_revenue: number | null
  total_number_of_pallets: number | null
  container: {
    container_id: string
    tracking_number: string | null
    container_number: string | null
  } | null
  created_by_profile: { full_name: string | null; email: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
}

export default function PresalesPage() {
  const router = useRouter()
  const [presales, setPresales] = useState<Presale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: ps } = await supabase
      .from('presales')
      .select('*, container:containers(container_id, tracking_number, container_number), created_by_profile:profiles!presales_created_by_fkey(full_name, email)')
      .order('created_at', { ascending: false })
    setPresales(ps ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm('Delete this presale? This cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('presales').delete().eq('id', id)
    load()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const filteredPresales = presales.filter(p =>
    search === '' ||
    p.presale_id.toLowerCase().includes(search.toLowerCase()) ||
    (p.container?.tracking_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.container?.container_id ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalRevenue = filteredPresales.reduce((s, p) => s + Number(p.expected_sale_revenue ?? 0), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pre-sales</h1>
          <p className="text-sm text-gray-400 mt-0.5">{presales.length} presale{presales.length !== 1 ? 's' : ''} created</p>
        </div>
        <Link href="/portal/sales/presales/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Create presale</span>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total presales', value: presales.length.toString(), color: 'text-brand-600' },
          { label: 'Box sales', value: presales.filter(p => p.sale_type === 'box_sale').length.toString(), color: 'text-blue-600' },
          { label: 'Split sales', value: presales.filter(p => p.sale_type === 'split_sale').length.toString(), color: 'text-purple-600' },
          { label: 'Expected revenue', value: totalRevenue > 0 ? fmt(totalRevenue) : '—', color: 'text-green-600' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-xl font-semibold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by presale ID or tracking number..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Presale ID', 'Sale type', 'Container', 'Tracking No.', 'W/H Pieces', 'W/H Avg Weight', 'Price/Kilo', 'Price/Piece', 'Expected Revenue', 'Status', 'Created by', 'Date', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 13 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredPresales.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Package size={20} className="text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400">No presales yet. Create your first presale.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredPresales.map(ps => (
                <tr key={ps.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{ps.presale_id}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ps.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {ps.sale_type === 'box_sale' ? 'Box sale' : 'Split sale'}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{ps.container?.container_id ?? '—'}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">{ps.container?.tracking_number ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ps.warehouse_confirmed_pieces?.toLocaleString() ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ps.warehouse_confirmed_avg_weight ? `${ps.warehouse_confirmed_avg_weight} kg` : '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ps.price_per_kilo ? fmt(ps.price_per_kilo) : '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ps.price_per_piece ? fmt(ps.price_per_piece) : '—'}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{ps.expected_sale_revenue ? fmt(ps.expected_sale_revenue) : '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[ps.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ps.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap text-xs">{ps.created_by_profile?.full_name ?? ps.created_by_profile?.email ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-400 whitespace-nowrap text-xs">{new Date(ps.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => router.push(`/portal/sales/presales/${ps.id}`)}
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(ps.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

