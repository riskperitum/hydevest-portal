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

interface TripReceivable {
  trip_db_id: string
  trip_id: string
  trip_title: string
  supplier_name: string | null
  container_count: number
  total_missing_pieces: number
  total_gross_value_usd: number
  total_effective_value_usd: number
  total_applied_usd: number
  total_written_off_usd: number
  total_remaining_usd: number
  status: string
}

interface ContainerRow {
  receivable_id: string
  container_id: string
  tracking_number: string | null
  pieces_purchased: number | null
  supplier_loaded_pieces: number | null
  missing_pieces: number
  unit_price_usd: number
  gross_value_usd: number
  agreed_value_usd: number | null
  remaining_usd: number
  status: string
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

const CONTAINER_STATUS = {
  open:              { label: 'Open',              color: 'bg-red-50 text-red-600' },
  partially_applied: { label: 'Partial',           color: 'bg-amber-50 text-amber-700' },
  fully_applied:     { label: 'Fully applied',     color: 'bg-green-50 text-green-700' },
  written_off:       { label: 'Written off',       color: 'bg-gray-100 text-gray-500' },
  no_receivable:     { label: 'No difference',     color: 'bg-gray-50 text-gray-400' },
}

function SupplierReceivablesDrilldownInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const tripId = params.id as string

  const [tripReceivable, setTripReceivable] = useState<TripReceivable | null>(null)
  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [writeoffs, setWriteoffs] = useState<WriteoffRow[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [otherTrips, setOtherTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [activeTab, setActiveTab] = useState<'containers' | 'allocations' | 'writeoffs' | 'activity' | 'notes'>('containers')

  // Reallocation modal
  const [reallocateOpen, setReallocateOpen] = useState(searchParams.get('action') === 'reallocate')
  const [allocForm, setAllocForm] = useState({ target_trip_id: '', amount_usd: '', percentage: '', notes: '', assignee: '' })
  const [savingAlloc, setSavingAlloc] = useState(false)

  // Write-off modal
  const [writeoffOpen, setWriteoffOpen] = useState(false)
  const [writeoffForm, setWriteoffForm] = useState({ amount_usd: '', reason: '', assignee: '' })
  const [savingWriteoff, setSavingWriteoff] = useState(false)

  // Notes
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

    // Load trip-level aggregated data
    const { data: tripData } = await supabase
      .from('supplier_receivables_by_trip')
      .select('*')
      .eq('trip_db_id', tripId)
      .single()

    // Load ALL containers for this trip
    const { data: allTripContainers } = await supabase
      .from('containers')
      .select('id, container_id, tracking_number, pieces_purchased, unit_price_usd')
      .eq('trip_id', tripId)
      .order('created_at')

    // Load presales separately for supplier_loaded_pieces
    const containerDbIds = (allTripContainers ?? []).map(c => c.id)
    const { data: presaleData } = containerDbIds.length > 0
      ? await supabase.from('presales')
          .select('container_id, supplier_loaded_pieces')
          .in('container_id', containerDbIds)
      : { data: [] }
    const presaleMap = Object.fromEntries((presaleData ?? []).map(p => [p.container_id, p]))

    // Load receivables for this trip
    const { data: containerRecs } = await supabase
      .from('supplier_receivables')
      .select('id, container_id, missing_pieces, unit_price_usd, gross_value_usd, agreed_value_usd, remaining_usd, status')
      .eq('trip_id', tripId)
      .order('created_at')
    const receivableByContainerId = Object.fromEntries(
      (containerRecs ?? []).map(r => [r.container_id, r])
    )

    // Load all allocations for receivables in this trip
    const receivableIds = (containerRecs ?? []).map(r => r.id)

    const [{ data: allocs }, { data: woffs }, { data: acts }, { data: noteData }, { data: allProfiles }, { data: allTrips }] = await Promise.all([
      receivableIds.length > 0
        ? supabase.from('supplier_receivable_allocations').select(`
            id, amount_usd, percentage, status, notes, created_at,
            target_trip:trips!supplier_receivable_allocations_target_trip_id_fkey(id, trip_id, title),
            requester:profiles!supplier_receivable_allocations_requested_by_fkey(full_name, email),
            approver:profiles!supplier_receivable_allocations_approved_by_fkey(full_name, email)
          `).in('receivable_id', receivableIds).order('created_at', { ascending: false })
        : { data: [] },
      receivableIds.length > 0
        ? supabase.from('supplier_receivable_writeoffs').select(`
            id, amount_usd, reason, created_at,
            writer:profiles!supplier_receivable_writeoffs_written_off_by_fkey(full_name, email)
          `).in('receivable_id', receivableIds).order('created_at', { ascending: false })
        : { data: [] },
      receivableIds.length > 0
        ? supabase.from('supplier_receivable_activity').select(`
            id, action, details, amount_usd, created_at,
            performer:profiles!supplier_receivable_activity_performed_by_fkey(full_name, email)
          `).in('receivable_id', receivableIds).order('created_at', { ascending: false })
        : { data: [] },
      supabase.from('supplier_receivable_notes').select(`
        *, creator:profiles!supplier_receivable_notes_created_by_fkey(id, full_name, email)
      `).eq('trip_id', tripId).order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      supabase.from('trips').select('id, trip_id, title').neq('id', tripId).order('created_at', { ascending: false }),
    ])

    setTripReceivable({
      trip_db_id: tripId,
      trip_id: tripData?.trip_id ?? '—',
      trip_title: tripData?.trip_title ?? '—',
      supplier_name: tripData?.supplier_name ?? null,
      container_count: Number(tripData?.container_count ?? 0),
      total_missing_pieces: Number(tripData?.total_missing_pieces ?? 0),
      total_gross_value_usd: Number(tripData?.total_gross_value_usd ?? 0),
      total_effective_value_usd: Number(tripData?.total_effective_value_usd ?? 0),
      total_applied_usd: Number(tripData?.total_applied_usd ?? 0),
      total_written_off_usd: Number(tripData?.total_written_off_usd ?? 0),
      total_remaining_usd: Number(tripData?.total_remaining_usd ?? 0),
      status: tripData?.status ?? 'open',
    })

    setContainers((allTripContainers ?? []).map(c => {
      const rec = receivableByContainerId[c.id]
      const presale = presaleMap[c.id]
      const supplierLoaded = presale?.supplier_loaded_pieces ?? null
      const piecesP = c.pieces_purchased ?? 0
      const missingPieces = rec
        ? rec.missing_pieces
        : (supplierLoaded != null && piecesP > supplierLoaded ? piecesP - supplierLoaded : 0)
      return {
        receivable_id: rec?.id ?? '',
        container_id: c.container_id,
        tracking_number: c.tracking_number,
        pieces_purchased: piecesP,
        supplier_loaded_pieces: supplierLoaded,
        missing_pieces: missingPieces,
        unit_price_usd: Number(c.unit_price_usd ?? 0),
        gross_value_usd: rec ? Number(rec.gross_value_usd) : 0,
        agreed_value_usd: rec?.agreed_value_usd ? Number(rec.agreed_value_usd) : null,
        remaining_usd: rec ? Number(rec.remaining_usd ?? 0) : 0,
        status: rec ? rec.status : 'no_receivable',
      }
    }))

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
    setOtherTrips(allTrips ?? [])
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single()
      setCurrentUser(data)
    })
  }, [load])

  async function logActivity(receivableIds: string[], action: string, details?: string, amountUsd?: number) {
    const supabase = createClient()
    for (const id of receivableIds) {
      await supabase.from('supplier_receivable_activity').insert({
        receivable_id: id, action,
        details: details ?? null,
        amount_usd: amountUsd ?? null,
        performed_by: currentUser?.id,
      })
    }
  }

  async function submitReallocation(e: React.FormEvent) {
    e.preventDefault()
    if (!allocForm.target_trip_id || !allocForm.amount_usd || !allocForm.assignee) return
    setSavingAlloc(true)
    const supabase = createClient()
    const amount = parseFloat(allocForm.amount_usd)
    const pct = allocForm.percentage ? parseFloat(allocForm.percentage) : null

    // Use first open receivable for this trip as the reference
    const firstReceivable = containers.find(c =>
      c.receivable_id &&
      c.status !== 'fully_applied' &&
      c.status !== 'written_off' &&
      c.status !== 'no_receivable'
    )
    if (!firstReceivable) return

    const { data: alloc } = await supabase.from('supplier_receivable_allocations').insert({
      receivable_id: firstReceivable.receivable_id,
      target_trip_id: allocForm.target_trip_id,
      amount_usd: amount,
      percentage: pct,
      status: 'pending',
      notes: allocForm.notes || null,
      requested_by: currentUser?.id,
    }).select().single()

    const targetTrip = otherTrips.find(t => t.id === allocForm.target_trip_id)
    const { data: task } = await supabase.from('tasks').insert({
      type: 'approval_request',
      title: `Supplier receivable reallocation — ${tripReceivable?.trip_id}`,
      description: `Reallocation of ${fmtUSD(amount)} from trip ${tripReceivable?.trip_id} to trip ${targetTrip?.trip_id ?? ''}`,
      module: 'supplier_receivables',
      record_id: tripId,
      record_ref: tripReceivable?.trip_id ?? '',
      requested_by: currentUser?.id,
      assigned_to: allocForm.assignee,
      priority: 'normal',
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: allocForm.assignee,
      type: 'task_approval_request',
      title: 'New task: Reallocation approval',
      message: `${fmtUSD(amount)} from trip ${tripReceivable?.trip_id} to ${targetTrip?.trip_id ?? ''}`,
      task_id: task?.id,
      record_id: tripId,
      module: 'supplier_receivables',
    })

    await logActivity(
      [firstReceivable.receivable_id].filter(Boolean),
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

    await supabase.from('supplier_receivable_allocations').update({
      status: 'approved',
      approved_by: currentUser?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', allocId)

    // Find the target trip ID
    const { data: targetTrip } = await supabase
      .from('trips').select('id, trip_id').eq('trip_id', alloc.target_trip_id).single()

    if (targetTrip) {
      // Get the WAER of the ORIGINATING trip (where the receivable came from)
      const { data: originExpenses } = await supabase
        .from('trip_expenses')
        .select('amount, amount_ngn, currency')
        .eq('trip_id', tripId)

      // Calculate WAER from originating trip
      const usdExpenses = (originExpenses ?? []).filter(e => e.currency === 'USD')
      const totalUSD = usdExpenses.reduce((s, e) => s + Number(e.amount), 0)
      const totalNGN = usdExpenses.reduce((s, e) => s + Number(e.amount_ngn ?? 0), 0)
      const originWAER = totalUSD > 0 ? totalNGN / totalUSD : 1

      // Calculate NGN equivalent using originating trip WAER
      const amountNGN = Number(alloc.amount_usd) * originWAER

      const { data: expense } = await supabase.from('trip_expenses').insert({
        trip_id:      targetTrip.id,
        category:     'container',
        currency:     'USD',
        amount:       alloc.amount_usd,
        exchange_rate: originWAER,
        amount_ngn:   amountNGN,
        description:  `Supplier receivable applied — from trip ${tripReceivable?.trip_id} (WAER: ₦${originWAER.toFixed(2)}/$)`,
        expense_date: new Date().toISOString().split('T')[0],
        created_by:   currentUser?.id,
      }).select().single()

      if (expense) {
        await supabase.from('supplier_receivable_allocations').update({ trip_expense_id: expense.id }).eq('id', allocId)
      }
    }

    // Update all container receivables for this trip proportionally
    const totalRemaining = tripReceivable?.total_remaining_usd ?? 0
    const receivableContainers = containers.filter(c => c.receivable_id)
    for (const container of receivableContainers) {
      const proportion = totalRemaining > 0 ? container.remaining_usd / totalRemaining : 1 / containers.length
      const containerAmount = alloc.amount_usd * proportion
      const newApplied = Number(container.remaining_usd) - containerAmount
      await supabase.from('supplier_receivables')
        .update({
          total_applied_usd: supabase.rpc as any,
        }).eq('id', container.receivable_id)
    }

    // Simpler approach — just update total_applied on each receivable
    for (const container of receivableContainers) {
      const { data: rec } = await supabase.from('supplier_receivables')
        .select('total_applied_usd, gross_value_usd, agreed_value_usd, total_written_off_usd')
        .eq('id', container.receivable_id).single()
      if (!rec) continue
      const proportion = totalRemaining > 0 ? container.remaining_usd / totalRemaining : 1 / containers.length
      const containerAmount = alloc.amount_usd * proportion
      const newApplied = Number(rec.total_applied_usd) + containerAmount
      const effectiveVal = rec.agreed_value_usd ? Number(rec.agreed_value_usd) : Number(rec.gross_value_usd)
      const newRemaining = effectiveVal - newApplied - Number(rec.total_written_off_usd)
      const newStatus = newRemaining <= 0 ? 'fully_applied' : newApplied > 0 ? 'partially_applied' : 'open'
      await supabase.from('supplier_receivables').update({
        total_applied_usd: newApplied,
        status: newStatus,
      }).eq('id', container.receivable_id)
    }

    await logActivity(
      receivableContainers.map(c => c.receivable_id).filter(Boolean),
      'Reallocation approved',
      `${fmtUSD(alloc.amount_usd)} applied to trip ${alloc.target_trip_id}`,
      alloc.amount_usd
    )
    load()
  }

  async function submitWriteoff(e: React.FormEvent) {
    e.preventDefault()
    if (!writeoffForm.amount_usd || !writeoffForm.assignee) return
    setSavingWriteoff(true)
    const supabase = createClient()
    const amount = parseFloat(writeoffForm.amount_usd)
    const firstReceivable = containers.find(c => c.receivable_id)
    if (!firstReceivable) return

    await supabase.from('supplier_receivable_writeoffs').insert({
      receivable_id: firstReceivable.receivable_id,
      amount_usd: amount,
      reason: writeoffForm.reason || null,
      written_off_by: currentUser?.id,
    })

    const { data: task } = await supabase.from('tasks').insert({
      type: 'approval_request',
      title: `Write-off approval — ${tripReceivable?.trip_id}`,
      description: `Write-off of ${fmtUSD(amount)} for trip ${tripReceivable?.trip_id}`,
      module: 'supplier_receivables',
      record_id: tripId,
      record_ref: tripReceivable?.trip_id ?? '',
      requested_by: currentUser?.id,
      assigned_to: writeoffForm.assignee,
      priority: 'high',
    }).select().single()

    await supabase.from('notifications').insert({
      user_id: writeoffForm.assignee,
      type: 'task_approval_request',
      title: 'New task: Write-off approval',
      message: `Write-off of ${fmtUSD(amount)} — trip ${tripReceivable?.trip_id}`,
      task_id: task?.id,
      record_id: tripId,
      module: 'supplier_receivables',
    })

    // Update receivables proportionally
    const totalRemaining = tripReceivable?.total_remaining_usd ?? 0
    const receivableContainers = containers.filter(c => c.receivable_id)
    for (const container of receivableContainers) {
      const { data: rec } = await supabase.from('supplier_receivables')
        .select('total_applied_usd, gross_value_usd, agreed_value_usd, total_written_off_usd')
        .eq('id', container.receivable_id).single()
      if (!rec) continue
      const proportion = totalRemaining > 0 ? container.remaining_usd / totalRemaining : 1 / containers.length
      const containerAmount = amount * proportion
      const newWrittenOff = Number(rec.total_written_off_usd) + containerAmount
      const effectiveVal = rec.agreed_value_usd ? Number(rec.agreed_value_usd) : Number(rec.gross_value_usd)
      const newRemaining = effectiveVal - Number(rec.total_applied_usd) - newWrittenOff
      const newStatus = newRemaining <= 0 ? 'written_off' : 'partially_applied'
      await supabase.from('supplier_receivables').update({
        total_written_off_usd: newWrittenOff,
        status: newStatus,
      }).eq('id', container.receivable_id)
    }

    await logActivity(
      [firstReceivable.receivable_id],
      'Write-off submitted',
      writeoffForm.reason || 'No reason provided',
      amount
    )
    setSavingWriteoff(false)
    setWriteoffOpen(false)
    setWriteoffForm({ amount_usd: '', reason: '', assignee: '' })
    load()
  }

  // Notes helpers
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

  async function notifyMentions(mentions: { id: string; name: string }[], noteText: string) {
    if (!mentions.length || !currentUser) return
    const supabase = createClient()
    for (const mention of mentions) {
      if (mention.id === currentUser.id) continue
      await supabase.from('notifications').insert({
        user_id: mention.id,
        type: 'note_mention',
        title: `${currentUser.full_name ?? currentUser.email} mentioned you`,
        message: `In a supplier receivable note for ${tripReceivable?.trip_id}: "${noteText.slice(0, 60)}${noteText.length > 60 ? '…' : ''}"`,
        record_id: tripId,
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
    await supabase.from('supplier_receivable_notes').insert({
      trip_id: tripId, note: newNote.trim(), mentions, created_by: currentUser?.id,
    })
    await notifyMentions(mentions, newNote)
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
    await supabase.from('supplier_receivable_notes').insert({
      trip_id: tripId, note: replyText.trim(), parent_id: replyingTo.id, mentions, created_by: currentUser?.id,
    })
    await notifyMentions(mentions, replyText)
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
  if (!tripReceivable) return <div className="text-center py-16 text-gray-400">Trip not found.</div>

  const progressPct = tripReceivable.total_gross_value_usd > 0
    ? Math.min(((tripReceivable.total_applied_usd + tripReceivable.total_written_off_usd) / tripReceivable.total_gross_value_usd) * 100, 100)
    : 0

  const canAct = tripReceivable.status !== 'fully_applied' && tripReceivable.status !== 'written_off'

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
              <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{tripReceivable.trip_id}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border
                ${tripReceivable.status === 'fully_applied' ? 'bg-green-50 text-green-700 border-green-200'
                  : tripReceivable.status === 'partially_applied' ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : tripReceivable.status === 'written_off' ? 'bg-gray-100 text-gray-500 border-gray-200'
                  : 'bg-red-50 text-red-600 border-red-200'}`}>
                {tripReceivable.status === 'fully_applied' ? 'Fully applied'
                  : tripReceivable.status === 'partially_applied' ? 'Partially applied'
                  : tripReceivable.status === 'written_off' ? 'Written off' : 'Open'}
              </span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mt-0.5">{tripReceivable.trip_title}</h1>
            <p className="text-xs text-gray-400">{tripReceivable.supplier_name ?? '—'} · {tripReceivable.container_count} container{tripReceivable.container_count !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAct && (
            <button onClick={() => setReallocateOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <ArrowRightLeft size={14} /> Apply to trip
            </button>
          )}
          {tripReceivable.total_remaining_usd > 0 && (
            <button onClick={() => setWriteoffOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
              <XCircle size={14} /> Write off
            </button>
          )}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total missing pieces', value: tripReceivable.total_missing_pieces.toLocaleString(), color: 'text-red-600', sub: `across ${tripReceivable.container_count} container${tripReceivable.container_count !== 1 ? 's' : ''}` },
          { label: 'Gross value (USD)', value: fmtUSD(tripReceivable.total_gross_value_usd), color: 'text-gray-900', sub: 'Original claim' },
          { label: 'Applied (USD)', value: tripReceivable.total_applied_usd > 0 ? fmtUSD(tripReceivable.total_applied_usd) : '—', color: 'text-green-700', sub: 'To other trips' },
          { label: 'Remaining (USD)', value: tripReceivable.total_remaining_usd > 0 ? fmtUSD(tripReceivable.total_remaining_usd) : '—', color: tripReceivable.total_remaining_usd > 0 ? 'text-red-600' : 'text-green-600', sub: 'To be applied' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Resolution progress</p>
          <p className="text-sm font-bold text-brand-600">{progressPct.toFixed(1)}%</p>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${progressPct >= 100 ? 'bg-green-500' : progressPct >= 60 ? 'bg-brand-500' : 'bg-amber-400'}`}
            style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Applied + written off: <span className="font-semibold text-gray-700">{fmtUSD(tripReceivable.total_applied_usd + tripReceivable.total_written_off_usd)}</span></span>
          <span>Total gross: <span className="font-semibold text-gray-700">{fmtUSD(tripReceivable.total_gross_value_usd)}</span></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {[
            { key: 'containers', label: 'Containers', count: containers.length },
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

        {/* Containers tab */}
        {activeTab === 'containers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Container','Tracking No.','Pieces Purchased','Supplier Loaded','Missing','Unit Price','Gross Value (USD)','Remaining (USD)','Status'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {containers.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No containers found.</td></tr>
                ) : containers.map(c => {
                  const sCfg = CONTAINER_STATUS[c.status as keyof typeof CONTAINER_STATUS] ?? CONTAINER_STATUS.open
                  const hasIssue = c.missing_pieces > 0
                  return (
                    <tr key={c.container_id}
                      className={`border-b border-gray-50 transition-colors ${hasIssue ? 'hover:bg-red-50/20' : 'hover:bg-gray-50/30'}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`font-mono text-xs px-2 py-0.5 rounded font-medium ${hasIssue ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500'}`}>
                          {c.container_id}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{c.tracking_number ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{c.pieces_purchased?.toLocaleString() ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {c.supplier_loaded_pieces != null ? (
                          <span className={`font-medium ${c.supplier_loaded_pieces < (c.pieces_purchased ?? 0) ? 'text-amber-600' : 'text-gray-600'}`}>
                            {c.supplier_loaded_pieces.toLocaleString()}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {c.missing_pieces > 0
                          ? <span className="text-xs font-bold text-red-500">{c.missing_pieces.toLocaleString()}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">${c.unit_price_usd.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {c.gross_value_usd > 0
                          ? <span className="font-medium text-gray-700">{fmtUSD(c.gross_value_usd)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {c.remaining_usd > 0
                          ? <span className="text-xs font-semibold text-red-500">{fmtUSD(c.remaining_usd)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sCfg.color}`}>{sCfg.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Allocations tab */}
        {activeTab === 'allocations' && (
          <div className="overflow-x-auto">
            {allocations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <ArrowRightLeft size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No allocations yet.</p>
                {canAct && (
                  <button onClick={() => setReallocateOpen(true)}
                    className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                    <Plus size={12} /> Apply to a trip
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Target trip','Amount (USD)','%','Status','Requested by','Notes','Date',''].map(h => (
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
                      <span className="text-brand-600 text-xs font-semibold">{(log.performer_name ?? 'S')[0].toUpperCase()}</span>
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
                  Remaining: <span className="font-semibold text-brand-600">{fmtUSD(tripReceivable.total_remaining_usd)}</span>
                </p>
              </div>
              <button onClick={() => setReallocateOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <form onSubmit={submitReallocation} className="px-6 py-5 space-y-4">
              <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
                <p className="text-xs text-brand-700 font-medium">
                  Once approved, this creates a container payment trip expense on the target trip automatically.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Target trip <span className="text-red-400">*</span></label>
                <select required value={allocForm.target_trip_id} onChange={e => setAllocForm(f => ({ ...f, target_trip_id: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="">Select a trip...</option>
                  {otherTrips.map(t => (
                    <option key={t.id} value={t.id}>{t.trip_id} — {t.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (USD) <span className="text-red-400">*</span></label>
                  <AmountInput required value={allocForm.amount_usd}
                    onChange={v => {
                      const parsed = parseFloat(v) || 0
                      const maxVal = tripReceivable.total_remaining_usd
                      const capped = parsed > maxVal ? maxVal.toFixed(2) : v
                      const pct = tripReceivable.total_gross_value_usd > 0
                        ? (((parseFloat(capped) || 0) / tripReceivable.total_gross_value_usd) * 100).toFixed(1)
                        : ''
                      setAllocForm(f => ({ ...f, amount_usd: capped, percentage: pct }))
                    }}
                    placeholder="0.00"
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500
                      ${allocForm.amount_usd && parseFloat(allocForm.amount_usd) > tripReceivable.total_remaining_usd
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-200'}`} />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-400">Max: <span className="font-semibold text-brand-600">{fmtUSD(tripReceivable.total_remaining_usd)}</span></p>
                    {allocForm.amount_usd && parseFloat(allocForm.amount_usd) >= tripReceivable.total_remaining_usd && (
                      <p className="text-xs text-amber-600 font-medium">Full remaining amount</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Percentage — auto</label>
                  <div className="px-3 py-2.5 text-sm rounded-lg border bg-gray-50 border-gray-200 text-gray-600 font-medium">
                    {allocForm.percentage ? `${allocForm.percentage}%` : '—'}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                <textarea rows={2} value={allocForm.notes}
                  onChange={e => setAllocForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="e.g. Agreed amount after negotiation..." />
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
              <p className="text-xs text-red-700 font-medium">Write-offs require approval and are permanently recorded for audit.</p>
            </div>
            <form onSubmit={submitWriteoff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount to write off (USD) <span className="text-red-400">*</span></label>
                <AmountInput required value={writeoffForm.amount_usd}
                  onChange={v => setWriteoffForm(f => ({ ...f, amount_usd: v }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-xs text-gray-400 mt-1">Remaining: {fmtUSD(tripReceivable.total_remaining_usd)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason</label>
                <textarea rows={3} value={writeoffForm.reason}
                  onChange={e => setWriteoffForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="e.g. Supplier agreed to waive remaining balance..." />
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

