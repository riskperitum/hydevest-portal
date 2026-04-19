'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Shield, ChevronDown, ChevronUp, Check } from 'lucide-react'

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
}

interface RolePermission {
  role_id: string
  permission_key: string
}

const MODULE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  system:       { label: 'System',           color: 'text-gray-700',   bg: 'bg-gray-100'    },
  admin:        { label: 'Admin',            color: 'text-red-700',    bg: 'bg-red-50'      },
  global:       { label: 'Global',           color: 'text-gray-700',   bg: 'bg-gray-100'    },
  trips:        { label: 'Purchase — Trips', color: 'text-blue-700',   bg: 'bg-blue-50'     },
  containers:   { label: 'Containers',       color: 'text-blue-700',   bg: 'bg-blue-50'     },
  inventory:    { label: 'Inventory',        color: 'text-teal-700',   bg: 'bg-teal-50'     },
  presales:     { label: 'Presales',         color: 'text-purple-700', bg: 'bg-purple-50'   },
  sales_orders: { label: 'Sales orders',     color: 'text-amber-700',  bg: 'bg-amber-50'    },
  recoveries:   { label: 'Recoveries',       color: 'text-green-700',  bg: 'bg-green-50'    },
  expenses:     { label: 'Expensify',        color: 'text-orange-700', bg: 'bg-orange-50'   },
  accounts:     { label: 'System accounts',  color: 'text-indigo-700', bg: 'bg-indigo-50'   },
  partnership:  { label: 'Partnership',      color: 'text-pink-700',   bg: 'bg-pink-50'     },
  requestbox:   { label: 'Request box',      color: 'text-cyan-700',   bg: 'bg-cyan-50'     },
  tasks:        { label: 'Tasks',            color: 'text-yellow-700', bg: 'bg-yellow-50'   },
  reports:      { label: 'Reports',          color: 'text-violet-700', bg: 'bg-violet-50'   },
  finance:      { label: 'Finance',          color: 'text-emerald-700',bg: 'bg-emerald-50'  },
  payroll:      { label: 'Payroll',          color: 'text-sky-700',    bg: 'bg-sky-50'      },
  legal:        { label: 'Legal',            color: 'text-rose-700',   bg: 'bg-rose-50'     },
}

const MODULE_ORDER = [
  'system','admin','global',
  'trips','containers','inventory',
  'presales','sales_orders','recoveries',
  'expenses','accounts','partnership',
  'requestbox','tasks','reports',
  'finance','payroll','legal',
]

export default function PermissionsPage() {
  const [permissions, setPermissions]       = useState<Permission[]>([])
  const [roles, setRoles]                   = useState<Role[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([])
  const [selectedRole, setSelectedRole]     = useState<string>('')
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState<string | null>(null)
  const [search, setSearch]                 = useState('')
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(MODULE_ORDER))

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data: permsData }, { data: rolesData }, { data: rpData }] = await Promise.all([
      supabase.from('permissions').select('*').order('module').order('action'),
      supabase.from('roles').select('*').order('name'),
      supabase.from('role_permissions').select('role_id, permission_key'),
    ])
    setPermissions(permsData ?? [])
    setRoles(rolesData ?? [])
    setRolePermissions(rpData ?? [])
    if (!selectedRole && rolesData && rolesData.length > 0) {
      setSelectedRole(rolesData[0].id)
    }
    setLoading(false)
  }, [selectedRole])

  useEffect(() => { load() }, [load])

  function hasPermission(permKey: string): boolean {
    return rolePermissions.some(rp => rp.role_id === selectedRole && rp.permission_key === permKey)
  }

  async function togglePermission(permKey: string) {
    if (!selectedRole) return
    setSaving(permKey)
    const supabase = createClient()
    const has = hasPermission(permKey)

    if (has) {
      await supabase.from('role_permissions')
        .delete()
        .eq('role_id', selectedRole)
        .eq('permission_key', permKey)
      setRolePermissions(prev => prev.filter(rp => !(rp.role_id === selectedRole && rp.permission_key === permKey)))
    } else {
      await supabase.from('role_permissions')
        .insert({ role_id: selectedRole, permission_key: permKey })
      setRolePermissions(prev => [...prev, { role_id: selectedRole, permission_key: permKey }])
    }
    setSaving(null)
  }

  function toggleModule(module: string) {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(module)) next.delete(module)
      else next.add(module)
      return next
    })
  }

  function modulePermCount(module: string): { total: number; granted: number } {
    const modulePerms = permissions.filter(p => p.module === module)
    const granted     = modulePerms.filter(p => hasPermission(p.key)).length
    return { total: modulePerms.length, granted }
  }

  // Group permissions by module
  const grouped: Record<string, Permission[]> = {}
  for (const p of permissions) {
    if (!grouped[p.module]) grouped[p.module] = []
    grouped[p.module].push(p)
  }

  const orderedModules = [
    ...MODULE_ORDER.filter(m => grouped[m]),
    ...Object.keys(grouped).filter(m => !MODULE_ORDER.includes(m)),
  ]

  const filteredModules = orderedModules.filter(module => {
    if (search === '') return true
    return grouped[module]?.some(p =>
      p.key.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      module.toLowerCase().includes(search.toLowerCase())
    )
  })

  const selectedRoleData = roles.find(r => r.id === selectedRole)

  return (
    <div className="space-y-5 max-w-5xl">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Permissions</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage granular permissions per role across all modules</p>
      </div>

      {/* Role selector */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-brand-600" />
            <span className="text-sm font-semibold text-gray-700">Editing permissions for:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {roles.map(role => (
              <button key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize
                  ${selectedRole === role.id
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                style={selectedRole === role.id ? { background: '#55249E' } : {}}>
                {role.name.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        {selectedRoleData && (
          <p className="text-xs text-gray-400 mt-2 ml-6">
            {rolePermissions.filter(rp => rp.role_id === selectedRole).length} permissions granted
            {selectedRoleData.description && ` · ${selectedRoleData.description}`}
          </p>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search permissions..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {/* Permissions grouped by module */}
      {loading ? (
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))
      ) : (
        <div className="space-y-3">
          {filteredModules.map(module => {
            const cfg      = MODULE_CONFIG[module] ?? { label: module, color: 'text-gray-700', bg: 'bg-gray-100' }
            const isOpen   = expandedModules.has(module)
            const counts   = modulePermCount(module)
            const modulePerms = (grouped[module] ?? []).filter(p =>
              search === '' ||
              p.key.toLowerCase().includes(search.toLowerCase()) ||
              p.description.toLowerCase().includes(search.toLowerCase())
            )

            return (
              <div key={module} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Module header */}
                <button
                  onClick={() => toggleModule(module)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {counts.granted} / {counts.total} granted
                    </span>
                    {counts.granted > 0 && counts.granted === counts.total && (
                      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-medium">
                        Full access
                      </span>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp size={14} className="text-gray-400" />
                    : <ChevronDown size={14} className="text-gray-400" />}
                </button>

                {/* Permissions list */}
                {isOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {modulePerms.map(perm => {
                      const granted  = hasPermission(perm.key)
                      const isSaving = saving === perm.key
                      const isWildcard = perm.action === 'all'

                      return (
                        <div key={perm.id}
                          className={`flex items-center justify-between px-5 py-3 hover:bg-gray-50/30 transition-colors
                            ${isWildcard ? 'bg-gray-50/50' : ''}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                                  {perm.key}
                                </code>
                                {isWildcard && (
                                  <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                                    Full module access
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{perm.description}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => togglePermission(perm.key)}
                            disabled={!!isSaving}
                            className={`shrink-0 w-10 h-6 rounded-full transition-all relative ml-4
                              ${granted ? 'bg-brand-600' : 'bg-gray-200'}
                              ${isSaving ? 'opacity-50' : 'hover:opacity-90'}`}>
                            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
                              ${granted ? 'left-5' : 'left-1'}`} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
