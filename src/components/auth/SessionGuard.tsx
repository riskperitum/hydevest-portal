'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const IDLE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const WARNING_BEFORE_MS = 60 * 1000     // show warning 1 minute before logout
const SESSION_CHECK_INTERVAL_MS = 30 * 1000 // check session validity every 30s

export default function SessionGuard({ userId }: { userId: string }) {
  const router = useRouter()
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(60)
  const lastActivityRef = useRef<number>(Date.now())
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const performLogout = useCallback(async (reason: 'idle' | 'concurrent') => {
    const supabase = createClient()
    try {
      await supabase.from('user_sessions').delete().eq('user_id', userId)
    } catch {}
    await supabase.auth.signOut()
    sessionStorage.removeItem('session_token')
    const message = reason === 'idle'
      ? 'You were logged out due to inactivity.'
      : 'You were logged out because you signed in elsewhere.'
    router.push(`/auth/login?msg=${encodeURIComponent(message)}`)
  }, [router, userId])

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setShowWarning(false)

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
      setSecondsLeft(60)
      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => Math.max(0, prev - 1))
      }, 1000)
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS)

    logoutTimerRef.current = setTimeout(() => {
      void performLogout('idle')
    }, IDLE_TIMEOUT_MS)
  }, [performLogout])

  // Update last_active in DB
  const pingActive = useCallback(async () => {
    const supabase = createClient()
    const sessionToken = sessionStorage.getItem('session_token')
    if (!sessionToken) return
    await supabase.from('user_sessions').update({ last_active: new Date().toISOString() }).eq('user_id', userId)
  }, [userId])

  // Check if our session is still the latest one
  const checkSessionValidity = useCallback(async () => {
    const supabase = createClient()
    const sessionToken = sessionStorage.getItem('session_token')
    if (!sessionToken) {
      void performLogout('concurrent')
      return
    }
    const { data } = await supabase.from('user_sessions').select('session_token').eq('user_id', userId).maybeSingle()
    if (!data) {
      // No active session row — could be a fresh login race, allow
      return
    }
    if (data.session_token !== sessionToken) {
      void performLogout('concurrent')
    }
  }, [userId, performLogout])

  useEffect(() => {
    // Set initial token if missing (covers refresh after login)
    if (!sessionStorage.getItem('session_token')) {
      const token = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem('session_token', token)
      const supabase = createClient()
      void supabase.from('user_sessions').upsert({
        user_id: userId,
        session_token: token,
        last_active: new Date().toISOString(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    const handler = () => resetTimers()
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    resetTimers()

    // Periodic ping + session validity check
    const pingInterval = setInterval(() => { void pingActive() }, 60 * 1000)
    const sessionInterval = setInterval(() => { void checkSessionValidity() }, SESSION_CHECK_INTERVAL_MS)

    return () => {
      events.forEach(e => window.removeEventListener(e, handler))
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      clearInterval(pingInterval)
      clearInterval(sessionInterval)
    }
  }, [resetTimers, pingActive, checkSessionValidity, userId])

  if (!showWarning) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">You're about to be signed out</h3>
            <p className="text-sm text-gray-500 mt-1">
              You've been inactive for a while. You'll be logged out in <span className="font-bold text-amber-700">{secondsLeft}s</span> for security.
            </p>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => void performLogout('idle')}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
            Sign out now
          </button>
          <button type="button" onClick={resetTimers}
            className="flex-1 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700">
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  )
}
