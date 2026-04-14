'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Search } from 'lucide-react'
import Link from 'next/link'

interface Permission {
  id: string
  key: string
  module: string
  action: string
  description: string
}

const MODULE_ORDER = ['system','trips','containers','presales','sales_orders','recoveries','expenses','accounts','reports','admin']

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('permissions').select('*').order('module').order('key')
      .then(({ data }) => { setPermissions(data ?? []); setLoading(false) })
  }, [])

  const filtered = permissions.filter(p =>
    search === '' ||
    p.key.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase()) ||
    p.module.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = MODULE_ORDER.reduce((acc, mod) => {
    const perms = filtered.filter(p => p.module === mod)
    if (perms.length) acc[mod] = perms
    return acc
  }, {} as Record<string, Permission[]>)

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/admin"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Permissions Registry</h1>
          <p className="text-sm text-gray-400 mt-0.5">{permissions.length} permissions defined across all modules</p>
        </div>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search permissions..."
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([module, perms]) => (
          <div key={module} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 capitalize">{module.replace('_', ' ')}</span>
              <span className="text-xs text-gray-400">{perms.length} permission{perms.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {perms.map(p => (
                <div key={p.key} className="flex items-start gap-4 px-5 py-3">
                  <code className="text-xs font-mono bg-brand-50 text-brand-700 px-2 py-1 rounded font-medium shrink-0 mt-0.5">{p.key}</code>
                  <p className="text-sm text-gray-600">{p.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

