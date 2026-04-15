'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, ArrowRightLeft, XCircle,
  CheckCircle2, AlertTriangle, Plus, Trash2,
  MessageSquare, CornerDownRight, Send, AtSign,
  Activity, Pencil
} from 'lucide-react'
import Link from 'next/link'
import React from 'react'
import AmountInput from '@/components/ui/AmountInput'

interface Receivable {
  id: string
  container_id: string
  tracking_number: string | null
  trip_id: string
  trip_title: string
  trip_db_id: string
  supplier_name: string | null
  missing_pieces: number
  unit_price_usd: number
  gross_value_usd: number
  agreed_value_usd: number | null
  total_applied_usd: number
  total_written_off_usd: number
  remaining_usd: number
  status: string
  notes: string | null
}

interface AllocationRow {
  id: string
  target_trip_id: string
  target_trip_title: string
  amount_usd: number
  percentage: number | null
  status: string
  notes: string | null
  created_at: string
  requested_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
}

interface WriteoffRow {
  id: string
  amount_usd: number
  reason: string | null
  created_at: string
  written_off_by_name: string | null
}

interface ActivityRow {
  id: string
  action: string
  details: string | null
  amount_usd: number | null
  created_at: string
  performer_name: string | null
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

interface Trip {
  id: string
  trip_id: string
  title: string
}

const fmtUSD = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function timeAgo(date: string): string {
  const diffDays = Math.floor((new Date().getTime() - new Date(date).getTime()) / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`
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

const ALLOCATION_STATUS = {
  pending:  { label: 'Pending approval', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approved',         color: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rejected',         color: 'bg-red-50 text-red-600' },
}

function SupplierReceivablesDrilldownInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const receivableId = params.id as string

  const [receivable, setReceivable] = useState<Receivable | null>(null)
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [writeoffs, setWriteoffs] = useState<WriteoffRow[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [activeTab, setActiveTab] = useState<'allocations' | 'writeoffs' | 'activity' | 'notes'>('allocations')

  // Reallocation modal state
  const [reallocateOpen, setReallocateOpen] = useState(searchParams.get('action') === 'reallocate')
  const [allocForm, setAllocForm] = useState({ target_trip_id: '', amount_usd: '', percentage: '', notes: '', assignee: '' })
  const [savingAlloc, setSavingAlloc] = useState(false)

  // Write-off modal state
  const [writeoffOpen, setWriteoffOpen] = useState(false)
  const [writeoffForm, setWriteoffForm] = useState({ amount_usd: '', reason: '', assignee: '' })
  const [savingWriteoff, setSavingWriteoff] = useState(false)

  // Agreed value edit
  const [editAgreed, setEditAgreed] = useState(false)
  const [agreedValue, setAgreedValue] = useState('')
  const [savingAgreed, setSavingAgreed] = useState(false)

  // Notes state
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

    const [
      { data: rec },
      { data: allocs },
      { data: woffs },
      { data: acts },
      { data: noteData },
      { data: allProfiles },
      { data: allTrips },
    ] = await Promise.all([
      supabase.from('supplier_receivables').select(`
        id, missing_pieces, unit_price_usd, gross_value_usd,
        agreed_value_usd, total_applied_usd, total_written_off_usd,
        remaining_usd, status, notes,
        container:containers(container_id, tracking_number),
        trip:trips(id, trip_id, title),
        supplier:suppliers(name)
      `).eq('id', receivableId).single(),
      supabase.from('supplier_receivable_allocations').select(`
        id, amount_usd, percentage, status, notes, created_at, approved_at,
        target_trip:trips!supplier_receivable_allocations_target_trip_id_fkey(trip_id, title),
        requester:profiles!supplier_receivable_allocations_requested_by_fkey(full_name, email),
        approver:profiles!supplier_receivable_allocations_approved_by_fkey(full_name, email)
      `).eq('receivable_id', receivableId).order('created_at', { ascending: false }),
      supabase.from('supplier_receivable_writeoffs').select(`
        id, amount_usd, reason, created_at,
        writer:profiles!supplier_receivable_writeoffs_written_off_by_fkey(full_name, email)
      `).eq('receivable_id', receivableId).order('created_at', { ascending: false }),
      supabase.from('supplier_receivable_activity').select(`
        id, action, details, amount_usd, created_at,
        performer:profiles!supplier_receivable_activity_performed_by_fkey(full_name, email)
      `).eq('receivable_id', receivableId).order('created_at', { ascending: false }),
      supabase.from('supplier_receivable_notes').select('*, creator:profiles!supplier_receivable_notes_created_by_fkey(id, full_name, email)').eq('receivable_id', receivableId).order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      supabase.from('trips').select('id, trip_id, title').order('created_at', { ascending: false }),
    ])

    setReceivable({
      id: receivableId,
      container_id: (rec?.container as any)?.container_id ?? '—',
      tracking_number: (rec?.container as any)?.tracking_number ?? null,
      trip_id: (rec?.trip as any)?.trip_id ?? '—',
      trip_title: (rec?.trip as any)?.title ?? '—',
      trip_db_id: (rec?.trip as any)?.id ?? '',
      supplier_name: (rec?.supplier as any)?.name ?? null,
      missing_pieces: rec?.missing_pieces ?? 0,
      unit_price_usd: Number(rec?.unit_price_usd ?? 0),
      gross_value_usd: Number(rec?.gross_value_usd ?? 0),
      agreed_value_usd: rec?.agreed_value_usd ? Number(rec.agreed_value_usd) : null,
      total_applied_usd: Number(rec?.total_applied_usd ?? 0),
      total_written_off_usd: Number(rec?.total_written_off_usd ?? 0),
      remaining_usd: Number(rec?.remaining_usd ?? 0),
      status: rec?.status ?? 'open',
      notes: rec?.notes ?? null,
    })

    setAllocations((allocs ?? []).map(a => ({
      id: a.id,
      target_trip_id: (a.target_trip as any)?.trip_id ?? '—',
      target_trip_title: (a.target_trip as any)?.title ?? '—',
      amount_usd: Number(a.amount_usd),
      percentage: a.percentage ? Number(a.percentage) : null,
      status: a.status,
      notes: a.notes,
      created_at: a.created_at,
      requested_by_name: (a.requester as any)?.full_name ?? (a.requester as any)?.email ?? null,
      approved_by_name: (a.approver as any)?.full_name ?? (a.approver as any)?.email ?? null,
      approved_at: a.approved_at,
    })))

    setWriteoffs((woffs ?? []).map(w => ({
      id: w.id,
      amount_usd: Number(w.amount_usd),
      reason: w.reason,
      created_at: w.created_at,
      written_off_by_name: (w.writer as any)?.full_name ?? (w.writer as any)?.email ?? null,
    })))

    setActivity((acts ?? []).map(a => ({
      id: a.id,
      action: a.action,
      details: a.details,
      amount_usd: a.amount_usd ? Number(a.amount_usd) : null,
      created_at: a.created_at,
      performer_name: (a.performer as any)?.full_name ?? (a.performer as any)?.email ?? null,
    })))

    // Build threaded notes
    const allNotes: NoteRow[] = (noteData ?? []).map(n => ({ ...n, mentions: n.mentions ?? [], replies: [] }))
    const topLevel = allNotes.filter(n => !n.parent_id)
    allNotes.filter(n => n.parent_id).forEach(reply => {
      const parent = topLevel.find(n => n.id === reply.parent_id)
      if (parent) parent.replies!.push(reply)
    })
    setNotes(topLevel)
    setProfiles(allProfiles ?? [])
    setTrips((allTrips ?? []).filter(t => t.id !== (rec?.trip as any)?.id))
    setLoading(false)
  }, [receivableId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single()
      setCurrentUser(data)
    })
  }, [load])

  async function logActivity(action: string, details?: string, amountUsd?: number) {
    const supabase = createClient()
    await supabase.from('supplier_receivable_activity').insert({
      receivable_id: receivableId,
      action,
      details: details ?? null,
      amount_usd: amountUsd ?? null,
      performed_by: currentUser?.id,
    })
  }

  async function saveAgreedValue(e: React.FormEvent) {
    e.preventDefault()
    if (!agreedValue) return
    setSavingAgreed(true)
    const supabase = createClient()
    const val = parseFloat(agreedValue)
    await supabase.from('supplier_receivables').update({ agreed_value_usd: val }).eq('id', receivableId)
    await logActivity('Agreed value set', `Set agreed value to ${fmtUSD(val)}`, val)
    setSavingAgreed(false)
    setEditAgreed(false)
    load()
  }

  async function submitReallocation(e: React.FormEvent) {
    e.preventDefault()
    if (!allocForm.target_trip_id || !allocForm.amount_usd || !allocForm.assignee) return
    setSavingAlloc(true)
    const supabase = createClient()
    const amount = parseFloat(allocForm.amount_usd)
    const pct = allocForm.percentage ? parseFloat(allocForm.percentage) : null

    // Create allocation record
    const { data: alloc } = await supabase.from('supplier_receivable_allocations').insert({
      receivable_id: receivableId,
      target_trip_id: allocForm.target_trip_id,
      amount_usd: amount,
      percentage: pct,
      status: 'pending',
      notes: allocForm.notes || null,
      requested_by: currentUser?.id,
    }).select().single()

    // Create task for approval
    const targetTrip = trips.find(t => t.id === allocForm.target_trip_id)
    const { data: task } = await supabase.from('tasks').insert({
      type: 'approval_request',
      title: `Supplier receivable reallocation — ${receivable?.container_id}`,
      description: `Reallocation of ${fmtUSD(amount)} from ${receivable?.container_id} to trip ${targetTrip?.trip_id ?? ''}`,
      module: 'supplier_receivables',
      record_id: receivableId,
      record_ref: receivable?.container_id ?? '',
      requested_by: currentUser?.id,
      assigned_to: allocForm.assignee,
      priority: 'normal',
    }).select().single()

    // Notify assignee
    await supabase.from('notifications').insert({
      user_id: allocForm.assignee,
      type: 'task_approval_request',
      title: 'New task: Reallocation approval',
      message: `${receivable?.container_id} — ${fmtUSD(amount)} to ${targetTrip?.trip_id ?? ''}`,
      task_id: task?.id,
      record_id: receivableId,
      module: 'supplier_receivables',
    })

    await logActivity(
      'Reallocation requested',
      `${fmtUSD(amount)} to trip ${targetTrip?.trip_id ?? ''}${pct ? ` (${pct}%)` : ''}`,
      amount
    )

    setSavingAlloc(false)
    setReallocateOpen(false)
    setAllocForm({ target_trip_id: '', amount_usd: '', percentage: '', notes: '', assignee: '' })
    load()
  }

  async function approveAllocation(allocId: string) {
    const alloc = allocations.find(a => a.id === allocId)
    if (!alloc) return
    const supabase = createClient()

    // Update allocation status
    await supabase.from('supplier_receivable_allocations').update({
      status: 'approved',
      approved_by: currentUser?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', allocId)

    // Auto-create trip_expense record
    const targetTrip = trips.find(t => t.trip_id === alloc.target_trip_id) ??
      (await supabase.from('trips').select('id, trip_id').eq('trip_id', alloc.target_trip_id).single()).data

    if (targetTrip) {
      const { data: expense } = await supabase.from('trip_expenses').insert({
        trip_id: targetTrip.id,
        category: 'container',
        currency: 'USD',
        amount: alloc.amount_usd,
        description: `Supplier receivable reallocation from ${receivable?.container_id} (${receivable?.tracking_number ?? ''})`,
        expense_date: new Date().toISOString().split('T')[0],
        created_by: currentUser?.id,
      }).select().single()

      // Link expense to allocation
      if (expense) {
        await supabase.from('supplier_receivable_allocations').update({ trip_expense_id: expense.id }).eq('id', allocId)
      }
    }

    // Update receivable totals
    const newApplied = Number(receivable?.total_applied_usd ?? 0) + alloc.amount_usd
    const effectiveValue = receivable?.agreed_value_usd ?? receivable?.gross_value_usd ?? 0
    const newRemaining = effectiveValue - newApplied - Number(receivable?.total_written_off_usd ?? 0)
    const newStatus = newRemaining <= 0 ? 'fully_applied'
      : newApplied > 0 ? 'partially_applied' : 'open'

    await supabase.from('supplier_receivables').update({
      total_applied_usd: newApplied,
      status: newStatus,
    }).eq('id', receivableId)

    await logActivity('Reallocation approved', `${fmtUSD(alloc.amount_usd)} applied to trip ${alloc.target_trip_id}`, alloc.amount_usd)
    load()
  }

  async function submitWriteoff(e: React.FormEvent) {
    e.preventDefault()
    if (!writeoffForm.amount_usd || !writeoffForm.assignee) return
    setSavingWriteoff(true)
    const supabase = createClient()
    const amount = parseFloat(writeoffForm.amount_usd)

    // Create write-off record
    await supabase.from('supplier_receivable_writeoffs').insert({
      receivable_id: receivableId,
      amount_usd: amount,
      reason: writeoffForm.reason || null,
      written_off_by: currentUser?.id,
    })

    // Create approval task
    const { data: task } = await supabase.from('tasks').insert({
      type: 'approval_request',
      title: `Write-off approval — ${receivable?.container_id}`,
      description: `Write-off of ${fmtUSD(amount)} for supplier receivable on ${receivable?.container_id}`,
      module: 'supplier_receivables',
      record_id: receivableId,
      record_ref: receivable?.container_id ?? '',
      requested_by: currentUser?.id,
      assigned_to: writeoffForm.assignee,
      priority: 'high',
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: writeoffForm.assignee,
      type: 'task_approval_request',
      title: 'New task: Write-off approval',
      message: `Write-off of ${fmtUSD(amount)} — ${receivable?.container_id}`,
      task_id: task?.id,
      record_id: receivableId,
      module: 'supplier_receivables',
    })

    // Update receivable totals
    const newWrittenOff = Number(receivable?.total_written_off_usd ?? 0) + amount
    const effectiveValue = receivable?.agreed_value_usd ?? receivable?.gross_value_usd ?? 0
    const newRemaining = effectiveValue - Number(receivable?.total_applied_usd ?? 0) - newWrittenOff
    const newStatus = newRemaining <= 0 ? 'written_off' : receivable?.status ?? 'open'

    await supabase.from('supplier_receivables').update({
      total_written_off_usd: newWrittenOff,
      status: newStatus,
    }).eq('id', receivableId)

    await logActivity('Write-off submitted', writeoffForm.reason || 'No reason provided', amount)
    setSavingWriteoff(false)
    setWriteoffOpen(false)
    setWriteoffForm({ amount_usd: '', reason: '', assignee: '' })
    load()
  }

  // Notes functions
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
        message: `In a supplier receivable note: "${noteText.slice(0, 60)}${noteText.length > 60 ? '…' : ''}"`,
        record_id: receivableId,
        module: 'supplier_receivables',
      })
    }
  }

  async function saveNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim()) return
    setSavingNote(true)
    const supabase = createClient()
    const mentions = extractMentions(newNote)
    const { data: note } = await supabase.from('supplier_receivable_notes').insert({
      receivable_id: receivableId, note: newNote.trim(), mentions, created_by: currentUser?.id,
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
    const { data: note } = await supabase.from('supplier_receivable_notes').insert({
      receivable_id: receivableId, note: replyText.trim(), parent_id: replyingTo.id, mentions, created_by: currentUser?.id,
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
    await supabase.from('supplier_receivable_notes').delete().eq('id', id)
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
  if (!receivable) return <div className="text-center py-16 text-gray-400">Receivable not found.</div>

  const effectiveValue = receivable.agreed_value_usd ?? receivable.gross_value_usd
  const progressPct = effectiveValue > 0
    ? Math.min(((receivable.total_applied_usd + receivable.total_written_off_usd) / effectiveValue) * 100, 100)
    : 0

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/portal/reports/supplier-receivables"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{receivable.container_id}</span>
              <span className="font-mono text-xs text-gray-500">{receivable.tracking_number ?? '—'}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border
                ${receivable.status === 'fully_applied' ? 'bg-green-50 text-green-700 border-green-200'
                  : receivable.status === 'partially_applied' ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : receivable.status === 'written_off' ? 'bg-gray-100 text-gray-500 border-gray-200'
                  : 'bg-red-50 text-red-600 border-red-200'}`}>
                {receivable.status === 'fully_applied' ? 'Fully applied'
                  : receivable.status === 'partially_applied' ? 'Partially applied'
                  : receivable.status === 'written_off' ? 'Written off' : 'Open'}
              </span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mt-0.5">{receivable.trip_title}</h1>
            <p className="text-xs text-gray-400">{receivable.trip_id} · {receivable.supplier_name ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {receivable.status !== 'fully_applied' && receivable.status !== 'written_off' && (
            <button onClick={() => setReallocateOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <ArrowRightLeft size={14} /> Apply to trip
            </button>
          )}
          {receivable.remaining_usd > 0 && (
            <button onClick={() => setWriteoffOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
              <XCircle size={14} /> Write off
            </button>
          )}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Missing pieces', value: receivable.missing_pieces.toLocaleString(), color: 'text-red-600', sub: `@ $${receivable.unit_price_usd.toFixed(2)}/pc` },
          { label: 'Gross value', value: fmtUSD(receivable.gross_value_usd), color: 'text-gray-900', sub: 'Original claim' },
          { label: 'Agreed value', value: receivable.agreed_value_usd ? fmtUSD(receivable.agreed_value_usd) : 'Not set', color: receivable.agreed_value_usd ? 'text-blue-700' : 'text-gray-400', sub: 'Negotiated amount' },
          { label: 'Applied', value: receivable.total_applied_usd > 0 ? fmtUSD(receivable.total_applied_usd) : '—', color: 'text-green-700', sub: 'To other trips' },
          { label: 'Remaining', value: receivable.remaining_usd > 0 ? fmtUSD(receivable.remaining_usd) : '—', color: receivable.remaining_usd > 0 ? 'text-red-600' : 'text-green-600', sub: 'To be applied' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Progress bar + agreed value editor */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Resolution progress</p>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-brand-600">{progressPct.toFixed(1)}%</p>
            <button onClick={() => { setEditAgreed(true); setAgreedValue(receivable.agreed_value_usd?.toString() ?? receivable.gross_value_usd.toString()) }}
              className="p-1 rounded text-gray-400 hover:text-brand-600 transition-colors" title="Set agreed value">
              <Pencil size={13} />
            </button>
          </div>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : progressPct >= 60 ? 'bg-brand-500' : 'bg-amber-400'}`}
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Applied + written off: <span className="font-semibold text-gray-700">{fmtUSD(receivable.total_applied_usd + receivable.total_written_off_usd)}</span></span>
          <span>Effective value: <span className="font-semibold text-gray-700">{fmtUSD(effectiveValue)}</span></span>
        </div>

        {/* Agreed value inline editor */}
        {editAgreed && (
          <form onSubmit={saveAgreedValue} className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-600 shrink-0">Set agreed value (USD):</p>
            <AmountInput value={agreedValue} onChange={setAgreedValue}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button type="submit" disabled={savingAgreed}
              className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {savingAgreed ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
            </button>
            <button type="button" onClick={() => setEditAgreed(false)}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </form>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {[
            { key: 'allocations', label: 'Allocations', count: allocations.length },
            { key: 'writeoffs', label: 'Write-offs', count: writeoffs.length },
            { key: 'activity', label: 'Activity', count: activity.length },
            { key: 'notes', label: 'Notes', count: notes.reduce((s, n) => s + 1 + (n.replies?.length ?? 0), 0) },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                ${activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Allocations tab */}
        {activeTab === 'allocations' && (
          <div className="overflow-x-auto">
            {allocations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <ArrowRightLeft size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No allocations yet.</p>
                <button onClick={() => setReallocateOpen(true)}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                  <Plus size={12} /> Apply to a trip
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Target trip','Amount (USD)','Percentage','Status','Requested by','Approved by','Notes','Date','Actions'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allocations.map(a => {
                    const sCfg = ALLOCATION_STATUS[a.status as keyof typeof ALLOCATION_STATUS] ?? ALLOCATION_STATUS.pending
                    return (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <p className="text-xs font-mono font-medium text-brand-700">{a.target_trip_id}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[120px]">{a.target_trip_title}</p>
                        </td>
                        <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{fmtUSD(a.amount_usd)}</td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{a.percentage ? `${a.percentage.toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sCfg.color}`}>{sCfg.label}</span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{a.requested_by_name ?? '—'}</td>
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{a.approved_by_name ?? '—'}</td>
                        <td className="px-3 py-3 text-xs text-gray-400 max-w-[150px] truncate">{a.notes ?? '—'}</td>
                        <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">{timeAgo(a.created_at)}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {a.status === 'pending' && (
                            <button onClick={() => approveAllocation(a.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                              <CheckCircle2 size={11} /> Approve
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Write-offs tab */}
        {activeTab === 'writeoffs' && (
          <div className="overflow-x-auto">
            {writeoffs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <XCircle size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No write-offs recorded.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Amount (USD)','Reason','Written off by','Date'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {writeoffs.map(w => (
                    <tr key={w.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-3 font-bold text-red-600 whitespace-nowrap">{fmtUSD(w.amount_usd)}</td>
                      <td className="px-3 py-3 text-gray-600 max-w-[250px] truncate">{w.reason ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{w.written_off_by_name ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(w.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Activity tab */}
        {activeTab === 'activity' && (
          <div className="p-5">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Activity size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No activity recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activity.map(log => (
                  <div key={log.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-brand-600 text-xs font-semibold">
                        {(log.performer_name ?? 'S')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium text-gray-900">{log.performer_name ?? 'System'}</span>
                        {' '}<span className="text-gray-500">{log.action}</span>
                      </p>
                      {log.details && <p className="text-xs text-gray-400 mt-0.5">{log.details}</p>}
                      {log.amount_usd && <p className="text-xs font-medium text-brand-600 mt-0.5">{fmtUSD(log.amount_usd)}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{timeAgo(log.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
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

            {/* Composer */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <MessageSquare size={14} className="text-brand-600" /> New note
              </p>
              <form onSubmit={saveNote} className="space-y-2">
                <div className="relative">
                  <textarea ref={noteInputRef} rows={3} value={newNote}
                    onChange={e => handleTextChange(e.target.value, setNewNote, 'note', e.target.selectionStart ?? 0)}
                    placeholder="Add a note... use @ to mention someone"
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

            {/* Thread */}
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 border-2 border-dashed border-gray-100 rounded-xl">
                <MessageSquare size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No notes yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map(note => <NoteCard key={note.id} note={note} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reallocation modal */}
      {reallocateOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReallocateOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Apply to another trip</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Remaining: <span className="font-semibold text-brand-600">{fmtUSD(receivable.remaining_usd)}</span>
                </p>
              </div>
              <button onClick={() => setReallocateOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <form onSubmit={submitReallocation} className="px-6 py-5 space-y-4">
              <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
                <p className="text-xs text-brand-700 font-medium">
                  This will create a container payment trip expense on the target trip once approved.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Target trip <span className="text-red-400">*</span></label>
                <select required value={allocForm.target_trip_id} onChange={e => setAllocForm(f => ({ ...f, target_trip_id: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="">Select a trip...</option>
                  {trips.map(t => (
                    <option key={t.id} value={t.id}>{t.trip_id} — {t.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (USD) <span className="text-red-400">*</span></label>
                  <AmountInput required value={allocForm.amount_usd}
                    onChange={v => {
                      const pct = receivable.gross_value_usd > 0
                        ? ((parseFloat(v) / receivable.gross_value_usd) * 100).toFixed(1)
                        : ''
                      setAllocForm(f => ({ ...f, amount_usd: v, percentage: pct }))
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <p className="text-xs text-gray-400 mt-1">Max: {fmtUSD(receivable.remaining_usd)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Percentage</label>
                  <div className="px-3 py-2.5 text-sm rounded-lg border bg-gray-50 border-gray-200 text-gray-600 font-medium">
                    {allocForm.percentage ? `${allocForm.percentage}%` : '—'}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Auto-calculated</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                <textarea rows={2} value={allocForm.notes}
                  onChange={e => setAllocForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="e.g. Agreed amount after negotiation with supplier..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign approval to <span className="text-red-400">*</span></label>
                <select required value={allocForm.assignee} onChange={e => setAllocForm(f => ({ ...f, assignee: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="">Select approver...</option>
                  {profiles.filter(p => p.id !== currentUser?.id).map(p => (
                    <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setReallocateOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={savingAlloc || !allocForm.target_trip_id || !allocForm.amount_usd || !allocForm.assignee}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingAlloc ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <><ArrowRightLeft size={14} /> Submit for approval</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Write-off modal */}
      {writeoffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setWriteoffOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Write off amount</h2>
              <button onClick={() => setWriteoffOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs text-red-700 font-medium">
                Write-offs require approval and are permanently recorded for audit purposes.
              </p>
            </div>
            <form onSubmit={submitWriteoff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to write off (USD) <span className="text-red-400">*</span></label>
                <AmountInput required value={writeoffForm.amount_usd}
                  onChange={v => setWriteoffForm(f => ({ ...f, amount_usd: v }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-xs text-gray-400 mt-1">Remaining: {fmtUSD(receivable.remaining_usd)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason</label>
                <textarea rows={3} value={writeoffForm.reason}
                  onChange={e => setWriteoffForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="e.g. Supplier agreed to waive remaining $500 due to long-standing relationship..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign approval to <span className="text-red-400">*</span></label>
                <select required value={writeoffForm.assignee} onChange={e => setWriteoffForm(f => ({ ...f, assignee: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="">Select approver...</option>
                  {profiles.filter(p => p.id !== currentUser?.id).map(p => (
                    <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setWriteoffOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={savingWriteoff || !writeoffForm.amount_usd || !writeoffForm.assignee}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingWriteoff ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <><XCircle size={14} /> Submit write-off</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SupplierReceivablesDrilldownPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>}>
      <SupplierReceivablesDrilldownInner />
    </Suspense>
  )
}

