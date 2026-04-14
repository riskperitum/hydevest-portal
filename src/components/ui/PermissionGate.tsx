'use client'

import { usePermissions, can } from '@/lib/permissions/hooks'

interface PermissionGateProps {
  permission: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { permissions, isSuperAdmin, loading } = usePermissions()
  if (loading) return null
  if (!can(permissions, isSuperAdmin, permission)) return <>{fallback}</>
  return <>{children}</>
}

