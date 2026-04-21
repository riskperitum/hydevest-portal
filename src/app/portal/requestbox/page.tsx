'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Inbox, Send, CheckCircle2, AlertCircle,
  Search, ArrowDownCircle, RefreshCw, Package,
  MessageSquare, Loader2, X, UserCheck,
  Users, Filter, PenSquare, AtSign
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { notifyRequestBoxMessage } from '@/lib/email/notify'

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
  assigned_to_user: string | null
  assigned_to_name: string | null
  assigned_at: string | null
  is_internal: boolean
  to_partner_id: string | null
  to_user_id: string | null
  to_name: string | null
  replies: ReplyRow[]
}

interface ReplyRow {
  id: string
  body: string
  from_partner: boolean
  is_internal: boolean
  sender_name: string
  sender_id: string | null
  created_at: string
}

interface Profile {
  id: string
  full_name: string | null
  email: string
}

interface Partner {
  id: string
  partner_id: string
  name: string
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  message:            { label: 'Message',            icon: <MessageSquare size={13} />,   color: 'bg-gray-100 text-gray-600' },
  payout_request:     { label: 'Payout request',     icon: <ArrowDownCircle size={13} />, color: 'bg-brand-50 text-brand-700' },
  container_interest: { label: 'Container interest', icon: <Package size={13} />,          color: 'bg-blue-50 text-blue-700' },
  withdrawal_request: { label: 'Withdrawal',         icon: <ArrowDownCircle size={13} />, color: 'bg-red-50 text-red-600' },
  reinvestment:       { label: 'Reinvestment',       icon: <RefreshCw size={13} />,        color: 'bg-green-50 text-green-700' },
  internal:           { label: 'Internal',           icon: <Users size={13} />,            color: 'bg-purple-50 text-purple-700' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  unread:   { label: 'Unread',   color: 'bg-brand-50 text-brand-700',  dot: 'bg-brand-500' },
  read:     { label: 'Read',     color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
  actioned: { label: 'Actioned', color: 'bg-blue-50 text-blue-700',    dot: 'bg-blue-500' },
  resolved: { label: 'Resolved', color: 'bg-green-50 text-green-700',  dot: 'bg-green-500' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-600',      dot: 'bg-red-500' },
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function timeAgo(date: string): string {
  const diff = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function RequestBoxPage() {
  const [messages, setMessages] = useState<RBMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<RBMessage | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [replyText, setReplyText] = useState('')
  const [replyInternal, setReplyInternal] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [actioning, setActioning] = useState(false)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [partners, setPartners] = useState<Partner[]>([])

  // Compose new message modal
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeType, setComposeType] = useState<'partner' | 'admin'>('partner')
  const [composeToPartner, setComposeToPartner] = useState('')
  const [composeToUser, setComposeToUser] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composing, setComposing] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: msgs } = await supabase
      .from('requestbox_messages')
      .select(`
        id, message_id, type, subject, body, status, priority,
        amount, percentage, created_at, actioned_at, action_note,
        assigned_to_user, assigned_at, is_internal,
        to_partner_id, to_user_id,
        partner:partners!requestbox_messages_from_partner_id_fkey(id, partner_id, name),
        actioned_profile:profiles!requestbox_messages_actioned_by_fkey(full_name, email),
        assigned_profile:profiles!requestbox_messages_assigned_to_user_fkey(full_name, email),
        to_partner:partners!requestbox_messages_to_partner_id_fkey(name),
        to_user:profiles!requestbox_messages_to_user_id_fkey(full_name, email)
      `)
      .order('created_at', { ascending: false })

    const msgIds = (msgs ?? []).map(m => m.id)
    const { data: replies } = msgIds.length > 0
      ? await supabase.from('requestbox_replies')
          .select(`
            id, message_id, body, created_at, is_internal,
            partner:partners!requestbox_replies_from_partner_id_fkey(name),
            profile:profiles!requestbox_replies_from_user_id_fkey(id, full_name, email)
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
        is_internal: r.is_internal ?? false,
        sender_name: (r.partner as any)?.name ?? (r.profile as any)?.full_name ?? (r.profile as any)?.email ?? 'Unknown',
        sender_id: (r.profile as any)?.id ?? null,
        created_at: r.created_at,
      })
      return acc
    }, {} as Record<string, ReplyRow[]>)

    setMessages((msgs ?? []).map(m => ({
      id: m.id,
      message_id: m.message_id,
      type: m.is_internal ? 'internal' : m.type,
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
      actioned_by_name: (m.actioned_profile as any)?.full_name ?? (m.actioned_profile as any)?.email ?? null,
      assigned_to_user: m.assigned_to_user,
      assigned_to_name: (m.assigned_profile as any)?.full_name ?? (m.assigned_profile as any)?.email ?? null,
      assigned_at: m.assigned_at,
      is_internal: m.is_internal ?? false,
      to_partner_id: m.to_partner_id,
      to_user_id: m.to_user_id,
      to_name: (m.to_partner as any)?.name ?? (m.to_user as any)?.full_name ?? (m.to_user as any)?.email ?? null,
      replies: repliesByMsg[m.id] ?? [],
    })))

    const [{ data: allProfiles }, { data: allPartners }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      supabase.from('partners').select('id, partner_id, name').eq('is_active', true),
    ])
    setProfiles(allProfiles ?? [])
    setPartners(allPartners ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single()
      setCurrentUser(data)
    })
  }, [load])

  async function openMessage(msg: RBMessage) {
    setSelected(msg)
    setReplyText('')
    setReplyInternal(false)
    setActionNote('')
    if (msg.status === 'unread') {
      const supabase = createClient()
      await supabase.from('requestbox_messages').update({ status: 'read' }).eq('id', msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' } : m))
    }
  }

  async function assignToSelf() {
    if (!selected || !currentUser) return
    const supabase = createClient()
    await supabase.from('requestbox_messages').update({
      assigned_to_user: currentUser.id,
      assigned_at: new Date().toISOString(),
      status: 'read',
    }).eq('id', selected.id)

    // Notify other admins that this is being handled
    const otherAdmins = profiles.filter(p => p.id !== currentUser.id)
    for (const admin of otherAdmins) {
      await supabase.from('notifications').insert({
        user_id: admin.id,
        type: 'task_assigned',
        title: `${currentUser.full_name ?? currentUser.email} is handling a request`,
        message: selected.subject,
        record_id: selected.id,
        module: 'requestbox',
      })
    }
    load()
  }

  async function sendReply() {
    if (!replyText.trim() || !selected || !currentUser) return
    setSendingReply(true)
    const supabase = createClient()

    await supabase.from('requestbox_replies').insert({
      message_id:      selected.id,
      body:            replyText.trim(),
      from_user_id:    currentUser.id,
      is_internal:     replyInternal,
    })

    // Mark message as unread for partner if not internal
    if (!replyInternal) {
      await supabase.from('requestbox_messages').update({ status: 'unread' }).eq('id', selected.id)
    }

    // Notify partner if reply is not internal and message is from a partner
    if (!replyInternal && selected.partner_db_id) {
      const { data: partnerUser } = await supabase
        .from('partners').select('user_id').eq('id', selected.partner_db_id).single()
      if (partnerUser?.user_id) {
        await supabase.from('notifications').insert({
          user_id:   partnerUser.user_id,
          type:      'note_mention',
          title:     `Reply from ${currentUser.full_name ?? currentUser.email}`,
          message:   replyText.trim().slice(0, 80),
          record_id: selected.id,
          module:    'requestbox',
        })
      }
    }

    // If internal — notify all other admins
    if (replyInternal) {
      const otherAdmins = profiles.filter(p => p.id !== currentUser.id)
      for (const admin of otherAdmins) {
        await supabase.from('notifications').insert({
          user_id:   admin.id,
          type:      'note_mention',
          title:     `Internal note — ${currentUser.full_name ?? currentUser.email}`,
          message:   `On: ${selected.subject} — ${replyText.trim().slice(0, 60)}`,
          record_id: selected.id,
          module:    'requestbox',
        })
      }
    }

    // Notify to_user if direct admin message
    if (selected.to_user_id && selected.to_user_id !== currentUser.id) {
      await supabase.from('notifications').insert({
        user_id:   selected.to_user_id,
        type:      'note_mention',
        title:     `Reply from ${currentUser.full_name ?? currentUser.email}`,
        message:   replyText.trim().slice(0, 80),
        record_id: selected.id,
        module:    'requestbox',
      })
    }

    setSendingReply(false)
    setReplyText('')
    load()
  }

  async function actionMessage(newStatus: 'actioned' | 'resolved' | 'rejected') {
    if (!selected || !currentUser) return
    setActioning(true)
    const supabase = createClient()
    await supabase.from('requestbox_messages').update({
      status:      newStatus,
      actioned_by: currentUser.id,
      actioned_at: new Date().toISOString(),
      action_note: actionNote || null,
    }).eq('id', selected.id)

    // Notify partner if message is from partner
    if (selected.partner_db_id) {
      const { data: partnerUser } = await supabase
        .from('partners').select('user_id').eq('id', selected.partner_db_id).single()
      if (partnerUser?.user_id) {
        await supabase.from('notifications').insert({
          user_id:   partnerUser.user_id,
          type:      newStatus === 'resolved' ? 'task_approved' : 'task_rejected',
          title:     `Your request has been ${newStatus}`,
          message:   actionNote || `Your request \"${selected.subject}\" has been ${newStatus}.`,
          record_id: selected.id,
          module:    'requestbox',
        })
      }
    }

    setActioning(false)
    setActionNote('')
    setSelected(prev => prev ? { ...prev, status: newStatus } : null)
    load()
  }

  async function sendCompose(e: React.FormEvent) {
    e.preventDefault()
    if (!composeSubject || !currentUser) return
    setComposing(true)
    const supabase = createClient()
    const isToPartner = composeType === 'partner' && composeToPartner
    const isToAdmin   = composeType === 'admin' && composeToUser
    const msgId = `RBM-${Date.now().toString().slice(-6)}`

    const { data: msg } = await supabase.from('requestbox_messages').insert({
      message_id:      msgId,
      type:            isToAdmin ? 'internal' : 'message',
      subject:         composeSubject,
      body:            composeBody || null,
      status:          'unread',
      priority:        'normal',
      is_internal:     !!isToAdmin,
      from_partner_id: null,
      to_partner_id:   isToPartner ? composeToPartner : null,
      to_user_id:      isToAdmin ? composeToUser : null,
      assigned_to_user: currentUser.id,
    }).select().single()

    let assignedToEmail: string | null = null
    let assignedToName: string | null = null

    // Notify recipient
    if (isToPartner) {
      const { data: partner } = await supabase
        .from('partners').select('user_id').eq('id', composeToPartner).single()
      if (partner?.user_id) {
        await supabase.from('notifications').insert({
          user_id:   partner.user_id,
          type:      'note_mention',
          title:     `Message from ${currentUser.full_name ?? currentUser.email}`,
          message:   composeSubject,
          record_id: msg?.id,
          module:    'requestbox',
        })
        const { data: assignedProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', partner.user_id)
          .single()
        if (assignedProfile?.email) {
          assignedToEmail = assignedProfile.email
          assignedToName = assignedProfile.full_name ?? assignedProfile.email.split('@')[0] ?? 'User'
        }
      }
    }

    if (isToAdmin) {
      await supabase.from('notifications').insert({
        user_id:   composeToUser,
        type:      'note_mention',
        title:     `Message from ${currentUser.full_name ?? currentUser.email}`,
        message:   composeSubject,
        record_id: msg?.id,
        module:    'requestbox',
      })
      const { data: assignedProfile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', composeToUser)
        .single()
      if (assignedProfile?.email) {
        assignedToEmail = assignedProfile.email
        assignedToName = assignedProfile.full_name ?? assignedProfile.email.split('@')[0] ?? 'User'
      }
    }

    // Send email notification to assigned user
    if (assignedToEmail && assignedToName) {
      await notifyRequestBoxMessage({
        recipientEmail: assignedToEmail,
        recipientName: assignedToName,
        subject: composeSubject,
        senderName: currentUser.full_name ?? currentUser.email ?? 'Someone',
        messagePreview:
          composeBody.slice(0, 150) + (composeBody.length > 150 ? '...' : ''),
        messageUrl: `${window.location.origin}/portal/requestbox`,
      })
    }

    setComposing(false)
    setComposeOpen(false)
    setComposeSubject('')
    setComposeBody('')
    setComposeToPartner('')
    setComposeToUser('')
    load()
  }

  const filtered = messages.filter(m => {
    const matchSearch = search === '' ||
      m.subject.toLowerCase().includes(search.toLowerCase()) ||
      (m.partner_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (m.body ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === '' || m.status === statusFilter
    const matchType =
      typeFilter === 'all'      ? true :
      typeFilter === 'partner'  ? !!m.partner_db_id || !!m.to_partner_id :
      typeFilter === 'internal' ? m.is_internal :
      typeFilter === 'mine'     ? m.assigned_to_user === currentUser?.id :
      true
    return matchSearch && matchStatus && matchType
  })

  const unreadCount = messages.filter(m => m.status === 'unread').length

  return (
    <div className="flex h-[calc(100vh-120px)] max-w-7xl bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

      {/* LEFT PANEL */}
      <div className="w-80 shrink-0 border-r border-gray-100 flex flex-col">

        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox size={15} className="text-brand-600" />
              <h1 className="text-sm font-semibold text-gray-900">Request Box</h1>
              {unreadCount > 0 && (
                <span className="bg-brand-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            <button onClick={() => setComposeOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              <PenSquare size={12} /> Compose
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search messages..."
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { key: 'all',      label: 'All' },
              { key: 'partner',  label: 'Partners' },
              { key: 'internal', label: 'Internal' },
              { key: 'mine',     label: 'Assigned to me' },
            ].map(f => (
              <button key={f.key} onClick={() => setTypeFilter(f.key)}
                className={`px-2 py-0.5 text-xs rounded-full font-medium transition-colors
                  ${typeFilter === f.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {f.label}
              </button>
            ))}
          </div>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">All statuses</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="actioned">Actioned</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
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
              <Inbox size={24} className="text-gray-200" />
              <p className="text-xs text-gray-400 text-center">No messages</p>
            </div>
          ) : filtered.map(msg => {
            const typeCfg   = TYPE_CONFIG[msg.type] ?? TYPE_CONFIG.message
            const statusCfg = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.read
            const isSelected = selected?.id === msg.id
            return (
              <button key={msg.id} onClick={() => openMessage(msg)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                  ${isSelected ? 'bg-brand-50/50 border-l-2 border-brand-500' : ''}
                  ${msg.status === 'unread' ? 'bg-white' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {msg.status === 'unread' && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                    <span className={`text-xs font-medium truncate ${msg.status === 'unread' ? 'text-gray-900' : 'text-gray-600'}`}>
                      {msg.partner_name ?? msg.to_name ?? 'Internal'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(msg.created_at)}</span>
                </div>
                <p className={`text-xs truncate mb-1.5 ${msg.status === 'unread' ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                  {msg.subject}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${typeCfg.color}`}>
                    {typeCfg.icon} {typeCfg.label}
                  </span>
                  {msg.assigned_to_name && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                      → {msg.assigned_to_name.split(' ')[0]}
                    </span>
                  )}
                  {msg.amount && (
                    <span className="text-xs text-brand-600 font-medium">{fmt(msg.amount)}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT PANEL */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Message header */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
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
                  {selected.assigned_to_name && (
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      <UserCheck size={11} /> {selected.assigned_to_name}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-semibold text-gray-900">{selected.subject}</h2>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                  {selected.partner_name && <span className="font-medium text-gray-600">{selected.partner_name}</span>}
                  {selected.partner_id && <span className="font-mono">{selected.partner_id}</span>}
                  {selected.to_name && !selected.partner_name && (
                    <span className="font-medium text-gray-600">To: {selected.to_name}</span>
                  )}
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
              <div className="flex items-center gap-2 shrink-0">
                {selected.status !== 'resolved' && selected.status !== 'rejected' && (
                  <button onClick={assignToSelf}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
                      ${selected.assigned_to_user === currentUser?.id
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'}`}>
                    <UserCheck size={13} />
                    {selected.assigned_to_user === currentUser?.id ? 'Assigned to you' : 'Assign to me'}
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Thread */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {selected.body && (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selected.body}</p>
              </div>
            )}

            {selected.replies.map(reply => {
              const isMe = reply.sender_id === currentUser?.id
              const isPartnerReply = reply.from_partner
              return (
                <div key={reply.id} className={`flex items-start gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                    ${isPartnerReply ? 'bg-brand-100' : reply.is_internal ? 'bg-purple-100' : 'bg-gray-200'}`}>
                    <span className={`text-xs font-bold
                      ${isPartnerReply ? 'text-brand-700' : reply.is_internal ? 'text-purple-700' : 'text-gray-600'}`}>
                      {reply.sender_name[0].toUpperCase()}
                    </span>
                  </div>
                  <div className={`flex-1 max-w-[75%] ${isMe ? 'items-end flex flex-col' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        {isMe ? 'You' : reply.sender_name}
                      </span>
                      {reply.is_internal && (
                        <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">Internal note</span>
                      )}
                      <span className="text-xs text-gray-400">{timeAgo(reply.created_at)}</span>
                    </div>
                    <div className={`px-4 py-3 rounded-xl text-sm leading-relaxed
                      ${isMe
                        ? 'bg-brand-600 text-white'
                        : reply.is_internal
                          ? 'bg-purple-50 border border-purple-100 text-purple-900'
                          : 'bg-white border border-gray-100 text-gray-700'}`}>
                      {reply.body}
                    </div>
                  </div>
                </div>
              )
            })}

            {selected.actioned_at && (
              <div className={`p-3 rounded-xl border ${
                selected.status === 'resolved' ? 'bg-green-50 border-green-200' :
                selected.status === 'rejected' ? 'bg-red-50 border-red-200' :
                'bg-blue-50 border-blue-200'}`}>
                <p className="text-xs font-semibold text-gray-700">
                  {selected.status === 'resolved' ? '✓ Resolved' :
                   selected.status === 'rejected' ? '✗ Rejected' : '● Actioned'} by {selected.actioned_by_name ?? '—'} · {timeAgo(selected.actioned_at)}
                </p>
                {selected.action_note && <p className="text-xs text-gray-600 mt-1">{selected.action_note}</p>}
              </div>
            )}
          </div>

          {selected.status !== 'resolved' && selected.status !== 'rejected' && (
            <div className="border-t border-gray-100 px-6 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setReplyInternal(false)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors
                    ${!replyInternal ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  Reply to {selected.partner_name ? 'partner' : 'thread'}
                </button>
                <button type="button" onClick={() => setReplyInternal(true)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors
                    ${replyInternal ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  Internal note
                </button>
                {replyInternal && (
                  <span className="text-xs text-purple-600 font-medium">Only visible to Hydevest team</span>
                )}
              </div>

              <div className="flex items-end gap-3">
                <textarea rows={3} value={replyText} onChange={e => setReplyText(e.target.value)}
                  placeholder={replyInternal ? 'Add an internal note (only team can see this)...' : 'Write a reply...'}
                  className={`flex-1 px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 resize-none
                    ${replyInternal ? 'border-purple-200 focus:ring-purple-400 bg-purple-50/30' : 'border-gray-200 focus:ring-brand-500'}`} />
                <button onClick={sendReply} disabled={sendingReply || !replyText.trim()}
                  className={`p-3 rounded-xl disabled:opacity-50 transition-colors shrink-0
                    ${replyInternal ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}>
                  {sendingReply ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
                <input value={actionNote} onChange={e => setActionNote(e.target.value)}
                  placeholder="Action note (optional)..."
                  className="flex-1 min-w-[140px] px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
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
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Inbox size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Select a message to read</p>
          <p className="text-xs text-gray-400">Or compose a new message</p>
          <button onClick={() => setComposeOpen(true)}
            className="mt-1 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-xl hover:bg-brand-700">
            <PenSquare size={14} /> Compose
          </button>
        </div>
      )}

      {/* COMPOSE MODAL */}
      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="New message" size="sm">
        <form onSubmit={sendCompose} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Send to</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'partner', label: 'Partner',       icon: <Package size={14} /> },
                { key: 'admin',   label: 'Team member',   icon: <Users size={14} /> },
              ].map(opt => (
                <button key={opt.key} type="button"
                  onClick={() => setComposeType(opt.key as 'partner' | 'admin')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all
                    ${composeType === opt.key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {composeType === 'partner' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Partner <span className="text-red-400">*</span>
              </label>
              <select required value={composeToPartner} onChange={e => setComposeToPartner(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Select partner...</option>
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.partner_id})</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Team member <span className="text-red-400">*</span>
              </label>
              <select required value={composeToUser} onChange={e => setComposeToUser(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Select team member...</option>
                {profiles.filter(p => p.id !== currentUser?.id).map(p => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Subject <span className="text-red-400">*</span>
            </label>
            <input required value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
              placeholder="What is this about?"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
            <textarea rows={4} value={composeBody} onChange={e => setComposeBody(e.target.value)}
              placeholder="Write your message..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setComposeOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={composing || !composeSubject || (composeType === 'partner' ? !composeToPartner : !composeToUser)}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {composing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

