'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart3, Wallet, Building2, FileText,
  Settings, TrendingUp, TrendingDown, Scale,
  BookOpen, Plus, Loader2, PieChart,
  ArrowUpRight, ArrowDownRight, Users
} from 'lucide-react'
import JournalsTab    from './components/JournalsTab'
import AccountsTab    from './components/AccountsTab'
import BanksTab       from './components/BanksTab'
import AssetsTab      from './components/AssetsTab'
import TaxesTab       from './components/TaxesTab'
import ReportsTab     from './components/ReportsTab'
import DirectorsTab   from './components/DirectorsTab'
import SettingsTab    from './components/SettingsTab'

interface FinancePeriod {
  id: string
  name: string
  period_start: string
  period_end: string
  status: string
  is_opening: boolean
}

interface PLSummary {
  revenue: number
  cost_of_sales: number
  gross_profit: number
  operating_expenses: number
  operating_profit: number
  tax_expense: number
  net_profit: number
}

interface BSSummary {
  total_assets: number
  current_assets: number
  non_current_assets: number
  total_liabilities: number
  current_liabilities: number
  non_current_liabilities: number
  total_equity: number
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'journals' | 'accounts' | 'banks' |
    'assets' | 'taxes' | 'reports' | 'directors' | 'settings'
  >('dashboard')
  const [periods, setPeriods] = useState<FinancePeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [pl, setPL] = useState<PLSummary | null>(null)
  const [bs, setBS] = useState<BSSummary | null>(null)
  const [cashBalance, setCashBalance] = useState(0)
  const [receivables, setReceivables] = useState(0)
  const [payables, setPayables] = useState(0)
  const [usdRate, setUsdRate] = useState(1470.46)
  const [showUSD, setShowUSD] = useState(false)
  const [companyName, setCompanyName] = useState('Hydevest Solutions Limited')

  const display = (n: number) => showUSD
    ? `$${(n / usdRate).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : fmt(n)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: periodData }, { data: settingsData }] = await Promise.all([
      supabase.from('finance_periods').select('*').order('period_start', { ascending: false }),
      supabase.from('finance_settings').select('key, value'),
    ])

    setPeriods(periodData ?? [])

    const sMap = Object.fromEntries((settingsData ?? []).map(s => [s.key, s.value]))
    if (sMap.usd_rate) setUsdRate(parseFloat(sMap.usd_rate))
    if (sMap.company_name) setCompanyName(sMap.company_name)

    const currentPeriod = (periodData ?? []).find(p => !p.is_opening && p.status === 'open')
    const periodId = selectedPeriod || currentPeriod?.id || ''
    if (!selectedPeriod && currentPeriod) setSelectedPeriod(currentPeriod.id)
    if (!periodId) { setLoading(false); return }

    // Period journals for P&L
    const { data: periodJournals } = await supabase
      .from('finance_journals')
      .select('id')
      .eq('period_id', periodId)
      .eq('status', 'posted')

    const periodIds = (periodJournals ?? []).map(j => j.id)
    let periodLines: any[] = []
    if (periodIds.length > 0) {
      const { data } = await supabase
        .from('finance_journal_lines')
        .select('account_id, debit_ngn, credit_ngn, finance_accounts(type, subtype, code, is_bank)')
        .in('journal_id', periodIds)
      periodLines = data ?? []
    }

    // All journals for B/S
    const { data: allJournals } = await supabase
      .from('finance_journals').select('id').eq('status', 'posted')
    const allIds = (allJournals ?? []).map(j => j.id)
    let allLines: any[] = []
    if (allIds.length > 0) {
      const { data } = await supabase
        .from('finance_journal_lines')
        .select('account_id, debit_ngn, credit_ngn, finance_accounts(type, subtype, code, is_bank)')
        .in('journal_id', allIds)
      allLines = data ?? []
    }

    // P&L from period lines
    const plCalc: PLSummary = {
      revenue: 0, cost_of_sales: 0, gross_profit: 0,
      operating_expenses: 0, operating_profit: 0,
      tax_expense: 0, net_profit: 0,
    }
    for (const line of periodLines) {
      const acct = line.finance_accounts as any
      if (!acct) continue
      const net = Number(line.credit_ngn) - Number(line.debit_ngn)
      if (acct.type === 'revenue') plCalc.revenue += net
      if (acct.subtype === 'cost_of_sales') plCalc.cost_of_sales += Number(line.debit_ngn) - Number(line.credit_ngn)
      if (acct.subtype === 'opex') plCalc.operating_expenses += Number(line.debit_ngn) - Number(line.credit_ngn)
      if (acct.type === 'tax') plCalc.tax_expense += Number(line.debit_ngn) - Number(line.credit_ngn)
    }
    plCalc.gross_profit = plCalc.revenue - plCalc.cost_of_sales
    plCalc.operating_profit = plCalc.gross_profit - plCalc.operating_expenses
    plCalc.net_profit = plCalc.operating_profit - plCalc.tax_expense
    setPL(plCalc)

    // B/S from all lines
    const bsCalc: BSSummary = {
      total_assets: 0, current_assets: 0, non_current_assets: 0,
      total_liabilities: 0, current_liabilities: 0, non_current_liabilities: 0,
      total_equity: 0,
    }
    let cash = 0, recv = 0, pay = 0

    for (const line of allLines) {
      const acct = line.finance_accounts as any
      if (!acct) continue
      const dr = Number(line.debit_ngn)
      const cr = Number(line.credit_ngn)
      if (acct.type === 'asset') {
        const bal = dr - cr
        bsCalc.total_assets += bal
        if (acct.subtype === 'current_asset') bsCalc.current_assets += bal
        else bsCalc.non_current_assets += bal
        if (acct.is_bank || acct.code === '1001') cash += bal
        if (acct.code === '1010') recv += bal
      }
      if (acct.type === 'liability') {
        const bal = cr - dr
        bsCalc.total_liabilities += bal
        if (acct.subtype === 'current_liability') bsCalc.current_liabilities += bal
        else bsCalc.non_current_liabilities += bal
        if (acct.code === '2001') pay += bal
      }
      if (acct.type === 'equity') bsCalc.total_equity += cr - dr
    }
    bsCalc.total_equity += plCalc.net_profit
    setBS(bsCalc)
    setCashBalance(cash)
    setReceivables(recv)
    setPayables(pay)
    setLoading(false)
  }, [selectedPeriod])

  useEffect(() => { load() }, [load])

  const tabs = [
    { key: 'dashboard',  label: 'Dashboard',    icon: BarChart3 },
    { key: 'journals',   label: 'Journals',     icon: BookOpen },
    { key: 'accounts',   label: 'Accounts',     icon: Scale },
    { key: 'banks',      label: 'Bank recon',   icon: Building2 },
    { key: 'assets',     label: 'Assets',       icon: FileText },
    { key: 'taxes',      label: 'Taxes',        icon: PieChart },
    { key: 'reports',    label: 'Reports',      icon: BarChart3 },
    { key: 'directors',  label: 'Directors',    icon: Users },
    { key: 'settings',   label: 'Settings',     icon: Settings },
  ]

  const currentPeriodName = periods.find(p => p.id === selectedPeriod)?.name ?? ''

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Finance</h1>
          <p className="text-sm text-gray-400 mt-0.5">{companyName} · Full accounting, tax and financial reporting</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Currency toggle */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setShowUSD(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!showUSD ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
              NGN
            </button>
            <button onClick={() => setShowUSD(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${showUSD ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
              USD
            </button>
          </div>
          {/* Period selector */}
          <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.is_opening ? ' (Opening)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Tab navigation */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap
                  ${activeTab === tab.key
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={14} /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="p-6 space-y-6">

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'Cash & bank',
                  value: display(cashBalance),
                  icon: <Wallet size={16} className="text-green-600" />,
                  color: 'text-green-700', bg: 'bg-green-50',
                },
                {
                  label: 'Accounts receivable',
                  value: display(receivables),
                  icon: <ArrowUpRight size={16} className="text-blue-600" />,
                  color: 'text-blue-700', bg: 'bg-blue-50',
                },
                {
                  label: 'Accounts payable',
                  value: display(payables),
                  icon: <ArrowDownRight size={16} className="text-red-500" />,
                  color: 'text-red-600', bg: 'bg-red-50',
                },
                {
                  label: `Net profit — ${currentPeriodName}`,
                  value: pl ? display(pl.net_profit) : '—',
                  icon: pl && pl.net_profit >= 0
                    ? <TrendingUp size={16} className="text-green-600" />
                    : <TrendingDown size={16} className="text-red-500" />,
                  color: pl && pl.net_profit >= 0 ? 'text-green-700' : 'text-red-600',
                  bg: pl && pl.net_profit >= 0 ? 'bg-green-50' : 'bg-red-50',
                },
              ].map(m => (
                <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
                  <div className="flex items-center gap-2 mb-2">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
                  <p className={`text-lg font-bold truncate ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* P&L + B/S snapshot */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* P&L snapshot */}
              <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Profit & Loss — {currentPeriodName}
                  </h3>
                  <button onClick={() => { setActiveTab('reports') }}
                    className="text-xs text-brand-600 hover:underline">Full report →</button>
                </div>
                {loading ? (
                  <div className="p-5 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
                    ))}
                  </div>
                ) : pl ? (
                  <div className="divide-y divide-gray-200">
                    {[
                      { label: 'Revenue',            value: pl.revenue,            bold: false, color: 'text-gray-700' },
                      { label: 'Cost of sales',      value: -pl.cost_of_sales,     bold: false, color: 'text-gray-600', indent: true },
                      { label: 'Gross profit',       value: pl.gross_profit,       bold: true,  color: pl.gross_profit >= 0 ? 'text-green-700' : 'text-red-600' },
                      { label: 'Operating expenses', value: -pl.operating_expenses,bold: false, color: 'text-gray-600', indent: true },
                      { label: 'Operating profit',   value: pl.operating_profit,   bold: true,  color: pl.operating_profit >= 0 ? 'text-green-700' : 'text-red-600' },
                      { label: 'Tax expense',        value: -pl.tax_expense,       bold: false, color: 'text-gray-600', indent: true },
                      { label: 'Net profit',         value: pl.net_profit,         bold: true,  color: pl.net_profit >= 0 ? 'text-green-700' : 'text-red-600' },
                    ].map(row => (
                      <div key={row.label}
                        className={`flex items-center justify-between px-5 py-2.5 ${row.bold ? 'bg-white' : ''}`}
                        style={{ paddingLeft: (row as any).indent ? '28px' : '20px' }}>
                        <span className={`text-sm ${row.bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                          {row.label}
                        </span>
                        <span className={`text-sm font-medium font-mono ${row.color} ${row.bold ? 'font-bold' : ''}`}>
                          {row.value < 0
                            ? `(${display(Math.abs(row.value))})`
                            : display(row.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 text-center text-sm text-gray-400">
                    No journal entries for this period yet.
                  </div>
                )}
              </div>

              {/* B/S snapshot */}
              <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Financial Position</h3>
                  <button onClick={() => setActiveTab('reports')}
                    className="text-xs text-brand-600 hover:underline">Full report →</button>
                </div>
                {loading ? (
                  <div className="p-5 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
                    ))}
                  </div>
                ) : bs ? (
                  <div className="divide-y divide-gray-200">
                    {[
                      { label: 'Current assets',        value: bs.current_assets,                         bold: false, color: 'text-gray-600', indent: true },
                      { label: 'Non-current assets',    value: bs.non_current_assets,                     bold: false, color: 'text-gray-600', indent: true },
                      { label: 'Total assets',          value: bs.total_assets,                           bold: true,  color: 'text-blue-700' },
                      { label: 'Total liabilities',     value: bs.total_liabilities,                      bold: true,  color: 'text-red-600' },
                      { label: 'Total equity',          value: bs.total_equity,                           bold: true,  color: 'text-green-700' },
                      { label: 'Liabilities + equity',  value: bs.total_liabilities + bs.total_equity,   bold: true,
                        color: Math.abs((bs.total_liabilities + bs.total_equity) - bs.total_assets) < 1
                          ? 'text-green-700' : 'text-red-600' },
                    ].map(row => (
                      <div key={row.label}
                        className={`flex items-center justify-between px-5 py-2.5 ${row.bold ? 'bg-white' : ''}`}
                        style={{ paddingLeft: (row as any).indent ? '28px' : '20px' }}>
                        <span className={`text-sm ${row.bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                          {row.label}
                        </span>
                        <span className={`text-sm font-medium font-mono ${row.color} ${row.bold ? 'font-bold' : ''}`}>
                          {display(row.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 text-center text-sm text-gray-400">No data yet.</div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Quick actions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'New journal entry',    icon: <BookOpen size={15} />,   tab: 'journals',  color: 'bg-brand-50 text-brand-700 hover:bg-brand-100 border-brand-100' },
                  { label: 'Bank reconciliation',  icon: <Building2 size={15} />,  tab: 'banks',     color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100' },
                  { label: 'Calculate taxes',      icon: <PieChart size={15} />,   tab: 'taxes',     color: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100' },
                  { label: 'Financial reports',    icon: <BarChart3 size={15} />,  tab: 'reports',   color: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-100' },
                ].map(action => (
                  <button key={action.label}
                    onClick={() => setActiveTab(action.tab as typeof activeTab)}
                    className={`flex items-center gap-3 p-4 rounded-xl border font-medium text-sm transition-colors ${action.color}`}>
                    {action.icon} {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODULE TABS */}
        {activeTab === 'journals'  && <JournalsTab  selectedPeriod={selectedPeriod} />}
        {activeTab === 'accounts'  && <AccountsTab />}
        {activeTab === 'banks'     && <BanksTab     selectedPeriod={selectedPeriod} />}
        {activeTab === 'assets'    && <AssetsTab    selectedPeriod={selectedPeriod} />}
        {activeTab === 'taxes'     && <TaxesTab     selectedPeriod={selectedPeriod} />}
        {activeTab === 'reports'   && <ReportsTab   selectedPeriod={selectedPeriod} usdRate={usdRate} showUSD={showUSD} />}
        {activeTab === 'directors' && <DirectorsTab />}
        {activeTab === 'settings'  && <SettingsTab />}
      </div>
    </div>
  )
}

