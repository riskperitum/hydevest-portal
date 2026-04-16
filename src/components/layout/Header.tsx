'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, User, ChevronDown, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'

interface HeaderProps {
  profile: { id: string; full_name: string | null; email: string; avatar_url: string | null } | null
  isSuperAdmin: boolean
}

interface Notification {
  id: string
  type: string
  title: string
  message: string | null
  is_read: boolean
  record_ref: string | null
  module: string | null
  task_id: string | null
  record_id: string | null
  created_at: string
}

export default function Header({ profile, isSuperAdmin }: HeaderProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : (profile?.email?.[0] ?? 'U').toUpperCase()

  async function loadNotifications() {
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data ?? [])
    setUnreadCount((data ?? []).filter(n => !n.is_read).length)
  }

  useEffect(() => {
    loadNotifications()
    const supabase = createClient()
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        loadNotifications()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function markAllRead() {
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    loadNotifications()
  }

  async function markRead(id: string) {
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    loadNotifications()
  }

  function handleNotifClick(notif: Notification) {
    markRead(notif.id)
    if (notif.type === 'note_mention' && notif.record_id) {
      router.push(`/portal/reports/customer-debt/${notif.record_id}?tab=notes`)
      setNotifOpen(false)
      return
    }
    if (notif.task_id) {
      router.push('/portal/tasks')
    } else if (notif.module === 'trips' && notif.record_id) {
      router.push(`/portal/purchase/trips/${notif.record_id}`)
    }
    setNotifOpen(false)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 shrink-0">
        <div className="w-10 lg:w-0" />
        <div className="flex items-center gap-3">

        {/* Notification bell */}
        <div className="relative">
          <button onClick={() => { setNotifOpen(v => !v); if (!notifOpen) loadNotifications() }}
            className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-brand-600 text-white text-xs font-bold rounded-full flex items-center justify-center px-0.5">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-gray-100 shadow-lg z-20 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">Notifications</p>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <CheckCircle2 size={24} className="mx-auto text-gray-200 mb-2" />
                      <p className="text-xs text-gray-400">No notifications</p>
                    </div>
                  ) : notifications.map(notif => (
                    <button key={notif.id} onClick={() => handleNotifClick(notif)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!notif.is_read ? 'bg-brand-50/50' : ''}`}>
                      <div className="flex items-start gap-2">
                        {!notif.is_read && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-1.5" />}
                        {notif.is_read && <span className="w-2 h-2 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{notif.title}</p>
                          {notif.message && <p className="text-xs text-gray-500 truncate mt-0.5">{notif.message}</p>}
                          <p className="text-xs text-gray-400 mt-1">{new Date(notif.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="px-4 py-2 border-t border-gray-100">
                  <button onClick={() => { router.push('/portal/tasks'); setNotifOpen(false) }}
                    className="text-xs text-brand-600 hover:underline w-full text-center">
                    View all tasks
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-800 leading-none">
                {profile?.full_name ? profile.full_name.split(' ')[0] + ' ' + (profile.full_name.split(' ')[1] ?? '') : profile?.email}
              </p>
              {isSuperAdmin && <p className="text-xs text-brand-600 mt-0.5">Super admin</p>}
            </div>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-100 shadow-lg z-20 py-1">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-800 truncate">{profile?.full_name ?? 'User'}</p>
                  <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                </div>
                <button onClick={() => { setMenuOpen(false); router.push('/portal/admin') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  <User size={15} /> My profile
                </button>
                <button
                  onClick={() => { setPwOpen(true); setPwError(''); setPwSuccess(false); setPwForm({ current: '', next: '', confirm: '' }) }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Change password
                </button>
                <button onClick={signOut}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      </header>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Change password" size="sm">
        {pwSuccess ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Password changed successfully</p>
            <button onClick={() => setPwOpen(false)}
              className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-xl hover:bg-brand-700">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={async e => {
            e.preventDefault()
            setPwError('')
            if (pwForm.next !== pwForm.confirm) { setPwError('New passwords do not match.'); return }
            if (pwForm.next.length < 8) { setPwError('Password must be at least 8 characters.'); return }
            setPwSaving(true)
            const supabase = (await import('@/lib/supabase/client')).createClient()
            const { error } = await supabase.auth.updateUser({ password: pwForm.next })
            if (error) { setPwError(error.message); setPwSaving(false); return }
            setPwSaving(false)
            setPwSuccess(true)
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
              <input type="password" required value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
              <input type="password" required value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="Repeat new password"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {pwError && <p className="text-xs text-red-600 font-medium">{pwError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setPwOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={pwSaving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {pwSaving ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
