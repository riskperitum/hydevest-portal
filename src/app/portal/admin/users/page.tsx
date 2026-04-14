'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, ChevronRight, Users, Shield } from 'lucide-react'
import Link from 'next/link'

interface UserProfile {
  id: string
  full_name: string | null
  email: string
  is_active: boolean
  roles: string[]
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, is_active')
      .order('full_name')

    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('user_id, roles(name)')

    const rolesByUser = (userRoles ?? []).reduce((acc, ur) => {
      if (!acc[ur.user_id]) acc[ur.user_id] = []
      acc[ur.user_id].push((ur.roles as any)?.name ?? '')
      return acc
    }, {} as Record<string, string[]>)

    setUsers((profiles ?? []).map(p => ({
      ...p,
      roles: rolesByUser[p.id] ?? [],
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = users.filter(u =>
    search === '' ||
    (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/admin"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">{users.length} users</p>
        </div>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Users size={24} className="text-gray-200" />
              <p className="text-sm text-gray-400">No users found.</p>
            </div>
          ) : filtered.map(user => (
            <div key={user.id}
              onClick={() => router.push(`/portal/admin/users/${user.id}`)}
              className="flex items-center gap-4 px-5 py-4 hover:bg-brand-50/30 transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                <span className="text-brand-700 text-sm font-semibold">
                  {(user.full_name ?? user.email)[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">{user.full_name ?? '—'}</p>
                <p className="text-xs text-gray-400">{user.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
                {user.roles.length === 0 ? (
                  <span className="text-xs text-gray-300 italic">No roles</span>
                ) : user.roles.map(r => (
                  <span key={r} className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                    <Shield size={9} /> {r}
                  </span>
                ))}
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-400 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

