'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, User, ChevronDown, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  )
}
