'use client'

import { usePermissions, can } from '@/lib/permissions/hooks'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Shield } from 'lucide-react'

interface Props {
  permKey: string
  redirect?: boolean   // redirect to overview if no permission
  children: React.ReactNode
}

export default function PermissionGate({ permKey, redirect = true, children }: Props) {
  const { permissions, isSuperAdmin, loading } = usePermissions()
  const router = useRouter()
  const hasAccess = isSuperAdmin || can(permissions, isSuperAdmin, permKey)

  useEffect(() => {
    if (!loading && !hasAccess && redirect) {
      router.replace('/portal/overview')
    }
  }, [loading, hasAccess, redirect, router])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!hasAccess) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Shield size={32} className="text-gray-200" />
      <p className="text-sm font-medium text-gray-500">You don't have permission to view this page</p>
      <p className="text-xs text-gray-400">Contact your administrator to request access</p>
    </div>
  )

  return <>{children}</>
}
