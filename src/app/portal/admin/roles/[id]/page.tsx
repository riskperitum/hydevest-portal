'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, Check, Search, Lock } from 'lucide-react'
import Link from 'next/link'

interface Permission {
  id: string
  key: string
  module: string
  action: string
  description: string
}

interface Role {
  id: string
  name: string
  description: string | null
  is_system: boolean
}

const MODULE_ORDER = ['system','trips','containers','presales','sales_orders','recoveries','expenses','accounts','reports','admin']

export default function RoleDetailPage() {
  const params = useParams()
  const roleId = params.id as string

  const [role, setRole] = useState<Role | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: roleData }, { data: allPerms }, { data: rolePerms }] = await Promise.all([
      supabase.from('roles').select('*').eq('id', roleId).single(),
      supabase.from('permissions').select('*').order('module').order('key'),
      supabase.from('role_permissions').select('permission_key').eq('role_id', roleId),
    ])
    setRole(roleData)
    setPermissions(allPerms ?? [])
    setAssigned(new Set((rolePerms ?? []).map(rp => rp.permission_key)))
    setLoading(false)
  }, [roleId])

  useEffect(() => { load() }, [load])

  async function togglePermission(key: string) {
    if (role?.is_system) return
    setSaving(key)
    const supabase = createClient()
    if (assigned.has(key)) {
      await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_key', key)
      setAssigned(prev => { const n = new Set(prev); n.delete(key); return n })
    } else {
      await supabase.from('role_permissions').insert({ role_id: roleId, permission_key: key })
      setAssigned(prev => new Set([...prev, key]))
    }
    setSaving(null)
  }

  async function toggleAll(module: string, modulePerms: Permission[]) {
    if (role?.is_system) return
    const supabase = createClient()
    const allAssigned = modulePerms.every(p => assigned.has(p.key))
    if (allAssigned) {
      await supabase.from('role_permissions').delete().eq('role_id', roleId).in('permission_key', modulePerms.map(p => p.key))
      setAssigned(prev => { const n = new Set(prev); modulePerms.forEach(p => n.delete(p.key)); return n })
    } else {
      const toAdd = modulePerms.filter(p => !assigned.has(p.key))
      if (toAdd.length) {
        await supabase.from('role_permissions').insert(toAdd.map(p => ({ role_id: roleId, permission_key: p.key })))
        setAssigned(prev => new Set([...prev, ...toAdd.map(p => p.key)]))
      }
    }
  }

  const filtered = permissions.filter(p =>
    search === '' ||
    p.key.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = MODULE_ORDER.reduce((acc, mod) => {
    const perms = filtered.filter(p => p.module === mod)
    if (perms.length) acc[mod] = perms
    return acc
  }, {} as Record<string, Permission[]>)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/admin/roles"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{role?.name}</h1>
            {role?.is_system && <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded font-medium flex items-center gap-1"><Lock size={10} /> System</span>}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{role?.description ?? 'No description'} · {assigned.size} permission{assigned.size !== 1 ? 's' : ''} assigned</p>
        </div>
      </div>

      {role?.is_system && (
        <div className="p-4 bg-brand-50 rounded-xl border border-brand-200">
          <p className="text-sm text-brand-700 font-medium">This is a system role and cannot be modified. System roles are managed automatically.</p>
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search permissions..."
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([module, perms]) => {
          const allAssigned = perms.every(p => assigned.has(p.key))
          const someAssigned = perms.some(p => assigned.has(p.key))
          return (
            <div key={module} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700 capitalize">{module.replace('_', ' ')}</span>
                  <span className="text-xs text-gray-400">{perms.filter(p => assigned.has(p.key)).length}/{perms.length}</span>
                </div>
                {!role?.is_system && (
                  <button onClick={() => toggleAll(module, perms)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors
                      ${allAssigned ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {allAssigned ? 'Remove all' : someAssigned ? 'Add remaining' : 'Add all'}
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {perms.map(perm => {
                  const isAssigned = assigned.has(perm.key)
                  const isSaving = saving === perm.key
                  return (
                    <div key={perm.key}
                      className={`flex items-center gap-4 px-5 py-3 transition-colors
                        ${!role?.is_system ? 'cursor-pointer hover:bg-gray-50/50' : ''}
                        ${isAssigned ? 'bg-brand-50/30' : ''}`}
                      onClick={() => !role?.is_system && togglePermission(perm.key)}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
                        ${isAssigned ? 'bg-brand-600 border-brand-600' : 'border-gray-300'}`}>
                        {isSaving
                          ? <Loader2 size={11} className="animate-spin text-white" />
                          : isAssigned && <Check size={11} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-brand-700 font-medium">{perm.key}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{perm.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

