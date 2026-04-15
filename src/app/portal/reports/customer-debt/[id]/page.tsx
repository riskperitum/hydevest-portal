'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, TrendingUp, Wallet,
  AlertTriangle, CheckCircle2, Clock,
  Plus, Trash2, MessageSquare, CornerDownRight, AtSign, Send
} from 'lucide-react'
import Link from 'next/link'

interface Customer {
  id: string
  customer_id: string
  name: string
  phone: string | null
  address: string | null
}

interface SalesOrderRow {
  id: string
  order_id: string
  sale_type: string
  container_tracking: string | null
  container_id: string
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  payment_status: string
  payment_method: string
  created_at: string
}

interface RecoveryRow {
  id: string
  recovery_id: string
  order_id: string
  payment_type: string
  amount_paid: number
  payment_date: string
  payment_method: string
  comments: string | null
}

interface NoteRow {
  id: string
  note: string
  parent_id: string | null
  mentions: { id: string; name: string }[]
  created_at: string
  creator: { id: string; full_name: string | null; email: string } | null
  replies?: NoteRow[]
}

interface Profile {
  id: string
  full_name: string | null
  email: string
}

const PAYMENT_STATUS = {
  paid:        { label: 'Fully paid',   color: 'bg-green-50 text-green-700' },
  partial:     { label: 'Partial',      color: 'bg-amber-50 text-amber-700' },
  outstanding: { label: 'Outstanding',  color: 'bg-red-50 text-red-600' },
}

function timeAgo(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return '1 month ago'
  return `${Math.floor(diffDays / 30)} months ago`
}

function renderNoteText(note: string, mentions: { id: string; name: string }[]) {
  if (!mentions?.length) return <span>{note}</span>
  const parts = note.split(/(@\w+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const handle = part.slice(1).toLowerCase()
          const mentioned = mentions.find(m =>
            (m.name ?? '').toLowerCase().replace(/\s+/g, '') === handle ||
            (m.name ?? '').toLowerCase().split(' ')[0] === handle
          )
          if (mentioned) {
            return (
              <span key={i} className="bg-brand-100 text-brand-700 font-semibold px-1 rounded">
                {part}
              </span>
            )
          }
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function CustomerDebtDrilldownPageInner() {
  const params = useParams()
  const customerId = params.id as string
  const searchParams = useSearchParams()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<SalesOrderRow[]>([])
  const [recoveries, setRecoveries] = useState<RecoveryRow[]>([])
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'orders' | 'recoveries' | 'notes'>(
    (searchParams.get('tab') as 'orders' | 'recoveries' | 'notes') ?? 'orders'
  )
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)

  // Note composer state
  const [newNote, setNewNote] = useState('')
  const [replyingTo, setReplyingTo] = useState<NoteRow | null>(null)
  const [replyText, setReplyText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savingReply, setSavingReply] = useState(false)

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionTarget, setMentionTarget] = useState<'note' | 'reply'>('note')
  const [cursorPosition, setCursorPosition] = useState(0)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: cust }, { data: salesOrders }, { data: noteData }, { data: allProfiles }] = await Promise.all([
      supabase.from('customers').select('id, customer_id, name, phone, address').eq('id', customerId).single(),
      supabase.from('sales_orders')
        .select(`id, order_id, sale_type, customer_payable, amount_paid,
          outstanding_balance, payment_status, payment_method, created_at,
          container:containers(container_id, tracking_number)`)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
      supabase.from('customer_debt_notes')
        .select('*, creator:profiles!customer_debt_notes_created_by_fkey(id, full_name, email)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
    ])

    setCustomer(cust)
    setProfiles(allProfiles ?? [])

    // Build threaded notes
    const allNotes: NoteRow[] = (noteData ?? []).map(n => ({
      ...n,
      mentions: n.mentions ?? [],
      replies: [],
    }))
    const topLevel = allNotes.filter(n => !n.parent_id)
    const replies = allNotes.filter(n => n.parent_id)
    replies.forEach(reply => {
      const parent = topLevel.find(n => n.id === reply.parent_id)
      if (parent) parent.replies!.push(reply)
    })
    setNotes(topLevel)

    const orderIds = (salesOrders ?? []).map(o => o.id)
    const { data: recs } = orderIds.length > 0
      ? await supabase.from('recoveries')
          .select('id, recovery_id, sales_order_id, payment_type, amount_paid, payment_date, payment_method, comments')
          .in('sales_order_id', orderIds)
          .order('payment_date', { ascending: false })
      : { data: [] }

    const orderIdMap = Object.fromEntries((salesOrders ?? []).map(o => [o.id, o.order_id]))

    setOrders((salesOrders ?? []).map(o => ({
      id: o.id,
      order_id: o.order_id,
      sale_type: o.sale_type,
      container_tracking: (o.container as any)?.tracking_number ?? null,
      container_id: (o.container as any)?.container_id ?? '—',
      customer_payable: Number(o.customer_payable),
      amount_paid: Number(o.amount_paid),
      outstanding_balance: Number(o.outstanding_balance),
      payment_status: o.payment_status,
      payment_method: o.payment_method,
      created_at: o.created_at,
    })))

    setRecoveries((recs ?? []).map(r => ({
      id: r.id,
      recovery_id: r.recovery_id,
      order_id: orderIdMap[r.sales_order_id] ?? '—',
      payment_type: r.payment_type,
      amount_paid: Number(r.amount_paid),
      payment_date: r.payment_date,
      payment_method: r.payment_method,
      comments: r.comments,
    })))

    setLoading(false)
  }, [customerId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single()
      setCurrentUser(profile)
    })
  }, [load])

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Extract @mentions from text
  function extractMentions(text: string): { id: string; name: string }[] {
    const mentioned: { id: string; name: string }[] = []
    const words = text.split(/\s+/)
    for (const word of words) {
      if (word.startsWith('@')) {
        const handle = word.slice(1).toLowerCase()
        const profile = profiles.find(p =>
          (p.full_name ?? '').toLowerCase().replace(/\s+/g, '') === handle ||
          (p.full_name ?? '').toLowerCase().split(' ')[0] === handle
        )
        if (profile && !mentioned.find(m => m.id === profile.id)) {
          mentioned.push({ id: profile.id, name: profile.full_name ?? profile.email })
        }
      }
    }
    return mentioned
  }

  // Handle @ trigger in textarea
  function handleTextChange(
    text: string,
    setText: (v: string) => void,
    target: 'note' | 'reply',
    pos: number
  ) {
    setText(text)
    setCursorPosition(pos)

    // Detect @ trigger
    const textUpToCursor = text.slice(0, pos)
    const atMatch = textUpToCursor.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase())
      setMentionOpen(true)
      setMentionTarget(target)
    } else {
      setMentionOpen(false)
      setMentionQuery('')
    }
  }

  // Insert mention into text
  function insertMention(profile: Profile, target: 'note' | 'reply') {
    const handle = `@${(profile.full_name ?? profile.email).split(' ')[0]}`
    const setText = target === 'note' ? setNewNote : setReplyText
    const text = target === 'note' ? newNote : replyText
    const textUpToCursor = text.slice(0, cursorPosition)
    const atIndex = textUpToCursor.lastIndexOf('@')
    const newText = text.slice(0, atIndex) + handle + ' ' + text.slice(cursorPosition)
    setText(newText)
    setMentionOpen(false)
    setMentionQuery('')
    const ref = target === 'note' ? noteInputRef : replyInputRef
    setTimeout(() => ref.current?.focus(), 0)
  }

  // Send notifications to mentioned users
  async function notifyMentions(
    mentions: { id: string; name: string }[],
    noteId: string,
    noteText: string
  ) {
    if (!mentions.length || !currentUser) return
    const supabase = createClient()
    for (const mention of mentions) {
      if (mention.id === currentUser.id) continue
      await supabase.from('notifications').insert({
        user_id: mention.id,
        type: 'note_mention',
        title: `${currentUser.full_name ?? currentUser.email} mentioned you`,
        message: `In a note about ${customer?.name}: "${noteText.slice(0, 60)}${noteText.length > 60 ? '…' : ''}"`,
        note_id: noteId,
        record_id: customerId,
        record_ref: customer?.customer_id ?? '',
        module: 'customer_debt',
      })
    }
  }

  async function saveNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim()) return
    setSavingNote(true)
    const supabase = createClient()
    const mentions = extractMentions(newNote)
    const { data: note } = await supabase.from('customer_debt_notes').insert({
      customer_id: customerId,
      note: newNote.trim(),
      mentions,
      created_by: currentUser?.id,
    }).select().single()
    if (note) await notifyMentions(mentions, note.id, newNote)
    setNewNote('')
    setSavingNote(false)
    load()
  }

  async function saveReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim() || !replyingTo) return
    setSavingReply(true)
    const supabase = createClient()
    const mentions = extractMentions(replyText)
    const { data: note } = await supabase.from('customer_debt_notes').insert({
      customer_id: customerId,
      note: replyText.trim(),
      parent_id: replyingTo.id,
      mentions,
      created_by: currentUser?.id,
    }).select().single()
    if (note) await notifyMentions(mentions, note.id, replyText)
    setReplyText('')
    setReplyingTo(null)
    setSavingReply(false)
    load()
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note and all its replies?')) return
    const supabase = createClient()
    await supabase.from('customer_debt_notes').delete().eq('id', id)
    load()
  }

  const filteredMentions = profiles.filter(p =>
    p.id !== currentUser?.id &&
    (
      (p.full_name ?? '').toLowerCase().includes(mentionQuery) ||
      p.email.toLowerCase().includes(mentionQuery)
    )
  ).slice(0, 5)

  const totalPayable = orders.reduce((s, o) => s + o.customer_payable, 0)
  const totalRecovered = recoveries.reduce((s, r) => s + r.amount_paid, 0)
  const totalOutstanding = Math.max(totalPayable - totalRecovered, 0)
  const progressPct = totalPayable > 0 ? Math.min((totalRecovered / totalPayable) * 100, 100) : 0

  const lastPayment = recoveries.length > 0
    ? [...recoveries].sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())[0]
    : null

  const NoteComposer = ({
    value, onChange, onSubmit, saving, placeholder, submitLabel, ref: inputRef
  }: {
    value: string
    onChange: (text: string, pos: number) => void
    onSubmit: (e: React.FormEvent) => void
    saving: boolean
    placeholder: string
    submitLabel: string
    ref?: React.RefObject<HTMLTextAreaElement>
  }) => (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="relative">
        <textarea
          ref={inputRef}
          rows={3}
          value={value}
          onChange={e => onChange(e.target.value, e.target.selectionStart ?? 0)}
          onKeyUp={e => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none pr-10"
        />
        <div className="absolute bottom-2.5 right-3 text-gray-300">
          <AtSign size={14} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Use @ to mention a team member</p>
        <button type="submit" disabled={saving || !value.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {submitLabel}
        </button>
      </div>
    </form>
  )

  const NoteCard = ({ note, isReply = false }: { note: NoteRow; isReply?: boolean }) => (
    <div className={`${isReply ? 'ml-8 mt-2' : ''}`}>
      <div className={`flex items-start gap-3 p-4 rounded-xl border group
        ${isReply ? 'bg-gray-50/50 border-gray-100' : 'bg-white border-gray-100 shadow-sm'}`}>
        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-brand-700 text-xs font-semibold">
            {(note.creator?.full_name ?? note.creator?.email ?? 'U')[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-gray-800">
              {note.creator?.full_name ?? note.creator?.email ?? 'Unknown'}
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">
              {new Date(note.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}{timeAgo(note.created_at)}
            </span>
            {note.mentions?.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {note.mentions.map(m => (
                  <span key={m.id} className="text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">
                    @{m.name.split(' ')[0]}
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            {renderNoteText(note.note, note.mentions ?? [])}
          </p>
          <div className="flex items-center gap-3 mt-2">
            {!isReply && (
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(replyingTo?.id === note.id ? null : note)
                  setReplyText('')
                }}
                className="text-xs text-gray-400 hover:text-brand-600 font-medium flex items-center gap-1 transition-colors">
                <CornerDownRight size={12} />
                {note.replies?.length ? `${note.replies.length} repl${note.replies.length === 1 ? 'y' : 'ies'}` : 'Reply'}
              </button>
            )}
          </div>
        </div>
        {(note.creator?.id === currentUser?.id) && (
          <button onClick={() => deleteNote(note.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Replies */}
      {note.replies && note.replies.length > 0 && (
        <div className="ml-8 mt-1 space-y-1 border-l-2 border-gray-100 pl-3">
          {note.replies.map(reply => (
            <NoteCard key={reply.id} note={reply} isReply />
          ))}
        </div>
      )}

      {/* Reply composer */}
      {replyingTo?.id === note.id && (
        <div className="ml-8 mt-2 p-3 bg-brand-50/30 rounded-xl border border-brand-100">
          <p className="text-xs font-medium text-brand-700 mb-2 flex items-center gap-1">
            <CornerDownRight size={12} /> Replying to {note.creator?.full_name ?? note.creator?.email}
          </p>
          <NoteComposer
            value={replyText}
            onChange={(text, pos) => handleTextChange(text, setReplyText, 'reply', pos)}
            onSubmit={saveReply}
            saving={savingReply}
            placeholder="Write a reply... use @ to mention someone"
            submitLabel="Reply"
            ref={replyInputRef}
          />
        </div>
      )}
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-600" size={28} />
    </div>
  )
  if (!customer) return <div className="text-center py-16 text-gray-400">Customer not found.</div>

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/reports/customer-debt"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{customer.name}</h1>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
            <span>{customer.customer_id}</span>
            {customer.phone && <><span>·</span><span>{customer.phone}</span></>}
            {customer.address && <><span>·</span><span>{customer.address}</span></>}
          </div>
        </div>
      </div>

      {/* Last payment flash */}
      {lastPayment ? (() => {
        const now = new Date()
        const saleDate = orders.length > 0
          ? new Date(Math.min(...orders.map(o => new Date(o.created_at).getTime())))
          : null
        const lastPaymentDate = new Date(lastPayment.payment_date)
        const daysSinceSale = saleDate
          ? Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0
        const daysSincePayment = Math.floor((now.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
        const needsUrgentCall = totalOutstanding > 0 && daysSinceSale > 15 && daysSincePayment > 5

        return (
          <div className={`flex items-start gap-3 p-4 rounded-xl border
            ${needsUrgentCall ? 'bg-red-50 border-red-300'
              : daysSincePayment <= 7 ? 'bg-green-50 border-green-200'
              : daysSincePayment <= 30 ? 'bg-blue-50 border-blue-200'
              : 'bg-amber-50 border-amber-200'}`}>
            <div className="shrink-0 mt-0.5">
              {needsUrgentCall ? <AlertTriangle size={16} className="text-red-600" />
                : daysSincePayment <= 7 ? <CheckCircle2 size={16} className="text-green-600" />
                : <Clock size={16} className={daysSincePayment <= 30 ? 'text-blue-600' : 'text-amber-600'} />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold mb-0.5 ${needsUrgentCall ? 'text-red-800' : 'text-gray-800'}`}>
                {needsUrgentCall ? '⚠ Action required — customer needs to be called' : 'Last payment received'}
              </p>
              <p className={`text-sm ${needsUrgentCall ? 'text-red-700' : 'text-gray-600'}`}>
                Last payment of <span className="font-bold">{fmt(lastPayment.amount_paid)}</span> was made{' '}
                <span className="font-semibold">{timeAgo(lastPayment.payment_date)}</span>
                {' '}· {new Date(lastPayment.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {needsUrgentCall && (
                <p className="text-xs text-red-600 mt-1 font-medium">
                  Sale is {daysSinceSale} days old · Last payment was {daysSincePayment} days ago · Outstanding: {fmt(totalOutstanding)}
                </p>
              )}
            </div>
          </div>
        )
      })() : (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-red-50 border-red-200">
          <AlertTriangle size={16} className="text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-800">No payments recorded — customer needs to be called</p>
            {totalOutstanding > 0 && <p className="text-xs text-red-600 mt-0.5">Outstanding: {fmt(totalOutstanding)}</p>}
          </div>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total payable', value: fmt(totalPayable), icon: <Wallet size={14} className="text-brand-600" />, bg: 'bg-brand-50', color: 'text-brand-700' },
          { label: 'Total recovered', value: fmt(totalRecovered), icon: <TrendingUp size={14} className="text-green-600" />, bg: 'bg-green-50', color: 'text-green-700' },
          { label: 'Outstanding', value: fmt(totalOutstanding), icon: <AlertTriangle size={14} className={totalOutstanding > 0 ? 'text-red-500' : 'text-green-500'} />, bg: totalOutstanding > 0 ? 'bg-red-50' : 'bg-green-50', color: totalOutstanding > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Total orders', value: orders.length.toString(), icon: <CheckCircle2 size={14} className="text-gray-500" />, bg: 'bg-gray-50', color: 'text-gray-700' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
            <div className="flex items-center gap-2 mb-1.5">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-lg font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Debt recovery progress</p>
          <p className="text-sm font-bold text-brand-600">{progressPct.toFixed(1)}%</p>
        </div>
        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : progressPct >= 60 ? 'bg-brand-500' : progressPct >= 30 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Recovered: <span className="font-semibold text-gray-700">{fmt(totalRecovered)}</span></span>
          <span>Total payable: <span className="font-semibold text-gray-700">{fmt(totalPayable)}</span></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'orders', label: 'Sales orders', count: orders.length },
            { key: 'recoveries', label: 'Recoveries', count: recoveries.length },
            { key: 'notes', label: 'Notes', count: notes.reduce((s, n) => s + 1 + (n.replies?.length ?? 0), 0) },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as 'orders' | 'recoveries' | 'notes')}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Orders tab */}
        {activeTab === 'orders' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Order ID', 'Container', 'Type', 'Payable', 'Paid', 'Outstanding', 'Status', 'Date'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No orders found.</td></tr>
                ) : orders.map(o => {
                  const psCfg = PAYMENT_STATUS[o.payment_status as keyof typeof PAYMENT_STATUS] ?? PAYMENT_STATUS.outstanding
                  return (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{o.order_id}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="font-mono text-xs text-gray-600">{o.container_tracking ?? o.container_id}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.sale_type === 'box_sale' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                          {o.sale_type === 'box_sale' ? 'Box' : 'Split'}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(o.customer_payable)}</td>
                      <td className="px-3 py-3 text-green-600 font-medium whitespace-nowrap">{fmt(o.amount_paid)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-semibold ${o.outstanding_balance > 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {o.outstanding_balance > 0 ? fmt(o.outstanding_balance) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${psCfg.color}`}>{psCfg.label}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {orders.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-brand-100">
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Totals</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-brand-700 whitespace-nowrap">{fmt(totalPayable)}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(orders.reduce((s,o)=>s+o.amount_paid,0))}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-red-500 whitespace-nowrap">{fmt(orders.reduce((s,o)=>s+o.outstanding_balance,0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Recoveries tab */}
        {activeTab === 'recoveries' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Recovery ID', 'Order', 'Type', 'Amount', 'Date', 'Method', 'Comments'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recoveries.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No recoveries found.</td></tr>
                ) : recoveries.map((r, idx) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{r.recovery_id}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-500">{r.order_id}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.payment_type === 'initial' ? 'bg-blue-50 text-blue-700' : 'bg-brand-50 text-brand-700'}`}>
                        {r.payment_type === 'initial' ? 'Initial payment' : `Recovery #${recoveries.filter((rc, i) => rc.payment_type !== 'initial' && i <= idx).length}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{fmt(r.amount_paid)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(r.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 capitalize whitespace-nowrap">
                      {r.payment_method === 'transfer' ? 'Bank transfer' : 'Cash'}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[200px] truncate">{r.comments ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              {recoveries.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-brand-100">
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Total recovered</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-green-600 whitespace-nowrap">{fmt(totalRecovered)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Notes tab */}
        {activeTab === 'notes' && (
          <div className="p-5 space-y-4">

            {/* @ mention dropdown */}
            {mentionOpen && filteredMentions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-xl py-1 max-w-xs">
                <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Mention a team member</p>
                {filteredMentions.map(p => (
                  <button key={p.id} type="button"
                    onClick={() => insertMention(p, mentionTarget)}
                    className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <span className="text-brand-700 text-xs font-semibold">{(p.full_name ?? p.email)[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{p.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* New note composer */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <MessageSquare size={14} className="text-brand-600" /> New note
              </p>
              <NoteComposer
                value={newNote}
                onChange={(text, pos) => handleTextChange(text, setNewNote, 'note', pos)}
                onSubmit={saveNote}
                saving={savingNote}
                placeholder="Add a note about this customer... use @ to mention someone"
                submitLabel="Post note"
                ref={noteInputRef}
              />
            </div>

            {/* Notes thread */}
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 border-2 border-dashed border-gray-100 rounded-xl">
                <MessageSquare size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No notes yet. Be the first to add one.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map(note => (
                  <NoteCard key={note.id} note={note} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CustomerDebtDrilldownPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>}>
      <CustomerDebtDrilldownPageInner />
    </Suspense>
  )
}
