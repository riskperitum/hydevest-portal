'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, Wallet, TrendingUp,
  AlertTriangle, CheckCircle2, Send, AtSign,
  CornerDownRight, Trash2, MessageSquare,
} from 'lucide-react'
import Link from 'next/link'
import React from 'react'

interface TripDetail {
  trip_db_id: string
  trip_id: string
  title: string
  source_location: string | null
  source_port: string | null
  destination_port: string | null
  supplier_name: string | null
  total_cost_usd: number
  total_paid_usd: number
  outstanding_usd: number
  payment_status: 'paid' | 'partial' | 'outstanding'
}

interface ContainerRow {
  id: string
  container_id: string
  tracking_number: string | null
  title: string | null
  pieces_purchased: number | null
  unit_price_usd: number | null
  shipping_amount_usd: number | null
  total_cost_usd: number
  status: string
}

interface PaymentRow {
  id: string
  expense_id: string
  amount: number
  currency: string
  description: string | null
  expense_date: string
  created_at: string
  creator: { full_name: string | null; email: string } | null
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

const fmtUSD = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function timeAgo(date: string): string {
  const diffDays = Math.floor((new Date().getTime() - new Date(date).getTime()) / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays/7)} week${Math.floor(diffDays/7)>1?'s':''} ago`
  return `${Math.floor(diffDays/30)} month${Math.floor(diffDays/30)>1?'s':''} ago`
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
          if (mentioned) return <span key={i} className="bg-brand-100 text-brand-700 font-semibold px-1 rounded">{part}</span>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function SupplierPayablesDrilldownInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const tripId = params.id as string

  const [trip, setTrip] = useState<TripDetail | null>(null)
  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'containers' | 'payments' | 'notes'>(
    (searchParams.get('tab') as 'containers' | 'payments' | 'notes') ?? 'containers'
  )
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)

  const [newNote, setNewNote] = useState('')
  const [replyingTo, setReplyingTo] = useState<NoteRow | null>(null)
  const [replyText, setReplyText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savingReply, setSavingReply] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionTarget, setMentionTarget] = useState<'note' | 'reply'>('note')
  const [cursorPosition, setCursorPosition] = useState(0)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: tripData }, { data: containerData }, { data: expenseData }, { data: noteData }, { data: allProfiles }] = await Promise.all([
      supabase.from('trips').select('id, trip_id, title, source_location, source_port, destination_port, supplier:suppliers(name)').eq('id', tripId).single(),
      supabase.from('containers').select('id, container_id, tracking_number, title, pieces_purchased, unit_price_usd, shipping_amount_usd, status').eq('trip_id', tripId).order('created_at'),
      supabase.from('trip_expenses').select('id, expense_id, amount, currency, description, expense_date, created_at, creator:profiles!trip_expenses_created_by_fkey(full_name, email)').eq('trip_id', tripId).eq('category', 'container').eq('currency', 'USD').order('expense_date', { ascending: false }),
      supabase.from('supplier_payable_notes').select('*, creator:profiles!supplier_payable_notes_created_by_fkey(id, full_name, email)').eq('trip_id', tripId).order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
    ])

    setProfiles(allProfiles ?? [])

    // Compute trip totals
    const tripContainers = (containerData ?? [])
    const totalCostUsd = tripContainers.reduce((s, c) => {
      return s + (Number(c.unit_price_usd ?? 0) * Number(c.pieces_purchased ?? 0)) + Number(c.shipping_amount_usd ?? 0)
    }, 0)
    const totalPaidUsd = (expenseData ?? []).reduce((s, e) => s + Number(e.amount), 0)
    const outstandingUsd = Math.max(totalCostUsd - totalPaidUsd, 0)

    let paymentStatus: TripDetail['payment_status'] = 'outstanding'
    if (outstandingUsd <= 0) paymentStatus = 'paid'
    else if (totalPaidUsd > 0) paymentStatus = 'partial'

    setTrip({
      trip_db_id: tripId,
      trip_id: tripData?.trip_id ?? '—',
      title: tripData?.title ?? '—',
      source_location: tripData?.source_location ?? null,
      source_port: tripData?.source_port ?? null,
      destination_port: tripData?.destination_port ?? null,
      supplier_name: (tripData?.supplier as any)?.name ?? null,
      total_cost_usd: totalCostUsd,
      total_paid_usd: totalPaidUsd,
      outstanding_usd: outstandingUsd,
      payment_status: paymentStatus,
    })

    setContainers(tripContainers.map(c => ({
      id: c.id,
      container_id: c.container_id,
      tracking_number: c.tracking_number,
      title: c.title,
      pieces_purchased: c.pieces_purchased,
      unit_price_usd: c.unit_price_usd ? Number(c.unit_price_usd) : null,
      shipping_amount_usd: c.shipping_amount_usd ? Number(c.shipping_amount_usd) : null,
      total_cost_usd: (Number(c.unit_price_usd ?? 0) * Number(c.pieces_purchased ?? 0)) + Number(c.shipping_amount_usd ?? 0),
      status: c.status,
    })))

    setPayments((expenseData ?? []).map(e => ({
      id: e.id,
      expense_id: e.expense_id,
      amount: Number(e.amount),
      currency: e.currency,
      description: e.description,
      expense_date: e.expense_date,
      created_at: e.created_at,
      creator: e.creator as any,
    })))

    // Build threaded notes
    const allNotes: NoteRow[] = (noteData ?? []).map(n => ({ ...n, mentions: n.mentions ?? [], replies: [] }))
    const topLevel = allNotes.filter(n => !n.parent_id)
    allNotes.filter(n => n.parent_id).forEach(reply => {
      const parent = topLevel.find(n => n.id === reply.parent_id)
      if (parent) parent.replies!.push(reply)
    })
    setNotes(topLevel)

    setLoading(false)
  }, [tripId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single()
      setCurrentUser(profile)
    })
  }, [load])

  function extractMentions(text: string): { id: string; name: string }[] {
    const mentioned: { id: string; name: string }[] = []
    text.split(/\s+/).forEach(word => {
      if (!word.startsWith('@')) return
      const handle = word.slice(1).toLowerCase()
      const profile = profiles.find(p =>
        (p.full_name ?? '').toLowerCase().replace(/\s+/g, '') === handle ||
        (p.full_name ?? '').toLowerCase().split(' ')[0] === handle
      )
      if (profile && !mentioned.find(m => m.id === profile.id)) {
        mentioned.push({ id: profile.id, name: profile.full_name ?? profile.email })
      }
    })
    return mentioned
  }

  function handleTextChange(text: string, setText: (v: string) => void, target: 'note' | 'reply', pos: number) {
    setText(text)
    setCursorPosition(pos)
    const atMatch = text.slice(0, pos).match(/@(\w*)$/)
    if (atMatch) { setMentionQuery(atMatch[1].toLowerCase()); setMentionOpen(true); setMentionTarget(target) }
    else { setMentionOpen(false); setMentionQuery('') }
  }

  function insertMention(profile: Profile, target: 'note' | 'reply') {
    const handle = `@${(profile.full_name ?? profile.email).split(' ')[0]}`
    const setText = target === 'note' ? setNewNote : setReplyText
    const text = target === 'note' ? newNote : replyText
    const atIndex = text.slice(0, cursorPosition).lastIndexOf('@')
    setText(text.slice(0, atIndex) + handle + ' ' + text.slice(cursorPosition))
    setMentionOpen(false)
    setTimeout(() => (target === 'note' ? noteInputRef : replyInputRef).current?.focus(), 0)
  }

  async function notifyMentions(mentions: { id: string; name: string }[], noteId: string, noteText: string) {
    if (!mentions.length || !currentUser) return
    const supabase = createClient()
    for (const mention of mentions) {
      if (mention.id === currentUser.id) continue
      await supabase.from('notifications').insert({
        user_id: mention.id,
        type: 'note_mention',
        title: `${currentUser.full_name ?? currentUser.email} mentioned you`,
        message: `In a supplier note about ${trip?.title}: "${noteText.slice(0, 60)}${noteText.length > 60 ? '…' : ''}"`,
        note_id: noteId,
        record_id: tripId,
        record_ref: trip?.trip_id ?? '',
        module: 'supplier_payables',
      })
    }
  }

  async function saveNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim()) return
    setSavingNote(true)
    const supabase = createClient()
    const mentions = extractMentions(newNote)
    const { data: note } = await supabase.from('supplier_payable_notes').insert({
      trip_id: tripId, note: newNote.trim(), mentions, created_by: currentUser?.id,
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
    const { data: note } = await supabase.from('supplier_payable_notes').insert({
      trip_id: tripId, note: replyText.trim(), parent_id: replyingTo.id, mentions, created_by: currentUser?.id,
    }).select().single()
    if (note) await notifyMentions(mentions, note.id, replyText)
    setReplyText('')
    setReplyingTo(null)
    setSavingReply(false)
    load()
  }

  async function deleteNote(id: string) {
    if (!confirm('Delete this note and all replies?')) return
    const supabase = createClient()
    await supabase.from('supplier_payable_notes').delete().eq('id', id)
    load()
  }

  const filteredMentions = profiles.filter(p =>
    p.id !== currentUser?.id &&
    ((p.full_name ?? '').toLowerCase().includes(mentionQuery) || p.email.toLowerCase().includes(mentionQuery))
  ).slice(0, 5)

  const NoteCard = ({ note, isReply = false }: { note: NoteRow; isReply?: boolean }) => (
    <div className={isReply ? 'ml-8 mt-2' : ''}>
      <div className={`flex items-start gap-3 p-4 rounded-xl border group ${isReply ? 'bg-gray-50/50 border-gray-100' : 'bg-white border-gray-100 shadow-sm'}`}>
        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-brand-700 text-xs font-semibold">{(note.creator?.full_name ?? note.creator?.email ?? 'U')[0].toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-gray-800">{note.creator?.full_name ?? note.creator?.email ?? 'Unknown'}</span>
            <span className="text-xs text-gray-400">· {timeAgo(note.created_at)}</span>
            {note.mentions?.length > 0 && note.mentions.map(m => (
              <span key={m.id} className="text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">@{m.name.split(' ')[0]}</span>
            ))}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{renderNoteText(note.note, note.mentions ?? [])}</p>
          {!isReply && (
            <button type="button" onClick={() => { setReplyingTo(replyingTo?.id === note.id ? null : note); setReplyText('') }}
              className="text-xs text-gray-400 hover:text-brand-600 font-medium flex items-center gap-1 mt-2 transition-colors">
              <CornerDownRight size={12} />
              {note.replies?.length ? `${note.replies.length} repl${note.replies.length === 1 ? 'y' : 'ies'}` : 'Reply'}
            </button>
          )}
        </div>
        {note.creator?.id === currentUser?.id && (
          <button onClick={() => deleteNote(note.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {note.replies && note.replies.length > 0 && (
        <div className="ml-8 mt-1 space-y-1 border-l-2 border-gray-100 pl-3">
          {note.replies.map(r => <NoteCard key={r.id} note={r} isReply />)}
        </div>
      )}
      {replyingTo?.id === note.id && (
        <div className="ml-8 mt-2 p-3 bg-brand-50/30 rounded-xl border border-brand-100">
          <p className="text-xs font-medium text-brand-700 mb-2 flex items-center gap-1">
            <CornerDownRight size={12} /> Replying to {note.creator?.full_name ?? note.creator?.email}
          </p>
          <form onSubmit={saveReply} className="space-y-2">
            <div className="relative">
              <textarea ref={replyInputRef} rows={2} value={replyText}
                onChange={e => handleTextChange(e.target.value, setReplyText, 'reply', e.target.selectionStart ?? 0)}
                placeholder="Write a reply... use @ to mention"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none pr-8" />
              <AtSign size={13} className="absolute bottom-2.5 right-2.5 text-gray-300" />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={savingReply || !replyText.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {savingReply ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Reply
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-600" size={28} /></div>
  if (!trip) return <div className="text-center py-16 text-gray-400">Trip not found.</div>

  const progressPct = trip.total_cost_usd > 0 ? Math.min((trip.total_paid_usd / trip.total_cost_usd) * 100, 100) : 0

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/reports/supplier-payables"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{trip.trip_id}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border
              ${trip.payment_status === 'paid' ? 'bg-green-50 text-green-700 border-green-200'
                : trip.payment_status === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-red-50 text-red-600 border-red-200'}`}>
              {trip.payment_status === 'paid' ? 'Fully paid' : trip.payment_status === 'partial' ? 'Partial' : 'Outstanding'}
            </span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mt-0.5">{trip.title}</h1>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
            {trip.supplier_name && <span>{trip.supplier_name}</span>}
            {trip.source_location && <><span>·</span><span>{trip.source_location}</span></>}
            {trip.source_port && <><span>·</span><span>{trip.source_port}</span></>}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total cost (USD)', value: fmtUSD(trip.total_cost_usd), icon: <Wallet size={14} className="text-brand-600" />, bg: 'bg-brand-50', color: 'text-brand-700' },
          { label: 'Total paid (USD)', value: trip.total_paid_usd > 0 ? fmtUSD(trip.total_paid_usd) : '—', icon: <TrendingUp size={14} className="text-green-600" />, bg: 'bg-green-50', color: 'text-green-700' },
          { label: 'Outstanding (USD)', value: trip.outstanding_usd > 0 ? fmtUSD(trip.outstanding_usd) : '—', icon: <AlertTriangle size={14} className={trip.outstanding_usd > 0 ? 'text-red-500' : 'text-green-500'} />, bg: trip.outstanding_usd > 0 ? 'bg-red-50' : 'bg-green-50', color: trip.outstanding_usd > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Containers', value: containers.length.toString(), icon: <CheckCircle2 size={14} className="text-gray-500" />, bg: 'bg-gray-50', color: 'text-gray-700' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
            <div className="flex items-center gap-2 mb-1.5">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Payment progress</p>
          <p className="text-sm font-bold text-brand-600">{progressPct.toFixed(1)}%</p>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : progressPct >= 60 ? 'bg-brand-500' : progressPct >= 30 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Paid: <span className="font-semibold text-gray-700">{fmtUSD(trip.total_paid_usd)}</span></span>
          <span>Total cost: <span className="font-semibold text-gray-700">{fmtUSD(trip.total_cost_usd)}</span></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { key: 'containers', label: 'Containers', count: containers.length },
            { key: 'payments', label: 'Container payments', count: payments.length },
            { key: 'notes', label: 'Notes', count: notes.reduce((s,n)=>s+1+(n.replies?.length??0),0) },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as 'containers' | 'payments' | 'notes')}
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

        {/* Tab 1 — Containers */}
        {activeTab === 'containers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Container ID','Tracking No.','Title','Pieces','Unit price (USD)','Shipping (USD)','Total cost (USD)','Status'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {containers.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No containers in this trip.</td></tr>
                ) : containers.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{c.container_id}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{c.tracking_number ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{c.title ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{c.pieces_purchased?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{c.unit_price_usd ? fmtUSD(c.unit_price_usd) : '—'}</td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{c.shipping_amount_usd ? fmtUSD(c.shipping_amount_usd) : '—'}</td>
                    <td className="px-3 py-3 font-semibold text-brand-700 whitespace-nowrap">{fmtUSD(c.total_cost_usd)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium capitalize">{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {containers.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-brand-100">
                    <td colSpan={6} className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Total cost</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-brand-700 whitespace-nowrap">{fmtUSD(containers.reduce((s,c)=>s+c.total_cost_usd,0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Tab 2 — Container payments */}
        {activeTab === 'payments' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Expense ID','Amount (USD)','Description','Date','Recorded by'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">No container payment expenses recorded yet.</td></tr>
                ) : payments.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{p.expense_id}</span>
                    </td>
                    <td className="px-3 py-3 font-bold text-green-700 whitespace-nowrap">{fmtUSD(p.amount)}</td>
                    <td className="px-3 py-3 text-gray-600 max-w-[200px] truncate">{p.description ?? '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(p.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {p.creator?.full_name ?? p.creator?.email ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {payments.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-brand-100">
                    <td className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Total paid</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-green-600 whitespace-nowrap">{fmtUSD(payments.reduce((s,p)=>s+p.amount,0))}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Tab 3 — Notes */}
        {activeTab === 'notes' && (
          <div className="p-5 space-y-4">
            {/* @ mention dropdown */}
            {mentionOpen && filteredMentions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-xl py-1 max-w-xs">
                <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Mention a team member</p>
                {filteredMentions.map(p => (
                  <button key={p.id} type="button" onClick={() => insertMention(p, mentionTarget)}
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
              <form onSubmit={saveNote} className="space-y-2">
                <div className="relative">
                  <textarea ref={noteInputRef} rows={3} value={newNote}
                    onChange={e => handleTextChange(e.target.value, setNewNote, 'note', e.target.selectionStart ?? 0)}
                    placeholder="Add a note about this supplier payment... use @ to mention someone"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none pr-10" />
                  <AtSign size={14} className="absolute bottom-2.5 right-3 text-gray-300" />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">Use @ to mention a team member</p>
                  <button type="submit" disabled={savingNote || !newNote.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {savingNote ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Post note
                  </button>
                </div>
              </form>
            </div>

            {/* Notes thread */}
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 border-2 border-dashed border-gray-100 rounded-xl">
                <MessageSquare size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No notes yet. Add the first note above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map(note => <NoteCard key={note.id} note={note} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SupplierPayablesDrilldownPage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>}>
      <SupplierPayablesDrilldownInner />
    </React.Suspense>
  )
}
