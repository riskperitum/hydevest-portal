'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Inbox, Send, CheckCircle2, Clock, AlertCircle,
  Search, ChevronRight, ArrowDownCircle,
  RefreshCw, Package, MessageSquare, Loader2,
  X, CornerDownRight
} from 'lucide-react'

interface RBMessage {
  id: string
  message_id: string
  type: string
  subject: string
  body: string | null
  status: string
  priority: string
  amount: number | null
  percentage: number | null
  created_at: string
  actioned_at: string | null
  action_note: string | null
  partner_name: string | null
  partner_id: string | null
  partner_db_id: string | null
  actioned_by_name: string | null
  replies: {
    id: string
    body: string
    from_partner: boolean
    sender_name: string
    created_at: string
  }[]
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  message:             { label: 'Message',            icon: <MessageSquare size={13} />,  color: 'bg-gray-100 text-gray-600' },
  payout_request:      { label: 'Payout request',     icon: <ArrowDownCircle size={13} />, color: 'bg-brand-50 text-brand-700' },
  container_interest:  { label: 'Container interest', icon: <Package size={13} />,         color: 'bg-blue-50 text-blue-700' },
  withdrawal_request:  { label: 'Withdrawal',         icon: <ArrowDownCircle size={13} />, color: 'bg-red-50 text-red-600' },
  reinvestment:        { label: 'Reinvestment',       icon: <RefreshCw size={13} />,       color: 'bg-green-50 text-green-700' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  unread:   { label: 'Unread',   color: 'bg-brand-50 text-brand-700',   dot: 'bg-brand-500' },
  read:     { label: 'Read',     color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  actioned: { label: 'Actioned', color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500' },
  resolved: { label: 'Resolved', color: 'bg-green-50 text-green-700',   dot: 'bg-green-500' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-600',       dot: 'bg-red-500' },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function timeAgo(date: string): string {
  const diffMs = new Date().getTime() - new Date(date).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function RequestBoxPage() {
  const [messages, setMessages] = useState<RBMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<RBMessage | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [actioning, setActioning] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string | null; email: string } | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: msgs } = await supabase
      .from('requestbox_messages')
      .select(`
        id, message_id, type, subject, body, status, priority,
        amount, percentage, created_at, actioned_at, action_note,
        partner:partners!requestbox_messages_from_partner_id_fkey(id, partner_id, name),
        actioned_by_profile:profiles!requestbox_messages_actioned_by_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    const msgIds = (msgs ?? []).map(m => m.id)
    const { data: replies } = msgIds.length > 0
      ? await supabase.from('requestbox_replies')
          .select(`
            id, message_id, body, created_at,
            partner:partners!requestbox_replies_from_partner_id_fkey(name),
            profile:profiles!requestbox_replies_from_user_id_fkey(full_name, email)
          `)
          .in('message_id', msgIds)
          .order('created_at', { ascending: true })
      : { data: [] }

    const repliesByMsg = (replies ?? []).reduce((acc, r) => {
      if (!acc[r.message_id]) acc[r.message_id] = []
      acc[r.message_id].push({
        id: r.id,
        body: r.body,
        from_partner: !!(r.partner as any)?.name,
        sender_name: (r.partner as any)?.name ?? (r.profile as any)?.full_name ?? (r.profile as any)?.email ?? 'Unknown',
        created_at: r.created_at,
      })
      return acc
    }, {} as Record<string, RBMessage['replies']>)

    setMessages((msgs ?? []).map(m => ({
      id: m.id,
      message_id: m.message_id,
      type: m.type,
      subject: m.subject,
      body: m.body,
      status: m.status,
      priority: m.priority,
      amount: m.amount ? Number(m.amount) : null,
      percentage: m.percentage ? Number(m.percentage) : null,
      created_at: m.created_at,
      actioned_at: m.actioned_at,
      action_note: m.action_note,
      partner_name: (m.partner as any)?.name ?? null,
      partner_id: (m.partner as any)?.partner_id ?? null,
      partner_db_id: (m.partner as any)?.id ?? null,
      actioned_by_name: (m.actioned_by_profile as any)?.full_name ?? (m.actioned_by_profile as any)?.email ?? null,
      replies: repliesByMsg[m.id] ?? [],
    })))

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single()
      setCurrentUser(data ? { ...data } : null)
    })
  }, [load])

  async function openMessage(msg: RBMessage) {
    setSelected(msg)
    setReplyText('')
    setActionNote('')
    if (msg.status === 'unread') {
      const supabase = createClient()
      await supabase.from('requestbox_messages').update({ status: 'read' }).eq('id', msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' } : m))
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selected) return
    setSendingReply(true)
    const supabase = createClient()
    await supabase.from('requestbox_replies').insert({
      message_id: selected.id,
      body: replyText.trim(),
      from_user_id: currentUser?.id ?? null,
    })
    setSendingReply(false)
    setReplyText('')
    load()
    // Refresh selected
    const updated = messages.find(m => m.id === selected.id)
    if (updated) setSelected({ ...updated })
  }

  async function actionMessage(newStatus: 'actioned' | 'resolved' | 'rejected') {
    if (!selected) return
    setActioning(true)
    const supabase = createClient()
    await supabase.from('requestbox_messages').update({
      status: newStatus,
      actioned_by: currentUser?.id,
      actioned_at: new Date().toISOString(),
      action_note: actionNote || null,
    }).eq('id', selected.id)
    setActioning(false)
    setActionNote('')
    setSelected(prev => prev ? { ...prev, status: newStatus } : null)
    load()
  }

  const filtered = messages.filter(m => {
    const matchSearch = search === '' ||
      m.subject.toLowerCase().includes(search.toLowerCase()) ||
      (m.partner_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (m.body ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || m.status === statusFilter
    const matchType = typeFilter === '' || m.type === typeFilter
    return matchSearch && matchStatus && matchType
  })

  const unreadCount = messages.filter(m => m.status === 'unread').length

  return (
    <div className="flex h-[calc(100vh-120px)] max-w-7xl gap-0 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Left panel — message list */}
      <div className="w-80 shrink-0 border-r border-gray-100 flex flex-col">

        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Inbox size={16} className="text-brand-600" />
              <h1 className="text-sm font-semibold text-gray-900">Request Box</h1>
              {unreadCount > 0 && (
                <span className="bg-brand-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search messages..."
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">All statuses</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="actioned">Actioned</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">All types</option>
              <option value="message">Message</option>
              <option value="payout_request">Payout</option>
              <option value="container_interest">Container interest</option>
              <option value="withdrawal_request">Withdrawal</option>
              <option value="reinvestment">Reinvestment</option>
            </select>
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-2 bg-gray-100 rounded w-1/2" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-8">
              <Inbox size={28} className="text-gray-200" />
              <p className="text-xs text-gray-400 text-center">No messages found</p>
            </div>
          ) : filtered.map(msg => {
            const typeCfg = TYPE_CONFIG[msg.type] ?? TYPE_CONFIG.message
            const statusCfg = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.read
            const isSelected = selected?.id === msg.id
            return (
              <button key={msg.id}
                onClick={() => openMessage(msg)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                  ${isSelected ? 'bg-brand-50/50 border-l-2 border-brand-500' : ''}
                  ${msg.status === 'unread' ? 'bg-white' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    {msg.status === 'unread' && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                    <span className={`text-xs font-medium truncate ${msg.status === 'unread' ? 'text-gray-900' : 'text-gray-700'}`}>
                      {msg.partner_name ?? 'System'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(msg.created_at)}</span>
                </div>
                <p className={`text-xs truncate mb-1 ${msg.status === 'unread' ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                  {msg.subject}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${typeCfg.color}`}>
                    {typeCfg.icon} {typeCfg.label}
                  </span>
                  {msg.amount && (
                    <span className="text-xs text-gray-500 font-medium">{fmt(msg.amount)}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right panel — message detail */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Message header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${(TYPE_CONFIG[selected.type] ?? TYPE_CONFIG.message).color}`}>
                  {(TYPE_CONFIG[selected.type] ?? TYPE_CONFIG.message).icon}
                  {(TYPE_CONFIG[selected.type] ?? TYPE_CONFIG.message).label}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${(STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.read).color}`}>
                  {(STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.read).label}
                </span>
                {selected.priority === 'high' && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">High priority</span>
                )}
              </div>
              <h2 className="text-base font-semibold text-gray-900">{selected.subject}</h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                {selected.partner_name && <span className="font-medium text-gray-600">{selected.partner_name}</span>}
                {selected.partner_id && <span className="font-mono">{selected.partner_id}</span>}
                <span>·</span>
                <span>{new Date(selected.created_at).toLocaleString()}</span>
              </div>
              {selected.amount && (
                <div className="mt-2 inline-flex items-center gap-2 bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg text-sm font-semibold">
                  Amount: {fmt(selected.amount)}
                  {selected.percentage && <span className="text-brand-500">· {selected.percentage}%</span>}
                </div>
              )}
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Message body + thread */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

            {/* Original message */}
            {selected.body && (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selected.body}</p>
              </div>
            )}

            {/* Replies thread */}
            {selected.replies.length > 0 && (
              <div className="space-y-3">
                {selected.replies.map(reply => (
                  <div key={reply.id}
                    className={`flex items-start gap-3 ${reply.from_partner ? '' : 'flex-row-reverse'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${reply.from_partner ? 'bg-brand-100' : 'bg-gray-200'}`}>
                      <span className={`text-xs font-bold ${reply.from_partner ? 'text-brand-700' : 'text-gray-600'}`}>
                        {reply.sender_name[0].toUpperCase()}
                      </span>
                    </div>
                    <div className={`flex-1 max-w-[80%] ${reply.from_partner ? '' : 'items-end flex flex-col'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-700">{reply.sender_name}</span>
                        <span className="text-xs text-gray-400">{timeAgo(reply.created_at)}</span>
                      </div>
                      <div className={`px-4 py-3 rounded-xl text-sm leading-relaxed
                        ${reply.from_partner ? 'bg-white border border-gray-100' : 'bg-brand-600 text-white'}`}>
                        {reply.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action result */}
            {selected.actioned_at && (
              <div className={`p-3 rounded-xl border ${selected.status === 'resolved' ? 'bg-green-50 border-green-200' : selected.status === 'rejected' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                <p className="text-xs font-semibold text-gray-700">
                  {selected.status === 'resolved' ? '✓ Resolved' : selected.status === 'rejected' ? '✗ Rejected' : '● Actioned'} by {selected.actioned_by_name ?? '—'} · {timeAgo(selected.actioned_at)}
                </p>
                {selected.action_note && <p className="text-xs text-gray-600 mt-1">{selected.action_note}</p>}
              </div>
            )}
          </div>

          {/* Reply + action bar */}
          {selected.status !== 'resolved' && selected.status !== 'rejected' && (
            <div className="border-t border-gray-100 px-6 py-4 space-y-3">
              {/* Reply box */}
              <div className="flex items-end gap-3">
                <textarea
                  rows={2}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
                <button onClick={sendReply} disabled={sendingReply || !replyText.trim()}
                  className="p-2.5 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors shrink-0">
                  {sendingReply ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <input value={actionNote} onChange={e => setActionNote(e.target.value)}
                  placeholder="Action note (optional)..."
                  className="flex-1 min-w-[150px] px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <button onClick={() => actionMessage('actioned')} disabled={actioning}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <CheckCircle2 size={12} /> Mark actioned
                </button>
                <button onClick={() => actionMessage('resolved')} disabled={actioning}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle2 size={12} /> Resolve
                </button>
                <button onClick={() => actionMessage('rejected')} disabled={actioning}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                  <X size={12} /> Reject
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Inbox size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Select a message to read</p>
          <p className="text-xs text-gray-400">Partner requests and messages appear here</p>
        </div>
      )}
    </div>
  )
}
