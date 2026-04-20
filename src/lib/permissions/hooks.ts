'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PermissionState {
  permissions: Set<string>
  isSuperAdmin: boolean
  loading: boolean
}

// Cache permissions per session to avoid repeated DB calls
// Cache with timestamp to auto-expire after 30 seconds
let cachedPermissions: Set<string> | null = null
let cachedIsSuperAdmin: boolean | null = null
let cacheUserId: string | null = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 30_000 // 30 seconds

export function usePermissions() {
  const [state, setState] = useState<PermissionState>({
    permissions: new Set(),
    isSuperAdmin: false,
    loading: true,
  })

  const loadPermissions = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setState({ permissions: new Set(), isSuperAdmin: false, loading: false }); return }

    // Return cached if same user and cache is fresh
    const now = Date.now()
    if (
      cacheUserId === user.id &&
      cachedPermissions !== null &&
      cachedIsSuperAdmin !== null &&
      (now - cacheTimestamp) < CACHE_TTL_MS
    ) {
      setState({ permissions: cachedPermissions, isSuperAdmin: cachedIsSuperAdmin, loading: false })
      return
    }

    // Load user roles
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id, roles(name)')
      .eq('user_id', user.id)

    const roleIds = (userRoles ?? []).map(ur => ur.role_id)
    const roleNames = (userRoles ?? []).map(ur => (ur.roles as any)?.name ?? '')
    const isSuperAdmin = roleNames.includes('super_admin')

    // Load role permissions
    const { data: rolePerms } = roleIds.length > 0
      ? await supabase.from('role_permissions').select('permission_key').in('role_id', roleIds)
      : { data: [] }

    // Load direct user permissions
    const { data: userPerms } = await supabase
      .from('user_permissions')
      .select('permission_key, type')
      .eq('user_id', user.id)

    // Build permission set
    const granted = new Set<string>()
    const denied = new Set<string>()

    // Add role permissions
    for (const rp of rolePerms ?? []) {
      granted.add(rp.permission_key)
    }

    // Process user direct permissions
    for (const up of userPerms ?? []) {
      if (up.type === 'deny') {
        denied.add(up.permission_key)
        granted.delete(up.permission_key)
      } else {
        if (!denied.has(up.permission_key)) {
          granted.add(up.permission_key)
        }
      }
    }

    cacheUserId = user.id
    cachedPermissions = granted
    cachedIsSuperAdmin = isSuperAdmin
    cacheTimestamp = Date.now()

    setState({ permissions: granted, isSuperAdmin, loading: false })
  }, [])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  return state
}

export function clearPermissionCache() {
  cachedPermissions = null
  cachedIsSuperAdmin = null
  cacheUserId = null
  cacheTimestamp = 0
}

// Main permission check function
export function can(
  permissions: Set<string>,
  isSuperAdmin: boolean,
  key: string
): boolean {
  if (isSuperAdmin) return true
  if (permissions.has('*')) return true

  // Check wildcard module permission e.g. trips.*
  const module = key.split('.')[0]
  if (permissions.has(`${module}.*`)) return true

  // Check specific permission
  return permissions.has(key)
}
