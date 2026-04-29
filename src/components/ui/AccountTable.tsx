'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Plus, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
}

interface AccountTableProps<T> {
  title?: string
  description?: string
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  onAdd: () => void
  addLabel: string
  searchPlaceholder?: string
  emptyMessage?: string
  rowActions?: (row: T) => { label: string; onClick: () => void; danger?: boolean; icon?: React.ReactNode }[]
  onRowClick?: (row: T) => void
}

interface DropdownState {
  index: number
  x: number
  y: number
}

export default function AccountTable<T>({
  columns, data, loading, onAdd, addLabel,
  searchPlaceholder = 'Search...', emptyMessage = 'No records found.', rowActions, onRowClick,
}: AccountTableProps<T>) {
  const [search, setSearch] = useState('')
  const [dropdown, setDropdown] = useState<DropdownState | null>(null)
  const [page, setPage] = useState(1)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const PER_PAGE = 10

  const filtered = data.filter(row =>
    Object.values(row as Record<string, unknown>).some(v =>
      String(v ?? '').toLowerCase().includes(search.toLowerCase())
    )
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdown) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdown])

  function openDropdown(e: React.MouseEvent<HTMLButtonElement>, index: number) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    // Position below the button, aligned to the right
    setDropdown({
      index,
      x: rect.right - 192, // ~w-48
      y: rect.bottom + 4,
    })
  }

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
        <button onClick={onAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={15} /> {addLabel}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {columns.map(col => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              {rowActions && <th className="px-4 py-3 w-10" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                  {rowActions && <td className="px-4 py-3" />}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="px-4 py-12 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : paginated.map((row, i) => (
              <tr key={i}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}>
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3 text-gray-700">
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={e => openDropdown(e, i)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
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

      {/* Fixed-position dropdown portal — renders outside any overflow container */}
      {dropdown !== null && rowActions && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDropdown(null)} />
          <div
            ref={dropdownRef}
            className="fixed z-50 w-48 bg-white rounded-xl border border-gray-100 shadow-xl py-1"
            style={{ left: dropdown.x, top: dropdown.y }}>
            {rowActions(paginated[dropdown.index]).map(action => (
              <button
                key={action.label}
                onClick={() => { action.onClick(); setDropdown(null) }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2
                  ${action.danger
                    ? 'text-red-500 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50'}`}>
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}