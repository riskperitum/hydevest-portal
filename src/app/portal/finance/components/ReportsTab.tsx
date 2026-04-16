'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download, Loader2, BarChart3, Scale, BookOpen, TrendingUp, Clock } from 'lucide-react'

interface Account {
  id: string
  code: string
  name: string
  type: string
  subtype: string | null
  sort_order: number
}

interface AccountBalance {
  account: Account
  debit: number
  credit: number
  balance: number
}

interface Period {
  id: string
  name: string
  period_start: string
  period_end: string
  is_opening: boolean
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtAbs = (n: number) => n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n)

export default function ReportsTab({
  selectedPeriod,
  usdRate,
  showUSD,
}: {
  selectedPeriod: string
  usdRate: number
  showUSD: boolean
}) {
  const [activeReport, setActiveReport] = useState<'pl' | 'bs' | 'tb' | 'cf' | 'aged_recv' | 'aged_pay'>('pl')
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [allBalances, setAllBalances] = useState<AccountBalance[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('Hydevest Solutions Limited')
  const [periodName, setPeriodName] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  const display = (n: number) => showUSD
    ? `$${(n / usdRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : fmt(n)
  const displayAbs = (n: number) => {
    const val = showUSD ? n / usdRate : n
    return val < 0 ? `(${showUSD ? '$' : '₦'}${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : display(n)
  }

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: accountData }, { data: periodData }, { data: settings }] = await Promise.all([
      supabase.from('finance_accounts').select('*').eq('is_active', true).neq('subtype', 'header').order('sort_order').order('code'),
      supabase.from('finance_periods').select('*').order('period_start', { ascending: false }),
      supabase.from('finance_settings').select('key, value'),
    ])

    setPeriods(periodData ?? [])
    const cn = settings?.find(s => s.key === 'company_name')?.value
    if (cn) setCompanyName(cn)

    const currentPeriod = (periodData ?? []).find(p => p.id === selectedPeriod)
    if (currentPeriod) {
      setPeriodName(currentPeriod.name)
      setPeriodStart(new Date(currentPeriod.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
      setPeriodEnd(new Date(currentPeriod.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
    }

    // Load ALL journal lines (for balance sheet — cumulative)
    const { data: allJournals } = await supabase
      .from('finance_journals').select('id').eq('status', 'posted')
    const allJournalIds = (allJournals ?? []).map(j => j.id)

    let allLines: any[] = []
    if (allJournalIds.length > 0) {
      const { data } = await supabase
        .from('finance_journal_lines')
        .select('account_id, debit_ngn, credit_ngn')
        .in('journal_id', allJournalIds)
      allLines = data ?? []
    }

    // Load period-specific journal lines (for P&L)
    let periodLines: any[] = []
    if (selectedPeriod) {
      const { data: periodJournals } = await supabase
        .from('finance_journals').select('id')
        .eq('period_id', selectedPeriod).eq('status', 'posted')
      const periodJournalIds = (periodJournals ?? []).map(j => j.id)
      if (periodJournalIds.length > 0) {
        const { data } = await supabase
          .from('finance_journal_lines')
          .select('account_id, debit_ngn, credit_ngn')
          .in('journal_id', periodJournalIds)
        periodLines = data ?? []
      }
    }

    const accounts = accountData ?? []

    // Build balance maps
    const periodDR: Record<string, number> = {}
    const periodCR: Record<string, number> = {}
    for (const line of periodLines) {
      periodDR[line.account_id] = (periodDR[line.account_id] ?? 0) + Number(line.debit_ngn)
      periodCR[line.account_id] = (periodCR[line.account_id] ?? 0) + Number(line.credit_ngn)
    }

    const allDR: Record<string, number> = {}
    const allCR: Record<string, number> = {}
    for (const line of allLines) {
      allDR[line.account_id] = (allDR[line.account_id] ?? 0) + Number(line.debit_ngn)
      allCR[line.account_id] = (allCR[line.account_id] ?? 0) + Number(line.credit_ngn)
    }

    // Period balances (for P&L, TB)
    const periodBals: AccountBalance[] = accounts.map(a => {
      const dr = periodDR[a.id] ?? 0
      const cr = periodCR[a.id] ?? 0
      // Normal balance: assets/expenses = DR, liabilities/equity/revenue = CR
      const bal = ['asset', 'expense', 'tax'].includes(a.type) ? dr - cr : cr - dr
      return { account: a, debit: dr, credit: cr, balance: bal }
    })

    // All-time balances (for BS)
    const allBals: AccountBalance[] = accounts.map(a => {
      const dr = allDR[a.id] ?? 0
      const cr = allCR[a.id] ?? 0
      const bal = ['asset', 'expense', 'tax'].includes(a.type) ? dr - cr : cr - dr
      return { account: a, debit: dr, credit: cr, balance: bal }
    })

    setBalances(periodBals)
    setAllBalances(allBals)
    setLoading(false)
  }, [selectedPeriod])

  useEffect(() => { load() }, [load])

  // Helper to sum balances by subtype
  const sumBy = (bals: AccountBalance[], type: string, subtype?: string) =>
    bals.filter(b => b.account.type === type && (!subtype || b.account.subtype === subtype))
      .reduce((s, b) => s + b.balance, 0)

  const sumBySubtypes = (bals: AccountBalance[], type: string, subtypes: string[]) =>
    bals.filter(b => b.account.type === type && subtypes.includes(b.account.subtype ?? ''))
      .reduce((s, b) => s + b.balance, 0)

  function printReport() {
    window.print()
  }

  // ── P&L figures ─────────────────────────────────────────────────────────
  const revenue    = sumBy(balances, 'revenue')
  const cos        = sumBySubtypes(balances, 'expense', ['cost_of_sales'])
  const grossProfit = revenue - cos
  const opex       = sumBySubtypes(balances, 'expense', ['opex'])
  const opProfit   = grossProfit - opex
  const taxExp     = sumBy(balances, 'tax')
  const netProfit  = opProfit - taxExp

  // ── B/S figures ──────────────────────────────────────────────────────────
  const currentAssets    = sumBy(allBalances, 'asset', 'current_asset')
  const nonCurrentAssets = sumBy(allBalances, 'asset', 'non_current_asset')
  const totalAssets      = currentAssets + nonCurrentAssets

  const currentLiab    = sumBy(allBalances, 'liability', 'current_liability')
  const nonCurrentLiab = sumBy(allBalances, 'liability', 'non_current_liability')
  const totalLiab      = currentLiab + nonCurrentLiab

  const equity         = sumBy(allBalances, 'equity')
  const retainedEarnings = equity
  const totalEquity    = retainedEarnings + netProfit

  const totalLiabEquity = totalLiab + totalEquity
  const bsBalances      = Math.abs(totalAssets - totalLiabEquity) < 1

  const reports = [
    { key: 'pl',       label: 'P&L Statement',     icon: TrendingUp },
    { key: 'bs',       label: 'Financial Position', icon: Scale },
    { key: 'tb',       label: 'Trial Balance',      icon: BookOpen },
    { key: 'cf',       label: 'Cash Flow',          icon: BarChart3 },
    { key: 'aged_recv',label: 'Aged Receivables',   icon: Clock },
    { key: 'aged_pay', label: 'Aged Payables',      icon: Clock },
  ]

  const ReportHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div className="mb-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">{companyName}</p>
          <h3 className="text-lg font-bold text-gray-900 mt-0.5">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <button onClick={printReport}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
          <Download size={13} /> Export
        </button>
      </div>
      <div className="mt-3 h-0.5 bg-brand-600 rounded" />
    </div>
  )

  const PLRow = ({ label, value, indent = 0, bold = false, line = false, color = '' }: any) => (
    <div className={`flex items-center justify-between py-2 ${line ? 'border-t border-gray-200' : ''}`}
      style={{ paddingLeft: `${indent * 16}px` }}>
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-bold' : 'font-medium'} ${color || (bold ? 'text-gray-900' : 'text-gray-700')}`}>
        {value === '' ? '' : displayAbs(value)}
      </span>
    </div>
  )

  return (
    <div className="p-5 space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Financial reports</h2>
          <p className="text-xs text-gray-400 mt-0.5">IFRS-compliant financial statements</p>
        </div>
      </div>

      {/* Report selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {reports.map(r => {
          const Icon = r.icon
          return (
            <button key={r.key} onClick={() => setActiveReport(r.key as typeof activeReport)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors
                ${activeReport === r.key ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Icon size={14} /> {r.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-6">

          {/* ── P&L STATEMENT ──────────────────────────────────────────────── */}
          {activeReport === 'pl' && (
            <div>
              <ReportHeader
                title="Statement of Profit or Loss"
                subtitle={`For the period: ${periodStart} to ${periodEnd}`}
              />
              <div className="max-w-lg">
                <PLRow label="REVENUE" value="" bold />
                {balances.filter(b => b.account.type === 'revenue' && b.balance !== 0).map(b => (
                  <PLRow key={b.account.id} label={b.account.name} value={b.balance} indent={1} />
                ))}
                <PLRow label="Total revenue" value={revenue} bold line />

                <PLRow label="" value="" />
                <PLRow label="COST OF SALES" value="" bold />
                {balances.filter(b => b.account.subtype === 'cost_of_sales' && b.balance !== 0).map(b => (
                  <PLRow key={b.account.id} label={b.account.name} value={-b.balance} indent={1} />
                ))}
                <PLRow label="Total cost of sales" value={-cos} bold line />

                <PLRow label="" value="" />
                <PLRow label="GROSS PROFIT" value={grossProfit} bold line
                  color={grossProfit >= 0 ? 'text-green-700' : 'text-red-600'} />

                <PLRow label="" value="" />
                <PLRow label="OPERATING EXPENSES" value="" bold />
                {balances.filter(b => b.account.subtype === 'opex' && b.balance !== 0).map(b => (
                  <PLRow key={b.account.id} label={b.account.name} value={-b.balance} indent={1} />
                ))}
                <PLRow label="Total operating expenses" value={-opex} bold line />

                <PLRow label="" value="" />
                <PLRow label="OPERATING PROFIT (EBIT)" value={opProfit} bold line
                  color={opProfit >= 0 ? 'text-green-700' : 'text-red-600'} />

                {taxExp > 0 && (
                  <>
                    <PLRow label="" value="" />
                    <PLRow label="INCOME TAX EXPENSE" value="" bold />
                    {balances.filter(b => b.account.type === 'tax' && b.balance !== 0).map(b => (
                      <PLRow key={b.account.id} label={b.account.name} value={-b.balance} indent={1} />
                    ))}
                    <PLRow label="Total tax expense" value={-taxExp} bold line />
                  </>
                )}

                <PLRow label="" value="" />
                <div className="border-t-2 border-brand-600 pt-3 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-gray-900">PROFIT FOR THE PERIOD</span>
                    <span className={`text-base font-bold ${netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {displayAbs(netProfit)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── BALANCE SHEET ───────────────────────────────────────────────── */}
          {activeReport === 'bs' && (
            <div>
              <ReportHeader
                title="Statement of Financial Position"
                subtitle={`As at ${periodEnd || 'current date'}`}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* Assets */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Assets</p>

                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Non-Current Assets</p>
                  {allBalances.filter(b => b.account.subtype === 'non_current_asset' && b.balance !== 0).map(b => (
                    <div key={b.account.id} className="flex justify-between py-1.5 border-b border-gray-50">
                      <span className="text-sm text-gray-600 pl-3">{b.account.name}</span>
                      <span className="text-sm font-medium text-gray-800">{display(b.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 font-semibold border-t border-gray-200 mt-1">
                    <span className="text-sm text-gray-700">Total non-current assets</span>
                    <span className="text-sm text-gray-900">{display(nonCurrentAssets)}</span>
                  </div>

                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2 mt-4">Current Assets</p>
                  {allBalances.filter(b => b.account.subtype === 'current_asset' && b.balance !== 0).map(b => (
                    <div key={b.account.id} className="flex justify-between py-1.5 border-b border-gray-50">
                      <span className="text-sm text-gray-600 pl-3">{b.account.name}</span>
                      <span className="text-sm font-medium text-gray-800">{display(b.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 font-semibold border-t border-gray-200 mt-1">
                    <span className="text-sm text-gray-700">Total current assets</span>
                    <span className="text-sm text-gray-900">{display(currentAssets)}</span>
                  </div>

                  <div className="flex justify-between py-3 font-bold border-t-2 border-brand-600 mt-2">
                    <span className="text-base text-gray-900">TOTAL ASSETS</span>
                    <span className="text-base text-blue-700">{display(totalAssets)}</span>
                  </div>
                </div>

                {/* Liabilities + Equity */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Liabilities & Equity</p>

                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Current Liabilities</p>
                  {allBalances.filter(b => b.account.subtype === 'current_liability' && b.balance !== 0).map(b => (
                    <div key={b.account.id} className="flex justify-between py-1.5 border-b border-gray-50">
                      <span className="text-sm text-gray-600 pl-3">{b.account.name}</span>
                      <span className="text-sm font-medium text-gray-800">{display(b.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 font-semibold border-t border-gray-200 mt-1">
                    <span className="text-sm text-gray-700">Total current liabilities</span>
                    <span className="text-sm text-gray-900">{display(currentLiab)}</span>
                  </div>

                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2 mt-4">Non-Current Liabilities</p>
                  {allBalances.filter(b => b.account.subtype === 'non_current_liability' && b.balance !== 0).map(b => (
                    <div key={b.account.id} className="flex justify-between py-1.5 border-b border-gray-50">
                      <span className="text-sm text-gray-600 pl-3">{b.account.name}</span>
                      <span className="text-sm font-medium text-gray-800">{display(b.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 font-semibold border-t border-gray-200 mt-1">
                    <span className="text-sm text-gray-700">Total non-current liabilities</span>
                    <span className="text-sm text-gray-900">{display(nonCurrentLiab)}</span>
                  </div>

                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2 mt-4">Equity</p>
                  {allBalances.filter(b => b.account.type === 'equity' && b.balance !== 0).map(b => (
                    <div key={b.account.id} className="flex justify-between py-1.5 border-b border-gray-50">
                      <span className="text-sm text-gray-600 pl-3">{b.account.name}</span>
                      <span className="text-sm font-medium text-gray-800">{display(b.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1.5 border-b border-gray-50">
                    <span className="text-sm text-gray-600 pl-3">Current year profit / (loss)</span>
                    <span className={`text-sm font-medium ${netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{display(netProfit)}</span>
                  </div>
                  <div className="flex justify-between py-2 font-semibold border-t border-gray-200 mt-1">
                    <span className="text-sm text-gray-700">Total equity</span>
                    <span className="text-sm text-gray-900">{display(totalEquity)}</span>
                  </div>

                  <div className="flex justify-between py-3 font-bold border-t-2 border-brand-600 mt-2">
                    <span className="text-base text-gray-900">TOTAL LIABILITIES & EQUITY</span>
                    <span className={`text-base ${bsBalances ? 'text-green-700' : 'text-red-600'}`}>{display(totalLiabEquity)}</span>
                  </div>

                  {!bsBalances && (
                    <p className="text-xs text-red-600 font-medium mt-2">
                      ⚠ Balance sheet does not balance — check journal entries.
                    </p>
                  )}
                  {bsBalances && (
                    <p className="text-xs text-green-600 font-medium mt-2">
                      ✓ Balance sheet balances.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── TRIAL BALANCE ───────────────────────────────────────────────── */}
          {activeReport === 'tb' && (
            <div>
              <ReportHeader
                title="Trial Balance"
                subtitle={`For the period: ${periodStart} to ${periodEnd}`}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 w-20">Code</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500">Account name</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 w-24">Type</th>
                      <th className="pb-3 text-right text-xs font-semibold text-gray-500 w-40">Debit (NGN)</th>
                      <th className="pb-3 text-right text-xs font-semibold text-gray-500 w-40">Credit (NGN)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {balances.filter(b => b.debit > 0 || b.credit > 0).map(b => (
                      <tr key={b.account.id} className="hover:bg-gray-50/50">
                        <td className="py-2 font-mono text-xs text-brand-700">{b.account.code}</td>
                        <td className="py-2 text-gray-800">{b.account.name}</td>
                        <td className="py-2 text-xs text-gray-500 capitalize">{b.account.type}</td>
                        <td className="py-2 text-right font-mono text-sm text-gray-800">
                          {b.debit > 0 ? fmt(b.debit) : '—'}
                        </td>
                        <td className="py-2 text-right font-mono text-sm text-gray-800">
                          {b.credit > 0 ? fmt(b.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300">
                      <td colSpan={3} className="pt-3 text-sm font-bold text-gray-900">TOTALS</td>
                      <td className="pt-3 text-right font-bold font-mono text-gray-900">
                        {fmt(balances.reduce((s, b) => s + b.debit, 0))}
                      </td>
                      <td className="pt-3 text-right font-bold font-mono text-gray-900">
                        {fmt(balances.reduce((s, b) => s + b.credit, 0))}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="pt-2 text-right text-xs">
                        {Math.abs(balances.reduce((s, b) => s + b.debit, 0) - balances.reduce((s, b) => s + b.credit, 0)) < 1
                          ? <span className="text-green-600 font-medium">✓ Trial balance agrees</span>
                          : <span className="text-red-600 font-medium">⚠ Trial balance does not agree — check journals</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── CASH FLOW ───────────────────────────────────────────────────── */}
          {activeReport === 'cf' && (
            <div>
              <ReportHeader
                title="Statement of Cash Flows"
                subtitle={`For the period: ${periodStart} to ${periodEnd}`}
              />
              <div className="max-w-lg space-y-6">

                {/* Operating activities */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-3">Cash flows from operating activities</p>
                  <PLRow label="Profit before tax" value={opProfit} indent={1} />
                  <PLRow label="Depreciation and amortisation" value={balances.find(b => b.account.code === '6007')?.balance ?? 0} indent={1} />
                  <PLRow label="Increase in trade receivables" value={-(allBalances.find(b => b.account.code === '1010')?.balance ?? 0)} indent={1} />
                  <PLRow label="Increase in inventory" value={-(allBalances.find(b => b.account.code === '1020')?.balance ?? 0)} indent={1} />
                  <PLRow label="Increase in trade payables" value={allBalances.find(b => b.account.code === '2001')?.balance ?? 0} indent={1} />
                  <PLRow label="Tax paid" value={-(balances.reduce((s, b) => b.account.type === 'tax' ? s + b.balance : s, 0))} indent={1} />
                  <PLRow label="Net cash from operating activities"
                    value={opProfit
                      + (balances.find(b => b.account.code === '6007')?.balance ?? 0)
                      - (allBalances.find(b => b.account.code === '1010')?.balance ?? 0)
                      - (allBalances.find(b => b.account.code === '1020')?.balance ?? 0)
                      + (allBalances.find(b => b.account.code === '2001')?.balance ?? 0)
                      - (balances.reduce((s, b) => b.account.type === 'tax' ? s + b.balance : s, 0))}
                    bold line />
                </div>

                {/* Investing activities */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-3">Cash flows from investing activities</p>
                  <PLRow label="Purchase of fixed assets" value={-(allBalances.filter(b => b.account.subtype === 'non_current_asset' && b.account.code !== '1105').reduce((s, b) => s + b.balance, 0))} indent={1} />
                  <PLRow label="Net cash from investing activities"
                    value={-(allBalances.filter(b => b.account.subtype === 'non_current_asset' && b.account.code !== '1105').reduce((s, b) => s + b.balance, 0))}
                    bold line />
                </div>

                {/* Financing activities */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-3">Cash flows from financing activities</p>
                  <PLRow label="Partner wallet movements" value={-(allBalances.find(b => b.account.code === '2002')?.balance ?? 0)} indent={1} />
                  <PLRow label="Net cash from financing activities"
                    value={-(allBalances.find(b => b.account.code === '2002')?.balance ?? 0)}
                    bold line />
                </div>

                <div className="border-t-2 border-brand-600 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-gray-900">NET CHANGE IN CASH</span>
                    <span className="text-base font-bold text-brand-700">
                      {display(allBalances.filter(b => b.account.is_bank || b.account.code === '1001').reduce((s, b) => s + b.balance, 0))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── AGED RECEIVABLES ────────────────────────────────────────────── */}
          {activeReport === 'aged_recv' && (
            <AgedReceivables display={display} />
          )}

          {/* ── AGED PAYABLES ───────────────────────────────────────────────── */}
          {activeReport === 'aged_pay' && (
            <AgedPayables display={display} companyName={companyName} />
          )}
        </div>
      )}
    </div>
  )
}

// ── AGED RECEIVABLES ──────────────────────────────────────────────────────────
function AgedReceivables({ display }: { display: (n: number) => string }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('sales_orders')
      .select(`
        id, customer_payable, outstanding_balance, payment_status, created_at,
        customer:customers!sales_orders_customer_id_fkey(name)
      `)
      .gt('outstanding_balance', 0)
      .order('created_at')
      .then(({ data }) => {
        const now = new Date()
        setData((data ?? []).map(so => {
          const days = Math.floor((now.getTime() - new Date(so.created_at).getTime()) / 86400000)
          return { ...so, days_outstanding: days, outstanding_balance: Number(so.outstanding_balance), customer_payable: Number(so.customer_payable) }
        }))
        setLoading(false)
      })
  }, [])

  const bucket = (days: number) =>
    days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+'

  const buckets: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  for (const d of data) buckets[bucket(d.days_outstanding)] += d.outstanding_balance
  const total = Object.values(buckets).reduce((s, v) => s + v, 0)

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900">Aged Receivables</h3>
        <p className="text-xs text-gray-400 mt-0.5">Outstanding customer balances by age</p>
        <div className="mt-3 h-0.5 bg-brand-600 rounded" />
      </div>

      {/* Bucket summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {Object.entries(buckets).map(([bucket, amount]) => (
          <div key={bucket} className={`rounded-xl p-3 ${bucket === '90+' ? 'bg-red-50' : bucket === '61-90' ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className="text-xs text-gray-400 mb-1">{bucket} days</p>
            <p className={`text-base font-bold ${bucket === '90+' ? 'text-red-700' : bucket === '61-90' ? 'text-amber-700' : 'text-gray-800'}`}>
              {display(amount)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {total > 0 ? `${((amount / total) * 100).toFixed(0)}%` : '0%'}
            </p>
          </div>
        ))}
      </div>

      {loading ? <div className="text-center py-8"><Loader2 size={20} className="animate-spin text-brand-600 mx-auto" /></div> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300">
              {['Customer','Invoice date','Days outstanding','Total invoice','Outstanding','Age bucket'].map(h => (
                <th key={h} className="pb-3 text-left text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map(d => (
              <tr key={d.id} className="hover:bg-gray-50/50">
                <td className="py-2.5 font-medium text-gray-900">{(d.customer as any)?.name ?? '—'}</td>
                <td className="py-2.5 text-xs text-gray-500">
                  {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="py-2.5">
                  <span className={`text-sm font-semibold ${d.days_outstanding > 90 ? 'text-red-600' : d.days_outstanding > 60 ? 'text-amber-600' : 'text-gray-700'}`}>
                    {d.days_outstanding} days
                  </span>
                </td>
                <td className="py-2.5 font-medium text-gray-800">{display(d.customer_payable)}</td>
                <td className="py-2.5 font-bold text-red-600">{display(d.outstanding_balance)}</td>
                <td className="py-2.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                    ${bucket(d.days_outstanding) === '90+' ? 'bg-red-50 text-red-700' :
                      bucket(d.days_outstanding) === '61-90' ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-100 text-gray-600'}`}>
                    {bucket(d.days_outstanding)} days
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300">
              <td colSpan={4} className="pt-3 text-sm font-bold text-gray-900">TOTAL OUTSTANDING</td>
              <td className="pt-3 text-sm font-bold text-red-700">{display(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

// ── AGED PAYABLES ─────────────────────────────────────────────────────────────
function AgedPayables({ display, companyName }: { display: (n: number) => string; companyName: string }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    // Use supplier_receivables as proxy for payables (missing pieces owed)
    supabase.from('supplier_receivables')
      .select(`
        id, gross_value_usd, remaining_usd, status, created_at,
        container:containers!supplier_receivables_container_id_fkey(
          container_id,
          trip:trips!containers_trip_id_fkey(
            supplier:suppliers!trips_supplier_id_fkey(name)
          )
        )
      `)
      .gt('remaining_usd', 0)
      .order('created_at')
      .then(({ data }) => {
        const now = new Date()
        setData((data ?? []).map(r => ({
          ...r,
          days_outstanding: Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 86400000),
          remaining_usd: Number(r.remaining_usd),
          gross_value_usd: Number(r.gross_value_usd),
        })))
        setLoading(false)
      })
  }, [])

  const total = data.reduce((s, d) => s + d.remaining_usd, 0)

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900">Aged Payables</h3>
        <p className="text-xs text-gray-400 mt-0.5">Outstanding supplier receivables (missing pieces) by age</p>
        <div className="mt-3 h-0.5 bg-brand-600 rounded" />
      </div>

      {loading ? <div className="text-center py-8"><Loader2 size={20} className="animate-spin text-brand-600 mx-auto" /></div> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300">
              {['Supplier','Container','Days','Gross (USD)','Remaining (USD)','Status'].map(h => (
                <th key={h} className="pb-3 text-left text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map(d => {
              const supplier = (d.container as any)?.trip?.supplier?.name ?? '—'
              const containerId = (d.container as any)?.container_id ?? '—'
              return (
                <tr key={d.id} className="hover:bg-gray-50/50">
                  <td className="py-2.5 font-medium text-gray-900">{supplier}</td>
                  <td className="py-2.5 font-mono text-xs text-brand-700">{containerId}</td>
                  <td className="py-2.5">
                    <span className={`text-sm font-semibold ${d.days_outstanding > 90 ? 'text-red-600' : d.days_outstanding > 60 ? 'text-amber-600' : 'text-gray-700'}`}>
                      {d.days_outstanding}d
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-700">${d.gross_value_usd.toFixed(2)}</td>
                  <td className="py-2.5 font-bold text-red-600">${d.remaining_usd.toFixed(2)}</td>
                  <td className="py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize
                      ${d.status === 'open' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300">
              <td colSpan={4} className="pt-3 text-sm font-bold text-gray-900">TOTAL OUTSTANDING</td>
              <td className="pt-3 text-sm font-bold text-red-700">${total.toFixed(2)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

