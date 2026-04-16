'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Inbox, Send, Loader2, X, MessageSquare,
  ArrowDownCircle, Package, CheckCircle2
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import AmountInput from '@/components/ui/AmountInput'

interface MyMessage {
  id: string
  message_id: string
  type: string
  subject: string
  body: string | null
  status: string
  amount: number | null
  percentage: number | null
  created_at: string
  replies: {
    id: string
    body: string
    from_partner: boolean
    sender_name: string
    created_at: string
  }[]
  has_unread_reply: boolean
}

interface StaffProfile {
  id: string
  full_name: string | null
  email: string
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TYPE_LABEL: Record<string, string> = {
  message:            'Message',
  payout_request:     'Payout request',
  container_interest: 'Container interest',
  withdrawal_request: 'Withdrawal',
  reinvestment:       'Reinvestment',
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  unread:   { label: 'Unread',   color: 'bg-brand-50 text-brand-700' },
  read:     { label: 'Read',     color: 'bg-gray-100 text-gray-600' },
  actioned: { label: 'Actioned', color: 'bg-blue-50 text-blue-700' },
  resolved: { label: 'Resolved', color: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-600' },
}

function timeAgo(date: string): string {
  const diff = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function PartnerRequestBoxPage() {
  const [partner, setPartner] = useState<{ id: string; name: string; wallet_balance: number } | null>(null)
  const [messages, setMessages] = useState<MyMessage[]>([])
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MyMessage | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [taggedStaff, setTaggedStaff] = useState<string[]>([])
  // Reserved for expandable tag picker
  const [, setShowTagPicker] = useState(false)

  // New message modal
  const [newMsgOpen, setNewMsgOpen] = useState(false)
  const [newMsgType, setNewMsgType] = useState<'message' | 'payout_request' | 'container_interest'>('message')
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPercentage, setNewPercentage] = useState<50 | 100>(50)
  const [savingNew, setSavingNew] = useState(false)
  const [newSuccess, setNewSuccess] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: partnerData } = await supabase
      .from('partners')
      .select('id, name, wallet_balance')
      .eq('user_id', user.id)
      .single()

    if (!partnerData) { setLoading(false); return }
    setPartner({ ...partnerData, wallet_balance: Number(partnerData.wallet_balance ?? 0) })

    // Load staff profiles for tagging (exclude partner roles)
    const { data: staffData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
    setStaffProfiles(staffData ?? [])

    const { data: msgData } = await supabase
      .from('requestbox_messages')
      .select('id, message_id, type, subject, body, status, amount, percentage, created_at, partner_last_read_at')
      .eq('from_partner_id', partnerData.id)
      .order('created_at', { ascending: false })

    const msgIds = (msgData ?? []).map(m => m.id)
    const { data: replies } = msgIds.length > 0
      ? await supabase.from('requestbox_replies')
          .select(`id, message_id, body, created_at,
            partner:partners!requestbox_replies_from_partner_id_fkey(name),
            profile:profiles!requestbox_replies_from_user_id_fkey(full_name, email)`)
          .in('message_id', msgIds)
          .order('created_at', { ascending: true })
      : { data: [] }

    type ReplyRow = {
      id: string
      message_id: string
      body: string
      created_at: string
      partner: { name?: string } | { name?: string }[] | null
      profile: { full_name?: string | null; email?: string | null } | { full_name?: string | null; email?: string | null }[] | null
    }

    function one<T>(x: T | T[] | null | undefined): T | undefined {
      if (x == null) return undefined
      return Array.isArray(x) ? x[0] : x
    }

    const repliesByMsg = ((replies ?? []) as ReplyRow[]).reduce(
      (acc, r) => {
        const partner = one(r.partner)
        const profile = one(r.profile)
        if (!acc[r.message_id]) acc[r.message_id] = []
        acc[r.message_id].push({
          id: r.id,
          body: r.body,
          from_partner: !!partner?.name,
          sender_name: partner?.name ?? profile?.full_name ?? 'Support',
          created_at: r.created_at,
        })
        return acc
      },
      {} as Record<string, MyMessage['replies']>
    )

    setMessages((msgData ?? []).map(m => {
      const msgReplies = repliesByMsg[m.id] ?? []
      const lastReadAt = m.partner_last_read_at ? new Date(m.partner_last_read_at).getTime() : 0
      const hasUnread  = msgReplies.some(r => !r.from_partner && new Date(r.created_at).getTime() > lastReadAt)
      return {
        id: m.id,
        message_id: m.message_id,
        type: m.type,
        subject: m.subject,
        body: m.body,
        status: m.status,
        amount: m.amount ? Number(m.amount) : null,
        percentage: m.percentage ? Number(m.percentage) : null,
        created_at: m.created_at,
        replies: msgReplies,
        has_unread_reply: hasUnread,
      }
    }))

    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  async function openMessage(msg: MyMessage) {
    setSelected(msg)
    setReplyText('')
    setTaggedStaff([])
    setShowTagPicker(false)
    if (msg.has_unread_reply) {
      const supabase = createClient()
      await supabase.from('requestbox_messages')
        .update({ partner_last_read_at: new Date().toISOString() })
        .eq('id', msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, has_unread_reply: false } : m))
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selected || !partner) return
    setSendingReply(true)
    const supabase = createClient()

    // Build reply body — append @mentions if any
    const mentionText = taggedStaff.length > 0
      ? `\n\n[Attention: ${taggedStaff.map(id => staffProfiles.find(p => p.id === id)?.full_name ?? id).join(', ')}]`
      : ''

    await supabase.from('requestbox_replies').insert({
      message_id:      selected.id,
      body:            replyText.trim() + mentionText,
      from_partner_id: partner.id,
    })

    // Notify tagged staff
    for (const staffId of taggedStaff) {
      await supabase.from('notifications').insert({
        user_id:  staffId,
        type:     'note_mention',
        title:    `${partner.name} tagged you in a message`,
        message:  replyText.trim().slice(0, 80),
        record_id: selected.id,
        module:   'requestbox',
      })
    }

    // Mark message as unread for admin
    await supabase.from('requestbox_messages')
      .update({ status: 'unread' })
      .eq('id', selected.id)

    setSendingReply(false)
    setReplyText('')
    setTaggedStaff([])
    load()
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault()
    if (!partner) return
    setSavingNew(true)
    const supabase = createClient()

    let subject = newSubject
    let body    = newBody

    if (newMsgType === 'payout_request') {
      subject = `Payout request — ${partner.name}`
      body    = newBody || `${partner.name} is requesting a payout of ${fmt(parseFloat(newAmount))}.`
    } else if (newMsgType === 'container_interest') {
      subject = `Container interest — ${newPercentage}% — ${partner.name}`
      body    = newBody || `${partner.name} is indicating interest in purchasing ${newPercentage}% of a container.`
    }

    await supabase.from('requestbox_messages').insert({
      message_id:      `RBM-${Date.now().toString().slice(-6)}`,
      type:            newMsgType,
      subject,
      body:            body || null,
      status:          'unread',
      priority:        newMsgType === 'payout_request' ? 'high' : 'normal',
      from_partner_id: partner.id,
      amount:          newAmount ? parseFloat(newAmount) : null,
      percentage:      newMsgType === 'container_interest' ? newPercentage : null,
    })

    setSavingNew(false)
    setNewMsgOpen(false)
    setNewSubject('')
    setNewBody('')
    setNewAmount('')
    setNewSuccess(true)
    setTimeout(() => setNewSuccess(false), 4000)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )

  if (!partner) return (
    <div className="text-center py-16 text-gray-400">No partner account found.</div>
  )

  const unreadCount = messages.filter(m => m.has_unread_reply).length

  return (
    <div className="flex h-[calc(100vh-120px)] max-w-5xl bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Left panel */}
      <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Inbox size={15} className="text-brand-600" />
              <h1 className="text-sm font-semibold text-gray-900">Messages</h1>
              {unreadCount > 0 && (
                <span className="bg-brand-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            <button onClick={() => { setNewMsgOpen(true); setNewSuccess(false) }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <MessageSquare size={12} /> New
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-8">
              <Inbox size={24} className="text-gray-200" />
              <p className="text-xs text-gray-400 text-center">No messages yet</p>
              <button onClick={() => setNewMsgOpen(true)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700">Send your first message</button>
            </div>
          ) : messages.map(msg => {
            const isSelected = selected?.id === msg.id
            return (
              <button key={msg.id} onClick={() => openMessage(msg)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                  ${isSelected ? 'bg-brand-50/50 border-l-2 border-brand-500' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    {msg.has_unread_reply && <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-0.5" />}
                    <span className={`text-xs font-medium ${msg.has_unread_reply ? 'text-gray-900' : 'text-gray-600'}`}>
                      {TYPE_LABEL[msg.type] ?? msg.type}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(msg.created_at)}</span>
                </div>
                <p className={`text-xs truncate mb-1 ${msg.has_unread_reply ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                  {msg.subject}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${(STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.read).color}`}>
                    {(STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.read).label}
                  </span>
                  {msg.amount && <span className="text-xs font-semibold text-brand-600">{fmt(msg.amount)}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right panel */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                  {TYPE_LABEL[selected.type] ?? selected.type}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${(STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.read).color}`}>
                  {(STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.read).label}
                </span>
              </div>
              <h2 className="text-base font-semibold text-gray-900">{selected.subject}</h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                <span>{timeAgo(selected.created_at)}</span>
                {selected.amount && (
                  <><span>·</span><span className="font-semibold text-brand-600">{fmt(selected.amount)}</span></>
                )}
                {selected.percentage && (
                  <><span>·</span><span className="font-medium text-blue-600">{selected.percentage}%</span></>
                )}
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0">
              <X size={15} />
            </button>
          </div>

          {/* Thread */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {selected.body && (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {selected.body}
              </div>
            )}
            {selected.replies.map(reply => (
              <div key={reply.id} className={`flex items-start gap-3 ${reply.from_partner ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${reply.from_partner ? 'bg-brand-100' : 'bg-gray-200'}`}>
                  <span className={`text-xs font-bold ${reply.from_partner ? 'text-brand-700' : 'text-gray-600'}`}>
                    {reply.sender_name[0].toUpperCase()}
                  </span>
                </div>
                <div className={`flex-1 max-w-[80%] ${reply.from_partner ? 'items-end flex flex-col' : ''}`}>
                  <p className="text-xs text-gray-400 mb-1">
                    {reply.from_partner ? 'You' : reply.sender_name} · {timeAgo(reply.created_at)}
                  </p>
                  <div className={`px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap
                    ${reply.from_partner ? 'bg-brand-600 text-white' : 'bg-white border border-gray-100 text-gray-700'}`}>
                    {reply.body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Reply area */}
          {selected.status !== 'resolved' && selected.status !== 'rejected' && (
            <div className="border-t border-gray-100 px-6 py-4 space-y-2">

              {/* Tag staff row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">Tag Hydevest team:</span>
                {staffProfiles.slice(0, 8).map(s => (
                  <button key={s.id} type="button"
                    onClick={() => setTaggedStaff(prev =>
                      prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                    )}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors
                      ${taggedStaff.includes(s.id)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600'}`}>
                    {s.full_name ?? s.email}
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-3">
                <textarea rows={3} value={replyText} onChange={e => setReplyText(e.target.value)}
                  placeholder="Write your reply... You can tag Hydevest team members above."
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
                <button onClick={sendReply} disabled={sendingReply || !replyText.trim()}
                  className="p-3 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors shrink-0">
                  {sendingReply ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
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
          <p className="text-xs text-gray-400">Or start a new message to Hydevest</p>
          <button onClick={() => setNewMsgOpen(true)}
            className="mt-1 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-xl hover:bg-brand-700">
            <MessageSquare size={14} /> New message
          </button>
        </div>
      )}

      {/* New message modal */}
      <Modal open={newMsgOpen} onClose={() => setNewMsgOpen(false)}
        title="New message" size="sm">
        {newSuccess ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-green-600" />
            </div>
            <p className="text-base font-semibold text-gray-900">Sent!</p>
            <p className="text-sm text-gray-400 text-center">Your message has been sent to the Hydevest team.</p>
            <button onClick={() => { setNewMsgOpen(false); setNewSuccess(false) }}
              className="px-6 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submitNew} className="space-y-4">

            {/* Message type selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'message',            label: 'Message',   icon: <MessageSquare size={14} /> },
                  { value: 'payout_request',     label: 'Payout',    icon: <ArrowDownCircle size={14} /> },
                  { value: 'container_interest', label: 'Container', icon: <Package size={14} /> },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setNewMsgType(opt.value as typeof newMsgType)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all
                      ${newMsgType === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                    {opt.icon}
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Payout amount */}
            {newMsgType === 'payout_request' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Amount (NGN) <span className="text-red-400">*</span>
                </label>
                <AmountInput required value={newAmount} onChange={setNewAmount} placeholder="0.00"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-xs text-gray-400 mt-1">
                  Available wallet: {fmt(partner?.wallet_balance ?? 0)}
                </p>
              </div>
            )}

            {/* Container interest percentage */}
            {newMsgType === 'container_interest' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stake percentage</label>
                <div className="grid grid-cols-2 gap-2">
                  {([50, 100] as const).map(pct => (
                    <button key={pct} type="button"
                      onClick={() => setNewPercentage(pct)}
                      className={`py-2.5 rounded-xl border-2 font-semibold transition-all
                        ${newPercentage === pct ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-100 text-gray-600 hover:border-gray-200'}`}>
                      {pct}%
                      <p className="text-xs font-normal text-gray-400 mt-0.5">{pct === 50 ? 'Half container' : 'Full container'}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Subject for general message */}
            {newMsgType === 'message' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Subject <span className="text-red-400">*</span>
                </label>
                <input required value={newSubject} onChange={e => setNewSubject(e.target.value)}
                  placeholder="What is this about?"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            )}

            {/* Body */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Message {newMsgType === 'message' ? <span className="text-red-400">*</span> : <span className="text-gray-400 font-normal">(optional)</span>}
              </label>
              <textarea rows={3} value={newBody} onChange={e => setNewBody(e.target.value)}
                placeholder={
                  newMsgType === 'payout_request'     ? 'Any instructions for the payout...' :
                  newMsgType === 'container_interest'  ? 'Any preferences or questions...' :
                  'Write your message to the Hydevest team...'
                }
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setNewMsgOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={savingNew || (newMsgType === 'message' && !newSubject) || (newMsgType === 'payout_request' && !newAmount)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingNew ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
