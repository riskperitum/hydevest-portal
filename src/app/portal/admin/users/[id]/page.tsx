'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, Shield, Check,
  X, Search, Plus, Trash2, Ban
} from 'lucide-react'
import Link from 'next/link'

interface UserProfile {
  id: string
  full_name: string | null
  email: string
  is_active: boolean
}

interface Role {
  id: string
  name: string
  description: string | null
}

interface Permission {
  key: string
  module: string
  description: string
}

interface UserPermission {
  id: string
  permission_key: string
  type: string
}

const MODULE_ORDER = ['system','trips','containers','presales','sales_orders','recoveries','expenses','accounts','reports','admin']

export default function UserDetailPage() {
  const params = useParams()
  const userId = params.id as string

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [userRoleIds, setUserRoleIds] = useState<Set<string>>(new Set())
  const [allPermissions, setAllPermissions] = useState<Permission[]>([])
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'roles' | 'permissions'>('roles')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [addingPerm, setAddingPerm] = useState(false)
  const [newPermKey, setNewPermKey] = useState('')
  const [newPermType, setNewPermType] = useState<'grant' | 'deny'>('grant')
  const [permSearch, setPermSearch] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const [
      { data: prof },
      { data: roles },
      { data: userRoles },
      { data: perms },
      { data: userPerms },
    ] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, is_active').eq('id', userId).single(),
      supabase.from('roles').select('id, name, description').order('name'),
      supabase.from('user_roles').select('role_id').eq('user_id', userId),
      supabase.from('permissions').select('key, module, description').order('module').order('key'),
      supabase.from('user_permissions').select('id, permission_key, type').eq('user_id', userId),
    ])
    setProfile(prof)
    setAllRoles(roles ?? [])
    setUserRoleIds(new Set((userRoles ?? []).map(ur => ur.role_id)))
    setAllPermissions(perms ?? [])
    setUserPermissions(userPerms ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function toggleRole(roleId: string) {
    setSaving(true)
    const supabase = createClient()
    if (userRoleIds.has(roleId)) {
      await supabase.from('user_roles').delete().eq('user_id', userId).eq('role_id', roleId)
      setUserRoleIds(prev => { const n = new Set(prev); n.delete(roleId); return n })
    } else {
      await supabase.from('user_roles').insert({ user_id: userId, role_id: roleId })
      setUserRoleIds(prev => new Set([...prev, roleId]))
    }
    setSaving(false)
  }

  async function addDirectPermission() {
    if (!newPermKey) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('user_permissions').upsert({
      user_id: userId,
      permission_key: newPermKey,
      type: newPermType,
    }, { onConflict: 'user_id,permission_key' })
    setAddingPerm(false)
    setNewPermKey('')
    setNewPermType('grant')
    setSaving(false)
    load()
  }

  async function removeDirectPermission(id: string) {
    const supabase = createClient()
    await supabase.from('user_permissions').delete().eq('id', id)
    load()
  }

  const filteredRoles = allRoles.filter(r =>
    search === '' ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const filteredPermsForAdd = allPermissions.filter(p =>
    permSearch === '' ||
    p.key.toLowerCase().includes(permSearch.toLowerCase()) ||
    p.description.toLowerCase().includes(permSearch.toLowerCase())
  )

  const groupedPermsForAdd = MODULE_ORDER.reduce((acc, mod) => {
    const perms = filteredPermsForAdd.filter(p => p.module === mod)
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/admin/users"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
            <span className="text-brand-700 text-base font-semibold">
              {(profile?.full_name ?? profile?.email ?? 'U')[0].toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{profile?.full_name ?? '—'}</h1>
            <p className="text-sm text-gray-400">{profile?.email}</p>
          </div>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Assigned roles:</span>
        {userRoleIds.size === 0
          ? <span className="text-xs text-gray-300 italic">None</span>
          : allRoles.filter(r => userRoleIds.has(r.id)).map(r => (
            <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium border border-brand-200">
              <Shield size={9} /> {r.name}
            </span>
          ))
        }
        {userPermissions.filter(p => p.type === 'deny').length > 0 && (
          <>
            <span className="text-xs text-gray-500 font-medium ml-2">Denied:</span>
            {userPermissions.filter(p => p.type === 'deny').map(p => (
              <span key={p.id} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-200 font-mono">{p.permission_key}</span>
            ))}
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'roles', label: 'Roles', count: userRoleIds.size },
            { key: 'permissions', label: 'Direct permissions', count: userPermissions.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as 'roles' | 'permissions')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ROLES TAB */}
        {activeTab === 'roles' && (
          <div className="p-5 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search roles..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
              {filteredRoles.map(role => {
                const isAssigned = userRoleIds.has(role.id)
                return (
                  <div key={role.id}
                    onClick={() => toggleRole(role.id)}
                    className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-colors
                      ${isAssigned ? 'bg-brand-50/40 hover:bg-brand-50' : 'hover:bg-gray-50'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
                      ${isAssigned ? 'bg-brand-600 border-brand-600' : 'border-gray-300'}`}>
                      {saving ? <Loader2 size={11} className="animate-spin text-white" /> :
                        isAssigned && <Check size={11} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{role.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{role.description ?? 'No description'}</p>
                    </div>
                    {isAssigned && <span className="text-xs text-brand-600 font-medium shrink-0">Assigned</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* DIRECT PERMISSIONS TAB */}
        {activeTab === 'permissions' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Direct permissions override or deny role-level permissions for this user specifically.</p>
              <button onClick={() => setAddingPerm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shrink-0">
                <Plus size={13} /> Add permission
              </button>
            </div>

            {userPermissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 border border-dashed border-gray-200 rounded-xl">
                <p className="text-sm text-gray-400">No direct permissions set for this user.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {userPermissions.map(up => (
                  <div key={up.id} className="flex items-center gap-4 px-4 py-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                      ${up.type === 'deny' ? 'bg-red-100' : 'bg-green-100'}`}>
                      {up.type === 'deny'
                        ? <Ban size={13} className="text-red-600" />
                        : <Check size={13} className="text-green-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-medium text-gray-900">{up.permission_key}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {up.type === 'deny'
                          ? 'Explicitly denied — overrides any role grant'
                          : 'Directly granted — overrides role restrictions'}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0
                      ${up.type === 'deny' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                      {up.type === 'deny' ? 'Denied' : 'Granted'}
                    </span>
                    <button onClick={() => removeDirectPermission(up.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add permission panel */}
            {addingPerm && (
              <div className="border border-brand-200 rounded-xl p-4 bg-brand-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Add direct permission</p>
                  <button onClick={() => { setAddingPerm(false); setNewPermKey(''); setPermSearch('') }}
                    className="p-1 rounded text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <select value={newPermType} onChange={e => setNewPermType(e.target.value as 'grant' | 'deny')}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                      <option value="grant">Grant — allow this permission</option>
                      <option value="deny">Deny — block this permission</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Selected permission</label>
                    <div className={`px-3 py-2 text-sm rounded-lg border font-mono
                      ${newPermKey ? 'bg-white border-brand-300 text-brand-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                      {newPermKey || 'Select below...'}
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={permSearch} onChange={e => setPermSearch(e.target.value)}
                    placeholder="Search permissions..."
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
                </div>
                <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {Object.entries(groupedPermsForAdd).map(([mod, perms]) => (
                    <div key={mod}>
                      <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">{mod.replace('_', ' ')}</div>
                      {perms.map(p => (
                        <div key={p.key}
                          onClick={() => setNewPermKey(p.key)}
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors
                            ${newPermKey === p.key ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0
                            ${newPermKey === p.key ? 'border-brand-600 bg-brand-600' : 'border-gray-300'}`}>
                            {newPermKey === p.key && <div className="w-full h-full rounded-full flex items-center justify-center"><div className="w-1.5 h-1.5 bg-white rounded-full" /></div>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono font-medium text-gray-900">{p.key}</p>
                            <p className="text-xs text-gray-400 truncate">{p.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setAddingPerm(false); setNewPermKey(''); setPermSearch('') }}
                    className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button onClick={addDirectPermission} disabled={saving || !newPermKey}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2
                      ${newPermType === 'deny' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> :
                      newPermType === 'deny' ? <><Ban size={13} /> Deny permission</> : <><Check size={13} /> Grant permission</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

