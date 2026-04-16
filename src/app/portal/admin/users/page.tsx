'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, ChevronRight, Users, Shield } from 'lucide-react'
import Link from 'next/link'
import Modal from '@/components/ui/Modal'

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
  const [resetOpen, setResetOpen] = useState(false)
  const [resetUser, setResetUser] = useState<{ id: string; full_name: string | null; email: string; role: string } | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState('')

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
      const role = ur.roles as { name?: string } | null
      acc[ur.user_id].push(role?.name ?? '')
      return acc
    }, {} as Record<string, string[]>)

    setUsers((profiles ?? []).map(p => ({
      ...p,
      roles: rolesByUser[p.id] ?? [],
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(t)
  }, [load])

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id).single()
      const role = data?.roles as { name?: string } | null
      setCurrentUserRole(role?.name ?? '')
    })
  }, [])

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
          {currentUserRole !== '' && (
            <p className="text-xs text-gray-400 mt-1">Your role: {currentUserRole}</p>
          )}
        </div>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          disabled={loading}
          placeholder="Search users..."
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50" />
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
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  setResetUser({
                    id: user.id,
                    full_name: user.full_name,
                    email: user.email,
                    role: user.roles.length ? user.roles.join(', ') : '—',
                  })
                  setResetPw('')
                  setResetConfirm('')
                  setResetError('')
                  setResetSuccess(false)
                  setResetOpen(true)
                }}
                className="text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 transition-colors">
                Reset password
              </button>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-400 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset user password" size="sm">
        {resetSuccess ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Password reset successfully</p>
            <p className="text-xs text-gray-500">for {resetUser?.full_name ?? resetUser?.email}</p>
            <button onClick={() => setResetOpen(false)}
              className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-xl hover:bg-brand-700">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={async e => {
            e.preventDefault()
            setResetError('')
            if (resetPw !== resetConfirm) { setResetError('Passwords do not match.'); return }
            if (resetPw.length < 8) { setResetError('Password must be at least 8 characters.'); return }
            setResetSaving(true)
            const res = await fetch('/api/admin/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ target_user_id: resetUser?.id, new_password: resetPw }),
            })
            const result = await res.json()
            if (!res.ok) { setResetError(result.error ?? 'Failed to reset password.'); setResetSaving(false); return }
            setResetSaving(false)
            setResetSuccess(true)
          }} className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-xs font-medium text-amber-800">Resetting password for:</p>
              <p className="text-sm font-semibold text-amber-900 mt-0.5">{resetUser?.full_name ?? resetUser?.email}</p>
              <p className="text-xs text-amber-600">{resetUser?.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
              <input type="password" required value={resetPw}
                onChange={e => setResetPw(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
              <input type="password" required value={resetConfirm}
                onChange={e => setResetConfirm(e.target.value)}
                placeholder="Repeat new password"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {resetError && <p className="text-xs text-red-600 font-medium">{resetError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setResetOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={resetSaving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {resetSaving ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

