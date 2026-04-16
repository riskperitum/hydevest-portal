'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  RefreshCw, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, BookOpen
} from 'lucide-react'

interface AutoJournalResult {
  module: string
  created: number
  skipped: number
  errors: string[]
}

interface Period {
  id: string
  name: string
  period_start: string
  period_end: string
}

export default function AutoJournalEngine({
  selectedPeriod,
  onComplete,
}: {
  selectedPeriod: string
  onComplete: () => void
}) {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<AutoJournalResult[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [accounts, setAccounts] = useState<Record<string, string>>({})

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))

    if (selectedPeriod) {
      supabase.from('finance_periods').select('*').eq('id', selectedPeriod).single()
        .then(({ data }) => setPeriod(data))
    }

    // Build account code → id map
    supabase.from('finance_accounts').select('id, code').eq('is_active', true)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        for (const a of (data ?? [])) map[a.code] = a.id
        setAccounts(map)
      })
  }, [selectedPeriod])

  function acct(code: string) { return accounts[code] ?? null }

  async function runAutoJournals() {
    if (!selectedPeriod || !period || !currentUser) return
    setRunning(true)
    setResults([])
    const supabase = createClient()

    const periodStart = period.period_start
    const periodEnd   = period.period_end

    const allResults: AutoJournalResult[] = []

    // ── 1. SALES ORDERS ──────────────────────────────────────────
    {
      const result: AutoJournalResult = { module: 'Sales orders (revenue)', created: 0, skipped: 0, errors: [] }

      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select(`
          id, customer_payable, created_at,
          container:containers!sales_orders_container_id_fkey(
            id, estimated_landing_cost, unit_price_usd, pieces_purchased
          ),
          customer:customers!sales_orders_customer_id_fkey(name)
        `)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd + 'T23:59:59')

      for (const so of (salesOrders ?? [])) {
        // Check if journal already exists for this source
        const { data: existing } = await supabase
          .from('finance_journals')
          .select('id').eq('source_module', 'sales_orders').eq('source_id', so.id).single()
        if (existing) { result.skipped++; continue }

        const revenue      = Number(so.customer_payable)
        const landingCost  = Number((so.container as any)?.estimated_landing_cost ?? 0)
        const revAcctId    = acct('4001')
        const recvAcctId   = acct('1010')
        const cosAcctId    = acct('5001')
        const invAcctId    = acct('1020')

        if (!revAcctId || !recvAcctId || !cosAcctId || !invAcctId) {
          result.errors.push(`Missing account for sales order ${so.id}`)
          continue
        }

        const seq = Date.now().toString().slice(-5) + result.created
        const { data: journal } = await supabase.from('finance_journals').insert({
          journal_id:    `JNL-SO-${seq}`,
          period_id:     selectedPeriod,
          journal_date:  so.created_at.split('T')[0],
          description:   `Container sale — ${(so.customer as any)?.name ?? 'Customer'}`,
          type:          'auto_sale',
          source_module: 'sales_orders',
          source_id:     so.id,
          status:        'posted',
          created_by:    currentUser.id,
        }).select().single()

        if (journal) {
          await supabase.from('finance_journal_lines').insert([
            // DR Accounts receivable
            { journal_id: journal.id, account_id: recvAcctId, description: 'Sale to customer', debit_ngn: revenue, credit_ngn: 0 },
            // CR Revenue
            { journal_id: journal.id, account_id: revAcctId, description: 'Container sales revenue', debit_ngn: 0, credit_ngn: revenue },
            // DR Cost of sales
            { journal_id: journal.id, account_id: cosAcctId, description: 'Cost of container sold', debit_ngn: landingCost, credit_ngn: 0 },
            // CR Inventory
            { journal_id: journal.id, account_id: invAcctId, description: 'Inventory consumed', debit_ngn: 0, credit_ngn: landingCost },
          ])
          result.created++
        }
      }
      allResults.push(result)
    }

    // ── 2. RECOVERIES ────────────────────────────────────────────
    {
      const result: AutoJournalResult = { module: 'Recoveries (cash received)', created: 0, skipped: 0, errors: [] }

      const { data: recoveries } = await supabase
        .from('recoveries')
        .select(`
          id, amount_paid, payment_date, created_at,
          sales_order:sales_orders!recoveries_sales_order_id_fkey(
            customer:customers!sales_orders_customer_id_fkey(name)
          )
        `)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd + 'T23:59:59')

      for (const rec of (recoveries ?? [])) {
        const { data: existing } = await supabase
          .from('finance_journals')
          .select('id').eq('source_module', 'recoveries').eq('source_id', rec.id).single()
        if (existing) { result.skipped++; continue }

        const amount     = Number(rec.amount_paid)
        const bankAcctId = acct('1002') ?? acct('1001')
        const recvAcctId = acct('1010')

        if (!bankAcctId || !recvAcctId) {
          result.errors.push(`Missing account for recovery ${rec.id}`)
          continue
        }

        const seq = Date.now().toString().slice(-5) + result.created
        const { data: journal } = await supabase.from('finance_journals').insert({
          journal_id:    `JNL-REC-${seq}`,
          period_id:     selectedPeriod,
          journal_date:  rec.payment_date ?? rec.created_at.split('T')[0],
          description:   `Recovery — ${(rec.sales_order as any)?.customer?.name ?? 'Customer'}`,
          type:          'auto_recovery',
          source_module: 'recoveries',
          source_id:     rec.id,
          status:        'posted',
          created_by:    currentUser.id,
        }).select().single()

        if (journal) {
          await supabase.from('finance_journal_lines').insert([
            // DR Bank
            { journal_id: journal.id, account_id: bankAcctId, description: 'Cash received from customer', debit_ngn: amount, credit_ngn: 0 },
            // CR Accounts receivable
            { journal_id: journal.id, account_id: recvAcctId, description: 'Customer payment applied', debit_ngn: 0, credit_ngn: amount },
          ])
          result.created++
        }
      }
      allResults.push(result)
    }

    // ── 3. EXPENSES ──────────────────────────────────────────────
    {
      const result: AutoJournalResult = { module: 'Expenses', created: 0, skipped: 0, errors: [] }

      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, amount, category, description, expense_date, created_at')
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd + 'T23:59:59')
        .eq('approval_status', 'approved')

      const EXPENSE_ACCOUNT_MAP: Record<string, string> = {
        travel:        '6004',
        accommodation: '6004',
        meals:         '6011',
        office:        '6011',
        transport:     '5004',
        clearing:      '5003',
        warehouse:     '5006',
        other:         '6011',
      }

      for (const exp of (expenses ?? [])) {
        const { data: existing } = await supabase
          .from('finance_journals')
          .select('id').eq('source_module', 'expenses').eq('source_id', exp.id).single()
        if (existing) { result.skipped++; continue }

        const amount      = Number(exp.amount)
        const acctCode    = EXPENSE_ACCOUNT_MAP[exp.category?.toLowerCase()] ?? '6011'
        const expAcctId   = acct(acctCode)
        const bankAcctId  = acct('1002') ?? acct('1001')

        if (!expAcctId || !bankAcctId) {
          result.errors.push(`Missing account for expense ${exp.id}`)
          continue
        }

        const seq = Date.now().toString().slice(-5) + result.created
        const { data: journal } = await supabase.from('finance_journals').insert({
          journal_id:    `JNL-EXP-${seq}`,
          period_id:     selectedPeriod,
          journal_date:  exp.expense_date ?? exp.created_at.split('T')[0],
          description:   exp.description ?? `Expense — ${exp.category}`,
          type:          'auto_expense',
          source_module: 'expenses',
          source_id:     exp.id,
          status:        'posted',
          created_by:    currentUser.id,
        }).select().single()

        if (journal) {
          await supabase.from('finance_journal_lines').insert([
            // DR Expense account
            { journal_id: journal.id, account_id: expAcctId, description: exp.description ?? exp.category, debit_ngn: amount, credit_ngn: 0 },
            // CR Bank
            { journal_id: journal.id, account_id: bankAcctId, description: 'Payment from bank', debit_ngn: 0, credit_ngn: amount },
          ])
          result.created++
        }
      }
      allResults.push(result)
    }

    // ── 4. TRIP EXPENSES ─────────────────────────────────────────
    {
      const result: AutoJournalResult = { module: 'Trip expenses (container costs)', created: 0, skipped: 0, errors: [] }

      const { data: tripExpenses } = await supabase
        .from('trip_expenses')
        .select('id, amount, amount_ngn, currency, category, description, expense_date, created_at')
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd + 'T23:59:59')

      const TRIP_EXP_MAP: Record<string, string> = {
        container: '5001',
        shipping:  '5002',
        clearing:  '5003',
        transport: '5004',
        general:   '5006',
        other:     '5006',
      }

      for (const te of (tripExpenses ?? [])) {
        const { data: existing } = await supabase
          .from('finance_journals')
          .select('id').eq('source_module', 'trip_expenses').eq('source_id', te.id).single()
        if (existing) { result.skipped++; continue }

        const amount     = Number(te.amount_ngn ?? te.amount)
        const acctCode   = TRIP_EXP_MAP[te.category?.toLowerCase()] ?? '5006'
        const expAcctId  = acct(acctCode)
        const bankAcctId = acct('1002') ?? acct('1001')

        if (!expAcctId || !bankAcctId) {
          result.errors.push(`Missing account for trip expense ${te.id}`)
          continue
        }

        const seq = Date.now().toString().slice(-5) + result.created
        const { data: journal } = await supabase.from('finance_journals').insert({
          journal_id:    `JNL-TE-${seq}`,
          period_id:     selectedPeriod,
          journal_date:  te.expense_date ?? te.created_at.split('T')[0],
          description:   te.description ?? `Trip expense — ${te.category}`,
          type:          'auto_expense',
          source_module: 'trip_expenses',
          source_id:     te.id,
          status:        'posted',
          created_by:    currentUser.id,
        }).select().single()

        if (journal) {
          await supabase.from('finance_journal_lines').insert([
            { journal_id: journal.id, account_id: expAcctId,  description: te.description ?? te.category, debit_ngn: amount, credit_ngn: 0 },
            { journal_id: journal.id, account_id: bankAcctId, description: 'Payment from bank', debit_ngn: 0, credit_ngn: amount },
          ])
          result.created++
        }
      }
      allResults.push(result)
    }

    // ── 5. PARTNER WALLET TRANSACTIONS ───────────────────────────
    {
      const result: AutoJournalResult = { module: 'Partner wallet movements', created: 0, skipped: 0, errors: [] }

      const { data: walletTxns } = await supabase
        .from('partner_wallet_transactions')
        .select(`
          id, type, amount, description, created_at,
          partner:partners!partner_wallet_transactions_partner_id_fkey(name)
        `)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd + 'T23:59:59')

      for (const txn of (walletTxns ?? [])) {
        const { data: existing } = await supabase
          .from('finance_journals')
          .select('id').eq('source_module', 'partner_wallets').eq('source_id', txn.id).single()
        if (existing) { result.skipped++; continue }

        const amount         = Math.abs(Number(txn.amount))
        const partnerAcctId  = acct('2002')
        const bankAcctId     = acct('1002') ?? acct('1001')
        const partnerName    = (txn.partner as any)?.name ?? 'Partner'

        if (!partnerAcctId || !bankAcctId) {
          result.errors.push(`Missing account for wallet txn ${txn.id}`)
          continue
        }

        // Determine DR/CR based on transaction type
        let drAcctId = bankAcctId
        let crAcctId = partnerAcctId
        let desc = txn.description ?? txn.type

        if (txn.type === 'topup') {
          // Cash in from partner → DR Bank, CR Partner wallets payable
          drAcctId = bankAcctId; crAcctId = partnerAcctId
          desc = `Partner top-up received — ${partnerName}`
        } else if (txn.type === 'payout' || txn.type === 'debit') {
          // Cash out to partner → DR Partner wallets payable, CR Bank
          drAcctId = partnerAcctId; crAcctId = bankAcctId
          desc = `Partner payout — ${partnerName}`
        } else if (txn.type === 'allocation') {
          // Wallet → container: DR Container inventory, CR Partner wallets payable
          drAcctId = acct('1020') ?? bankAcctId; crAcctId = partnerAcctId
          desc = `Partner allocation to container — ${partnerName}`
        } else if (txn.type === 'sale_credit') {
          // Sale proceeds → wallet: DR nothing extra (already in receivables), CR Partner wallets
          drAcctId = acct('1010') ?? bankAcctId; crAcctId = partnerAcctId
          desc = `Container sale proceeds credited to partner — ${partnerName}`
        } else {
          result.skipped++; continue
        }

        const seq = Date.now().toString().slice(-5) + result.created
        const { data: journal } = await supabase.from('finance_journals').insert({
          journal_id:    `JNL-PW-${seq}`,
          period_id:     selectedPeriod,
          journal_date:  txn.created_at.split('T')[0],
          description:   desc,
          type:          'auto_partner',
          source_module: 'partner_wallets',
          source_id:     txn.id,
          status:        'posted',
          created_by:    currentUser.id,
        }).select().single()

        if (journal) {
          await supabase.from('finance_journal_lines').insert([
            { journal_id: journal.id, account_id: drAcctId, description: desc, debit_ngn: amount, credit_ngn: 0 },
            { journal_id: journal.id, account_id: crAcctId, description: desc, debit_ngn: 0, credit_ngn: amount },
          ])
          result.created++
        }
      }
      allResults.push(result)
    }

    setResults(allResults)
    setRunning(false)
    onComplete()
  }

  const totalCreated = results.reduce((s, r) => s + r.created, 0)
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0)
  const totalErrors  = results.reduce((s, r) => s + r.errors.length, 0)

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
        <h3 className="text-sm font-semibold text-blue-800 mb-1">Auto-journal engine</h3>
        <p className="text-xs text-blue-700 leading-relaxed">
          Automatically creates journal entries from existing system data for the selected period.
          Covers sales orders, recoveries, expenses, trip expenses and partner wallet movements.
          Already-journaled records are skipped automatically.
        </p>
      </div>

      {period && (
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <p className="text-xs text-gray-500">Running for period</p>
            <p className="text-sm font-semibold text-gray-800">{period.name}</p>
            <p className="text-xs text-gray-400">
              {new Date(period.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} —
              {new Date(period.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <button onClick={runAutoJournals} disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50">
            {running ? <><Loader2 size={14} className="animate-spin" /> Running…</> : <><RefreshCw size={14} /> Run auto-journals</>}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Journals created', value: totalCreated, color: 'text-green-700', bg: 'bg-green-50' },
              { label: 'Already journaled', value: totalSkipped, color: 'text-gray-600', bg: 'bg-gray-50' },
              { label: 'Errors', value: totalErrors, color: totalErrors > 0 ? 'text-red-600' : 'text-green-700', bg: totalErrors > 0 ? 'bg-red-50' : 'bg-green-50' },
            ].map(m => (
              <div key={m.label} className={`${m.bg} rounded-xl p-3 border border-white`}>
                <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Per-module breakdown */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Module breakdown</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {results.map(r => (
                <div key={r.module}>
                  <button className="w-full text-left px-4 py-3 hover:bg-gray-50/50 transition-colors"
                    onClick={() => setExpanded(expanded === r.module ? null : r.module)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BookOpen size={14} className="text-brand-600 shrink-0" />
                        <span className="text-sm font-medium text-gray-800">{r.module}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-600 font-medium">{r.created} created</span>
                        <span className="text-gray-400">{r.skipped} skipped</span>
                        {r.errors.length > 0 && (
                          <span className="text-red-600 font-medium">{r.errors.length} errors</span>
                        )}
                        {expanded === r.module ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
                      </div>
                    </div>
                  </button>
                  {expanded === r.module && r.errors.length > 0 && (
                    <div className="px-4 pb-3 bg-red-50/30">
                      {r.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-600 py-1">
                          <AlertCircle size={12} className="shrink-0 mt-0.5" />
                          {err}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {totalErrors === 0 && (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
              <CheckCircle2 size={15} className="text-green-600 shrink-0" />
              <p className="text-sm font-medium text-green-700">
                Auto-journaling complete — {totalCreated} journal{totalCreated !== 1 ? 's' : ''} created, {totalSkipped} skipped (already done).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

