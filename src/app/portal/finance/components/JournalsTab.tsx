'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Loader2, Eye, RotateCcw, Check,
  ChevronDown, ChevronUp, AlertCircle, BookOpen
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import AmountInput from '@/components/ui/AmountInput'

interface Journal {
  id: string
  journal_id: string
  journal_date: string
  description: string
  type: string
  status: string
  source_module: string | null
  period_name: string
  total_debits: number
  total_credits: number
  is_balanced: boolean
  lines: JournalLine[]
}

interface JournalLine {
  id: string
  account_id: string
  account_code: string
  account_name: string
  description: string | null
  debit_ngn: number
  credit_ngn: number
}

interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface Period {
  id: string
  name: string
  status: string
}

const fmt = (n: number) => n === 0 ? '—' : `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TYPE_COLOR: Record<string, string> = {
  manual:          'bg-gray-100 text-gray-600',
  auto_sale:       'bg-blue-50 text-blue-700',
  auto_recovery:   'bg-green-50 text-green-700',
  auto_expense:    'bg-amber-50 text-amber-700',
  auto_partner:    'bg-purple-50 text-purple-700',
  opening_balance: 'bg-brand-50 text-brand-700',
}

export default function JournalsTab({
  selectedPeriod,
}: {
  selectedPeriod: string
}) {
  const [journals, setJournals] = useState<Journal[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  // New journal modal
  const [newOpen, setNewOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [journalForm, setJournalForm] = useState({
    period_id: selectedPeriod,
    journal_date: new Date().toISOString().split('T')[0],
    description: '',
    type: 'manual',
  })
  const [lines, setLines] = useState<{
    account_id: string
    description: string
    debit_ngn: string
    credit_ngn: string
  }[]>([
    { account_id: '', description: '', debit_ngn: '', credit_ngn: '' },
    { account_id: '', description: '', debit_ngn: '', credit_ngn: '' },
  ])

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: journalData }, { data: accountData }, { data: periodData }] = await Promise.all([
      supabase.from('finance_journals')
        .select(`
          id, journal_id, journal_date, description, type, status,
          source_module,
          period:finance_periods!finance_journals_period_id_fkey(name),
          lines:finance_journal_lines(
            id, account_id, description, debit_ngn, credit_ngn,
            account:finance_accounts!finance_journal_lines_account_id_fkey(code, name)
          )
        `)
        .order('journal_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('finance_accounts')
        .select('id, code, name, type')
        .eq('is_active', true)
        .neq('subtype', 'header')
        .order('code'),
      supabase.from('finance_periods')
        .select('id, name, status')
        .order('period_start', { ascending: false }),
    ])

    setAccounts(accountData ?? [])
    setPeriods(periodData ?? [])

    setJournals((journalData ?? []).map(j => {
      const jlines = ((j.lines as any[]) ?? []).map(l => ({
        id: l.id,
        account_id: l.account_id,
        account_code: (l.account as any)?.code ?? '—',
        account_name: (l.account as any)?.name ?? '—',
        description: l.description,
        debit_ngn: Number(l.debit_ngn),
        credit_ngn: Number(l.credit_ngn),
      }))
      const totalDebits  = jlines.reduce((s, l) => s + l.debit_ngn, 0)
      const totalCredits = jlines.reduce((s, l) => s + l.credit_ngn, 0)
      return {
        id: j.id,
        journal_id: j.journal_id,
        journal_date: j.journal_date,
        description: j.description,
        type: j.type,
        status: j.status,
        source_module: j.source_module,
        period_name: (j.period as any)?.name ?? '—',
        total_debits: totalDebits,
        total_credits: totalCredits,
        is_balanced: Math.abs(totalDebits - totalCredits) < 0.01,
        lines: jlines,
      }
    }))

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  function addLine() {
    setLines(prev => [...prev, { account_id: '', description: '', debit_ngn: '', credit_ngn: '' }])
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateLine(i: number, field: string, value: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  const totalDebits  = lines.reduce((s, l) => s + (parseFloat(l.debit_ngn) || 0), 0)
  const totalCredits = lines.reduce((s, l) => s + (parseFloat(l.credit_ngn) || 0), 0)
  const isBalanced   = Math.abs(totalDebits - totalCredits) < 0.01
  const canSave      = isBalanced && totalDebits > 0 && journalForm.description && journalForm.period_id &&
    lines.every(l => l.account_id && (parseFloat(l.debit_ngn) > 0 || parseFloat(l.credit_ngn) > 0))

  async function saveJournal(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    const supabase = createClient()

    // Get next journal number
    const seq = Date.now().toString().slice(-5)
    const journalId = `JNL-${seq}`

    const { data: journal } = await supabase.from('finance_journals').insert({
      journal_id:   journalId,
      period_id:    journalForm.period_id,
      journal_date: journalForm.journal_date,
      description:  journalForm.description,
      type:         journalForm.type,
      status:       'posted',
      created_by:   currentUser?.id,
    }).select().single()

    if (journal) {
      const lineInserts = lines
        .filter(l => l.account_id && (parseFloat(l.debit_ngn) > 0 || parseFloat(l.credit_ngn) > 0))
        .map(l => ({
          journal_id:  journal.id,
          account_id:  l.account_id,
          description: l.description || null,
          debit_ngn:   parseFloat(l.debit_ngn) || 0,
          credit_ngn:  parseFloat(l.credit_ngn) || 0,
        }))
      await supabase.from('finance_journal_lines').insert(lineInserts)
    }

    setSaving(false)
    setNewOpen(false)
    setLines([
      { account_id: '', description: '', debit_ngn: '', credit_ngn: '' },
      { account_id: '', description: '', debit_ngn: '', credit_ngn: '' },
    ])
    load()
  }

  async function reverseJournal(journal: Journal) {
    if (!confirm(`Reverse journal ${journal.journal_id}? This creates a new reversing entry.`)) return
    const supabase = createClient()
    const seq = Date.now().toString().slice(-5)

    const { data: reversal } = await supabase.from('finance_journals').insert({
      journal_id:   `JNL-${seq}-REV`,
      period_id:    periods.find(p => p.status === 'open' && !p.name.includes('Opening'))?.id,
      journal_date: new Date().toISOString().split('T')[0],
      description:  `Reversal of ${journal.journal_id} — ${journal.description}`,
      type:         'manual',
      status:       'posted',
      reversed_by:  journal.id,
      created_by:   currentUser?.id,
    }).select().single()

    if (reversal) {
      const reverseLines = journal.lines.map(l => ({
        journal_id:  reversal.id,
        account_id:  l.account_id,
        description: `Reversal — ${l.description ?? ''}`,
        debit_ngn:   l.credit_ngn,
        credit_ngn:  l.debit_ngn,
      }))
      await supabase.from('finance_journal_lines').insert(reverseLines)

      // Mark original as reversed
      await supabase.from('finance_journals').update({ status: 'reversed', reversed_by: reversal.id }).eq('id', journal.id)
    }

    load()
  }

  const filteredJournals = selectedPeriod
    ? journals.filter(j => true) // show all, period filter done server side if needed
    : journals

  return (
    <div className="p-5 space-y-4">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Journal entries</h2>
          <p className="text-xs text-gray-400 mt-0.5">Double-entry bookkeeping ledger</p>
        </div>
        <button onClick={() => { setNewOpen(true); setJournalForm(f => ({ ...f, period_id: selectedPeriod })) }}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
          <Plus size={14} /> New journal entry
        </button>
      </div>

      {/* Journal list */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 border-b border-gray-50 animate-pulse flex gap-4">
              <div className="h-4 bg-gray-100 rounded w-1/4" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))
        ) : journals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <BookOpen size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No journal entries yet.</p>
            <button onClick={() => setNewOpen(true)}
              className="mt-1 text-xs font-medium text-brand-600 hover:underline">
              Create first journal entry
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {journals.map(j => (
              <div key={j.id}>
                <button className="w-full text-left px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpanded(expanded === j.id ? null : j.id)}>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium shrink-0">
                      {j.journal_id}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${TYPE_COLOR[j.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {j.type.replace('_', ' ')}
                    </span>
                    {j.status === 'reversed' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-50 text-red-600">Reversed</span>
                    )}
                    {!j.is_balanced && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                        <AlertCircle size={12} /> Unbalanced
                      </span>
                    )}
                    <span className="text-xs text-gray-500 flex-1 truncate">{j.description}</span>
                    <div className="flex items-center gap-4 shrink-0 text-xs text-gray-400">
                      <span>{j.period_name}</span>
                      <span>{new Date(j.journal_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span className={`font-semibold ${j.is_balanced ? 'text-gray-700' : 'text-red-600'}`}>
                        DR {fmt(j.total_debits)}
                      </span>
                    </div>
                    {expanded === j.id ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                  </div>
                </button>

                {/* Expanded lines */}
                {expanded === j.id && (
                  <div className="px-5 pb-4 bg-gray-50/30 border-t border-gray-100">
                    <table className="w-full text-xs mt-3">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="pb-2 text-left font-medium text-gray-400 w-24">Account</th>
                          <th className="pb-2 text-left font-medium text-gray-400">Name</th>
                          <th className="pb-2 text-left font-medium text-gray-400">Description</th>
                          <th className="pb-2 text-right font-medium text-gray-400 w-36">Debit (NGN)</th>
                          <th className="pb-2 text-right font-medium text-gray-400 w-36">Credit (NGN)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {j.lines.map(line => (
                          <tr key={line.id}>
                            <td className="py-2 font-mono text-gray-600">{line.account_code}</td>
                            <td className="py-2 text-gray-700">{line.account_name}</td>
                            <td className="py-2 text-gray-400">{line.description ?? '—'}</td>
                            <td className="py-2 text-right font-medium text-gray-800">{fmt(line.debit_ngn)}</td>
                            <td className="py-2 text-right font-medium text-gray-800">{fmt(line.credit_ngn)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200">
                          <td colSpan={3} className="pt-2 text-xs font-semibold text-gray-500">TOTALS</td>
                          <td className="pt-2 text-right font-bold text-gray-900">{fmt(j.total_debits)}</td>
                          <td className="pt-2 text-right font-bold text-gray-900">{fmt(j.total_credits)}</td>
                        </tr>
                        {!j.is_balanced && (
                          <tr>
                            <td colSpan={5} className="pt-1 text-right text-xs text-red-600 font-medium">
                              ⚠ Difference: {fmt(Math.abs(j.total_debits - j.total_credits))}
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>

                    {/* Actions */}
                    {j.status === 'posted' && j.type === 'manual' && (
                      <div className="flex justify-end mt-3 gap-2">
                        <button onClick={() => reverseJournal(j)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
                          <RotateCcw size={12} /> Reverse
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New journal modal */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)}
        title="New journal entry" size="xl">
        <form onSubmit={saveJournal} className="space-y-5">

          {/* Header fields */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Period <span className="text-red-400">*</span>
              </label>
              <select required value={journalForm.period_id}
                onChange={e => setJournalForm(f => ({ ...f, period_id: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Select period...</option>
                {periods.filter(p => p.status === 'open').map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Date <span className="text-red-400">*</span>
              </label>
              <input type="date" required value={journalForm.journal_date}
                onChange={e => setJournalForm(f => ({ ...f, journal_date: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select value={journalForm.type}
                onChange={e => setJournalForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="manual">Manual</option>
                <option value="opening_balance">Opening balance</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description <span className="text-red-400">*</span>
            </label>
            <input required value={journalForm.description}
              onChange={e => setJournalForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Monthly rent payment — January 2025"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {/* Journal lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Journal lines</label>
              <button type="button" onClick={addLine}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
                <Plus size={12} /> Add line
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Account</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Description</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-36">Debit (NGN)</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-36">Credit (NGN)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <select value={line.account_id}
                          onChange={e => updateLine(i, 'account_id', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                          <option value="">Select account...</option>
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input value={line.description}
                          onChange={e => updateLine(i, 'description', e.target.value)}
                          placeholder="Optional note"
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.01" min="0"
                          value={line.debit_ngn}
                          onChange={e => updateLine(i, 'debit_ngn', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.01" min="0"
                          value={line.credit_ngn}
                          onChange={e => updateLine(i, 'credit_ngn', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-right" />
                      </td>
                      <td className="px-3 py-2">
                        {lines.length > 2 && (
                          <button type="button" onClick={() => removeLine(i)}
                            className="text-gray-300 hover:text-red-500 transition-colors">
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={2} className="px-3 py-2.5 text-xs font-semibold text-gray-500">TOTALS</td>
                    <td className={`px-3 py-2.5 text-right text-sm font-bold ${isBalanced ? 'text-green-700' : 'text-red-600'}`}>
                      ₦{totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-sm font-bold ${isBalanced ? 'text-green-700' : 'text-red-600'}`}>
                      ₦{totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Balance indicator */}
            <div className={`mt-2 flex items-center gap-2 text-xs font-medium ${isBalanced && totalDebits > 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {isBalanced && totalDebits > 0 ? (
                <><Check size={13} /> Journal is balanced — debits equal credits</>
              ) : totalDebits === 0 ? (
                <><AlertCircle size={13} /> Add debit and credit amounts</>
              ) : (
                <><AlertCircle size={13} /> Difference: ₦{Math.abs(totalDebits - totalCredits).toLocaleString(undefined, { minimumFractionDigits: 2 })}</>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setNewOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !canSave}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Posting…</> : <><Check size={14} /> Post journal</>}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

