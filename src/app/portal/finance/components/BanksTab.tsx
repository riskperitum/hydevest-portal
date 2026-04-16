'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Loader2, Building2, Check, X,
  AlertCircle, CheckCircle2, Upload
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import AmountInput from '@/components/ui/AmountInput'

interface BankAccount {
  id: string
  code: string
  name: string
  bank_name: string | null
  bank_account_number: string | null
  balance: number
}

interface BankStatement {
  id: string
  transaction_date: string
  description: string
  debit_amount: number
  credit_amount: number
  balance: number | null
  reference: string | null
  is_reconciled: boolean
  journal_line_id: string | null
}

interface Period {
  id: string
  name: string
  status: string
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function BanksTab({ selectedPeriod }: { selectedPeriod: string }) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedBank, setSelectedBank] = useState<string>('')
  const [statements, setStatements] = useState<BankStatement[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  // Add statement line modal
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stmtForm, setStmtForm] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    description: '',
    debit_amount: '',
    credit_amount: '',
    reference: '',
    balance: '',
  })

  // Reconciliation summary
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: accountData }, { data: periodData }] = await Promise.all([
      supabase.from('finance_accounts')
        .select('id, code, name, bank_name, bank_account_number')
        .eq('is_bank', true)
        .eq('is_active', true)
        .order('code'),
      supabase.from('finance_periods')
        .select('id, name, status')
        .order('period_start', { ascending: false }),
    ])

    setPeriods(periodData ?? [])

    // Calculate balance per bank account from journals
    const { data: lineData } = await supabase
      .from('finance_journal_lines')
      .select(`
        account_id, debit_ngn, credit_ngn,
        journal:finance_journals!finance_journal_lines_journal_id_fkey(status)
      `)
      .in('account_id', (accountData ?? []).map(a => a.id))

    const balanceMap: Record<string, number> = {}
    for (const line of (lineData ?? [])) {
      const j = line.journal as any
      if (j?.status !== 'posted') continue
      if (!balanceMap[line.account_id]) balanceMap[line.account_id] = 0
      balanceMap[line.account_id] += Number(line.debit_ngn) - Number(line.credit_ngn)
    }

    const banks = (accountData ?? []).map(a => ({
      ...a,
      balance: balanceMap[a.id] ?? 0,
    }))

    setBankAccounts(banks)

    if (!selectedBank && banks.length > 0) {
      setSelectedBank(banks[0].id)
    }

    setLoading(false)
  }, [selectedBank])

  const loadStatements = useCallback(async () => {
    if (!selectedBank) return
    const supabase = createClient()
    const { data } = await supabase
      .from('finance_bank_statements')
      .select('*')
      .eq('account_id', selectedBank)
      .order('transaction_date', { ascending: false })
    setStatements((data ?? []).map(s => ({
      ...s,
      debit_amount:  Number(s.debit_amount),
      credit_amount: Number(s.credit_amount),
      balance:       s.balance ? Number(s.balance) : null,
    })))
  }, [selectedBank])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  useEffect(() => { loadStatements() }, [loadStatements])

  async function addStatement(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedBank) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('finance_bank_statements').insert({
      account_id:       selectedBank,
      period_id:        selectedPeriod || null,
      transaction_date: stmtForm.transaction_date,
      description:      stmtForm.description,
      debit_amount:     parseFloat(stmtForm.debit_amount) || 0,
      credit_amount:    parseFloat(stmtForm.credit_amount) || 0,
      balance:          stmtForm.balance ? parseFloat(stmtForm.balance) : null,
      reference:        stmtForm.reference || null,
      is_reconciled:    false,
      created_by:       currentUser?.id,
    })
    setSaving(false)
    setAddOpen(false)
    setStmtForm({ transaction_date: new Date().toISOString().split('T')[0], description: '', debit_amount: '', credit_amount: '', reference: '', balance: '' })
    loadStatements()
  }

  async function toggleReconciled(stmt: BankStatement) {
    const supabase = createClient()
    await supabase.from('finance_bank_statements')
      .update({ is_reconciled: !stmt.is_reconciled })
      .eq('id', stmt.id)
    loadStatements()
  }

  async function deleteStatement(id: string) {
    if (!confirm('Delete this statement line?')) return
    const supabase = createClient()
    await supabase.from('finance_bank_statements').delete().eq('id', id)
    loadStatements()
  }

  const selectedBankData = bankAccounts.find(b => b.id === selectedBank)
  const totalCredits    = statements.reduce((s, st) => s + st.credit_amount, 0)
  const totalDebits     = statements.reduce((s, st) => s + st.debit_amount, 0)
  const reconciledCount = statements.filter(s => s.is_reconciled).length
  const unreconciledCount = statements.filter(s => !s.is_reconciled).length

  const bookBalance     = selectedBankData?.balance ?? 0
  const statementClose  = parseFloat(closingBalance) || 0
  const statementOpen   = parseFloat(openingBalance) || 0
  const reconDiff       = statementClose - bookBalance

  return (
    <div className="p-5 space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Bank reconciliation</h2>
          <p className="text-xs text-gray-400 mt-0.5">Match bank statement lines against journal entries</p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
          <Plus size={14} /> Add statement line
        </button>
      </div>

      {/* Bank account selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {bankAccounts.map(bank => (
          <button key={bank.id}
            onClick={() => setSelectedBank(bank.id)}
            className={`text-left p-4 rounded-xl border-2 transition-all
              ${selectedBank === bank.id ? 'border-brand-400 bg-brand-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} className={selectedBank === bank.id ? 'text-brand-600' : 'text-gray-400'} />
              <span className={`text-sm font-semibold ${selectedBank === bank.id ? 'text-brand-700' : 'text-gray-800'}`}>
                {bank.name}
              </span>
            </div>
            {bank.bank_name && <p className="text-xs text-gray-500">{bank.bank_name}</p>}
            {bank.bank_account_number && <p className="text-xs font-mono text-gray-400">{bank.bank_account_number}</p>}
            <p className={`text-base font-bold mt-2 ${selectedBank === bank.id ? 'text-brand-700' : 'text-gray-900'}`}>
              {fmt(bank.balance)}
            </p>
            <p className="text-xs text-gray-400">Book balance</p>
          </button>
        ))}

        {bankAccounts.length === 0 && !loading && (
          <div className="col-span-3 p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Building2 size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No bank accounts set up.</p>
            <p className="text-xs text-gray-400 mt-1">
              Go to Chart of Accounts → Add account → check "This is a bank account"
            </p>
          </div>
        )}
      </div>

      {/* Reconciliation summary */}
      {selectedBank && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Reconciliation summary — {selectedBankData?.name}</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Book balance (ledger)</p>
              <p className="text-base font-bold text-brand-700">{fmt(bookBalance)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Total credits (receipts)</p>
              <p className="text-base font-bold text-green-700">{fmt(totalCredits)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Total debits (payments)</p>
              <p className="text-base font-bold text-red-600">{fmt(totalDebits)}</p>
            </div>
            <div className={`rounded-xl p-3 ${Math.abs(reconDiff) < 1 && statementClose > 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
              <p className="text-xs text-gray-400 mb-1">Reconciliation difference</p>
              <p className={`text-base font-bold ${Math.abs(reconDiff) < 1 && statementClose > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                {statementClose > 0 ? fmt(Math.abs(reconDiff)) : '—'}
              </p>
            </div>
          </div>

          {/* Opening / closing balance inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Bank statement opening balance</label>
              <AmountInput value={openingBalance} onChange={setOpeningBalance} placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Bank statement closing balance</label>
              <AmountInput value={closingBalance} onChange={setClosingBalance} placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          {statementClose > 0 && Math.abs(reconDiff) < 1 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl border border-green-200">
              <CheckCircle2 size={16} className="text-green-600" />
              <p className="text-sm font-medium text-green-700">Bank account is reconciled — book balance matches statement.</p>
            </div>
          )}
          {statementClose > 0 && Math.abs(reconDiff) >= 1 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <AlertCircle size={16} className="text-amber-600" />
              <p className="text-sm font-medium text-amber-700">
                Difference of {fmt(Math.abs(reconDiff))} — check for unmatched items or timing differences.
              </p>
            </div>
          )}

          {/* Progress */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="text-green-600 font-medium">{reconciledCount} reconciled</span>
            <span>·</span>
            <span className="text-amber-600 font-medium">{unreconciledCount} unreconciled</span>
            <span>·</span>
            <span>{statements.length} total lines</span>
          </div>
        </div>
      )}

      {/* Statement lines table */}
      {selectedBank && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Statement lines</h3>
            <p className="text-xs text-gray-400">Click the tick to mark as reconciled</p>
          </div>
          {statements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Building2 size={24} className="text-gray-200" />
              <p className="text-sm text-gray-400">No statement lines yet.</p>
              <button onClick={() => setAddOpen(true)}
                className="text-xs font-medium text-brand-600 hover:underline">
                Add first statement line
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Date','Description','Reference','Debit','Credit','Balance','Reconciled',''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {statements.map(stmt => (
                    <tr key={stmt.id} className={`hover:bg-gray-50/50 transition-colors ${stmt.is_reconciled ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                        {new Date(stmt.transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 max-w-[180px] truncate">{stmt.description}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-500 whitespace-nowrap">{stmt.reference ?? '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {stmt.debit_amount > 0
                          ? <span className="text-xs font-medium text-red-600">{fmt(stmt.debit_amount)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {stmt.credit_amount > 0
                          ? <span className="text-xs font-medium text-green-600">{fmt(stmt.credit_amount)}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                        {stmt.balance != null ? fmt(stmt.balance) : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button onClick={() => toggleReconciled(stmt)}
                          className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors
                            ${stmt.is_reconciled ? 'bg-green-500 text-white' : 'border-2 border-gray-200 hover:border-green-400'}`}>
                          {stmt.is_reconciled && <Check size={12} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {!stmt.is_reconciled && (
                          <button onClick={() => deleteStatement(stmt.id)}
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                            <X size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add statement modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)}
        title="Add bank statement line" size="sm">
        <form onSubmit={addStatement} className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-700 font-medium">
              Bank: {selectedBankData?.name ?? '—'}
            </p>
            <p className="text-xs text-blue-600 mt-0.5">Enter the transaction exactly as it appears on your bank statement.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Date <span className="text-red-400">*</span>
              </label>
              <input type="date" required value={stmtForm.transaction_date}
                onChange={e => setStmtForm(f => ({ ...f, transaction_date: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Reference</label>
              <input value={stmtForm.reference}
                onChange={e => setStmtForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="e.g. TRF/123456"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description <span className="text-red-400">*</span>
            </label>
            <input required value={stmtForm.description}
              onChange={e => setStmtForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Transfer from Ebun Adeleye"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Debit (money out)</label>
              <AmountInput value={stmtForm.debit_amount}
                onChange={v => setStmtForm(f => ({ ...f, debit_amount: v }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Credit (money in)</label>
              <AmountInput value={stmtForm.credit_amount}
                onChange={v => setStmtForm(f => ({ ...f, credit_amount: v }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Running balance (optional)</label>
            <AmountInput value={stmtForm.balance}
              onChange={v => setStmtForm(f => ({ ...f, balance: v }))}
              placeholder="Balance after this transaction"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setAddOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !stmtForm.description}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Plus size={14} /> Add line</>}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

