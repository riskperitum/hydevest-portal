'use client'

import { useState } from 'react'
import { Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
}

interface AccountTableProps<T extends Record<string, unknown>> {
  title: string
  description: string
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  onAdd: () => void
  addLabel: string
  searchPlaceholder?: string
  emptyMessage?: string
  rowActions?: (row: T) => { label: string; onClick: () => void; danger?: boolean }[]
}

export default function AccountTable<T extends Record<string, unknown>>({
  columns, data, loading, onAdd, addLabel,
  searchPlaceholder = 'Search...', emptyMessage = 'No records found.', rowActions,
}: AccountTableProps<T>) {
  const [search, setSearch] = useState('')
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 10

  const filtered = data.filter(row =>
    Object.values(row).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          />
        </div>
        <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={15} /> {addLabel}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {columns.map(col => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{col.label}</th>
              ))}
              {rowActions && <th className="px-4 py-3 w-10" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                  ))}
                  {rowActions && <td className="px-4 py-3" />}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-4 py-12 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-gray-700">
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-4 py-3 relative">
                      <button onClick={() => setOpenMenu(openMenu === i ? null : i)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                        <MoreHorizontal size={16} />
                      </button>
                      {openMenu === i && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                          <div className="absolute right-4 top-full mt-1 w-40 bg-white rounded-lg border border-gray-100 shadow-lg z-20 py-1">
                            {rowActions(row).map(action => (
                              <button key={action.label} onClick={() => { action.onClick(); setOpenMenu(null) }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${action.danger ? 'text-red-500 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}`}>
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}