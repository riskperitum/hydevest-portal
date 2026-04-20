'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calculator, CheckCircle2, AlertCircle,
  Loader2, FileText, RefreshCw, Info
} from 'lucide-react'

interface TaxRecord {
  id: string
  period_id: string
  period_name: string
  tax_type: string
  taxable_amount: number
  rate_pct: number
  tax_amount: number
  input_vat: number
  output_vat: number
  net_vat: number
  status: string
  due_date: string | null
  paid_date: string | null
  notes: string | null
}

interface TaxSummary {
  cit: number
  vat: number
  edt: number
  nitda: number
  wht: number
  total: number
}

interface Settings {
  cit_small_threshold: number
  cit_medium_threshold: number
  cit_small_rate: number
  cit_medium_rate: number
  cit_large_rate: number
  vat_rate: number
  edt_rate: number
  nitda_rate: number
  nitda_threshold: number
  company_name: string
  company_tin: string
}

const fmt     = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct  = (n: number) => `${Number(n).toFixed(1)}%`

const TAX_INFO: Record<string, { label: string; authority: string; filing: string; color: string }> = {
  CIT:   { label: 'Company Income Tax',  authority: 'FIRS', filing: 'Annual — 6 months after year end',     color: 'bg-blue-50 text-blue-700' },
  VAT:   { label: 'Value Added Tax',     authority: 'FIRS', filing: 'Monthly — 21st of following month',    color: 'bg-green-50 text-green-700' },
  EDT:   { label: 'Education Tax',       authority: 'FIRS', filing: 'Annual — with CIT return',             color: 'bg-purple-50 text-purple-700' },
  NITDA: { label: 'NITDA Levy',          authority: 'NITDA/FIRS', filing: 'Annual — with CIT return',       color: 'bg-amber-50 text-amber-700' },
  WHT:   { label: 'Withholding Tax',     authority: 'FIRS', filing: 'Monthly — 21st of following month',    color: 'bg-red-50 text-red-600' },
  PAYE:  { label: 'Pay As You Earn',     authority: 'SIRS/FIRS', filing: 'Monthly — 10th of following month', color: 'bg-gray-100 text-gray-600' },
}

const STATUS_COLOR: Record<string, string> = {
  calculated: 'bg-amber-50 text-amber-700',
  filed:      'bg-blue-50 text-blue-700',
  paid:       'bg-green-50 text-green-700',
}

export default function TaxesTab({
  selectedPeriod,
  canManageJournals,
}: {
  selectedPeriod: string
  canManageJournals: boolean
}) {
  const [taxes, setTaxes] = useState<TaxRecord[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [calcResult, setCalcResult] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [periodName, setPeriodName] = useState('')

  // Revenue and expense figures from journals
  const [figures, setFigures] = useState({
    revenue: 0,
    cos: 0,
    opex: 0,
    grossProfit: 0,
    profitBeforeTax: 0,
    inputVat: 0,
    outputVat: 0,
  })

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: taxData }, { data: settingsData }, { data: periodData }] = await Promise.all([
      supabase.from('finance_taxes')
        .select(`*, period:finance_periods!finance_taxes_period_id_fkey(name)`)
        .order('created_at', { ascending: false }),
      supabase.from('finance_settings').select('key, value'),
      selectedPeriod
        ? supabase.from('finance_periods').select('name').eq('id', selectedPeriod).single()
        : { data: null },
    ])

    if (periodData) setPeriodName((periodData as any).name ?? '')

    // Parse settings
    const sMap = Object.fromEntries((settingsData ?? []).map(s => [s.key, s.value]))
    setSettings({
      cit_small_threshold:  parseFloat(sMap.cit_small_threshold  ?? '25000000'),
      cit_medium_threshold: parseFloat(sMap.cit_medium_threshold ?? '100000000'),
      cit_small_rate:       parseFloat(sMap.cit_small_rate       ?? '0'),
      cit_medium_rate:      parseFloat(sMap.cit_medium_rate      ?? '20'),
      cit_large_rate:       parseFloat(sMap.cit_large_rate       ?? '30'),
      vat_rate:             parseFloat(sMap.vat_rate             ?? '7.5'),
      edt_rate:             parseFloat(sMap.edt_rate             ?? '2.5'),
      nitda_rate:           parseFloat(sMap.nitda_rate           ?? '1'),
      nitda_threshold:      parseFloat(sMap.nitda_threshold      ?? '100000000'),
      company_name:         sMap.company_name ?? '',
      company_tin:          sMap.company_tin ?? '',
    })

    setTaxes((taxData ?? []).map(t => ({
      ...t,
      taxable_amount: Number(t.taxable_amount),
      rate_pct:       Number(t.rate_pct),
      tax_amount:     Number(t.tax_amount),
      input_vat:      Number(t.input_vat),
      output_vat:     Number(t.output_vat),
      net_vat:        Number(t.net_vat),
      period_name:    (t.period as any)?.name ?? '—',
    })))

    // Load journal figures for selected period
    if (selectedPeriod) {
      const { data: journals } = await supabase
        .from('finance_journals')
        .select('id')
        .eq('period_id', selectedPeriod)
        .eq('status', 'posted')

      const journalIds = (journals ?? []).map(j => j.id)
      if (journalIds.length > 0) {
        const { data: lines } = await supabase
          .from('finance_journal_lines')
          .select('account_id, debit_ngn, credit_ngn, finance_accounts(type, subtype, code)')
          .in('journal_id', journalIds)

        let revenue = 0, cos = 0, opex = 0, inputVat = 0, outputVat = 0
        for (const line of (lines ?? [])) {
          const acct = line.finance_accounts as any
          if (!acct) continue
          const dr = Number(line.debit_ngn)
          const cr = Number(line.credit_ngn)
          if (acct.type === 'revenue') revenue += cr - dr
          if (acct.subtype === 'cost_of_sales') cos += dr - cr
          if (acct.subtype === 'opex') opex += dr - cr
          if (acct.code === '1031') inputVat += dr - cr   // input VAT recoverable
          if (acct.code === '2003') outputVat += cr - dr  // VAT payable
        }

        setFigures({
          revenue, cos, opex,
          grossProfit: revenue - cos,
          profitBeforeTax: revenue - cos - opex,
          inputVat, outputVat,
        })
      }
    }

    setLoading(false)
  }, [selectedPeriod])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  async function calculateTaxes() {
    if (!canManageJournals || !selectedPeriod || !settings) return
    setCalculating(true)
    setCalcResult(null)
    const supabase = createClient()

    const { profitBeforeTax, revenue, inputVat, outputVat } = figures

    // ── CIT calculation ──────────────────────────────────────────
    let citRate = settings.cit_small_rate
    if (revenue > settings.cit_medium_threshold) citRate = settings.cit_large_rate
    else if (revenue > settings.cit_small_threshold) citRate = settings.cit_medium_rate

    const citBase = Math.max(profitBeforeTax, 0)
    const citAmount = citBase * (citRate / 100)
    // Minimum tax = 0.5% of gross turnover if CIT < minimum tax
    const minimumTax = revenue * 0.005
    const finalCIT = Math.max(citAmount, citRate > 0 ? minimumTax : 0)

    // ── EDT calculation ──────────────────────────────────────────
    const edtAmount = citBase * (settings.edt_rate / 100)

    // ── NITDA calculation ────────────────────────────────────────
    const nitdaAmount = revenue > settings.nitda_threshold
      ? profitBeforeTax * (settings.nitda_rate / 100)
      : 0

    // ── VAT calculation ──────────────────────────────────────────
    const netVat = outputVat - inputVat

    const taxes = [
      {
        tax_type: 'CIT', taxable_amount: citBase, rate_pct: citRate,
        tax_amount: finalCIT, input_vat: 0, output_vat: 0, net_vat: 0,
        due_date: null, notes: citRate === 0 ? 'Small company — CIT exempt' :
          finalCIT === minimumTax ? `Minimum tax applied (0.5% of revenue)` : null,
      },
      {
        tax_type: 'EDT', taxable_amount: citBase, rate_pct: settings.edt_rate,
        tax_amount: edtAmount, input_vat: 0, output_vat: 0, net_vat: 0,
        due_date: null, notes: 'Education tax — 2.5% of assessable profit',
      },
      {
        tax_type: 'VAT', taxable_amount: revenue, rate_pct: settings.vat_rate,
        tax_amount: Math.max(netVat, 0), input_vat: inputVat, output_vat: outputVat,
        net_vat: netVat, due_date: null,
        notes: `Output VAT: ${fmt(outputVat)} — Input VAT: ${fmt(inputVat)} — Net: ${fmt(netVat)}`,
      },
    ]

    if (nitdaAmount > 0) {
      taxes.push({
        tax_type: 'NITDA', taxable_amount: profitBeforeTax, rate_pct: settings.nitda_rate,
        tax_amount: nitdaAmount, input_vat: 0, output_vat: 0, net_vat: 0,
        due_date: null, notes: 'NITDA levy — 1% of profit (turnover > ₦100M)',
      })
    }

    // Upsert tax records
    for (const tax of taxes) {
      const { data: existing } = await supabase
        .from('finance_taxes')
        .select('id')
        .eq('period_id', selectedPeriod)
        .eq('tax_type', tax.tax_type)
        .single()

      if (existing) {
        await supabase.from('finance_taxes').update({
          ...tax, status: 'calculated',
        }).eq('id', existing.id)
      } else {
        await supabase.from('finance_taxes').insert({
          ...tax, period_id: selectedPeriod, status: 'calculated',
        })
      }
    }

    setCalcResult(`Tax calculations complete for ${periodName}. ${taxes.length} taxes computed.`)
    setCalculating(false)
    load()
  }

  async function updateStatus(id: string, status: string) {
    if (!canManageJournals) return
    const supabase = createClient()
    const updates: any = { status }
    if (status === 'paid') updates.paid_date = new Date().toISOString().split('T')[0]
    await supabase.from('finance_taxes').update(updates).eq('id', id)
    load()
  }

  const periodTaxes = taxes.filter(t => t.period_id === selectedPeriod)
  const allTimeTaxes = taxes
  const totalTaxDue = periodTaxes.filter(t => t.status !== 'paid').reduce((s, t) => s + t.tax_amount, 0)
  const totalTaxPaid = allTimeTaxes.filter(t => t.status === 'paid').reduce((s, t) => s + t.tax_amount, 0)

  // CIT rate for display
  const citRate = settings
    ? figures.revenue > settings.cit_medium_threshold ? settings.cit_large_rate
      : figures.revenue > settings.cit_small_threshold ? settings.cit_medium_rate
      : settings.cit_small_rate
    : 0

  return (
    <div className="p-5 space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Nigerian tax compliance</h2>
          <p className="text-xs text-gray-400 mt-0.5">CIT · VAT · Education Tax · NITDA · WHT · PAYE</p>
        </div>
        {canManageJournals && (
          <button onClick={calculateTaxes} disabled={calculating || !selectedPeriod}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {calculating ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
            Calculate taxes for {periodName || 'selected period'}
          </button>
        )}
      </div>

      {/* Calc result */}
      {calcResult && (
        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
          <CheckCircle2 size={15} className="text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700">{calcResult}</p>
        </div>
      )}

      {/* Financial base figures */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Tax base — {periodName || 'selected period'}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'Gross revenue',      value: figures.revenue,         color: 'text-green-700' },
            { label: 'Cost of sales',      value: figures.cos,             color: 'text-red-600' },
            { label: 'Gross profit',       value: figures.grossProfit,     color: figures.grossProfit >= 0 ? 'text-green-700' : 'text-red-600' },
            { label: 'Operating expenses', value: figures.opex,            color: 'text-red-600' },
            { label: 'Profit before tax',  value: figures.profitBeforeTax, color: figures.profitBeforeTax >= 0 ? 'text-brand-700' : 'text-red-600' },
            { label: `CIT rate (auto)`,    value: `${citRate}%`,           color: 'text-gray-700', isText: true },
          ].map(m => (
            <div key={m.label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">{m.label}</p>
              <p className={`text-sm font-bold ${m.color}`}>
                {(m as any).isText ? (m as any).value : fmt(m.value as number)}
              </p>
            </div>
          ))}
        </div>

        {/* CIT rate explanation */}
        {settings && (
          <div className="mt-4 p-3 bg-brand-50 rounded-lg border border-brand-100">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-brand-600 shrink-0 mt-0.5" />
              <div className="text-xs text-brand-700">
                <p className="font-semibold mb-1">CIT rate applied: {citRate}%</p>
                <p>Turnover ≤ ₦25M → 0% (Micro) · ₦25M–₦100M → 20% (Small) · &gt; ₦100M → 30% (Large)</p>
                <p className="mt-0.5">Current turnover: {fmt(figures.revenue)} — {
                  figures.revenue <= settings.cit_small_threshold ? 'Micro company — CIT exempt' :
                  figures.revenue <= settings.cit_medium_threshold ? 'Small company — 20% rate' :
                  'Large company — 30% rate'
                }</p>
                <p className="mt-0.5 text-brand-600">Minimum tax: 0.5% of gross turnover = {fmt(figures.revenue * 0.005)} applies if CIT computed is lower.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tax obligations for selected period */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Tax obligations — {periodName}</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-red-600 font-medium">Due: {fmt(totalTaxDue)}</span>
            <span className="text-green-600 font-medium">Paid (all time): {fmt(totalTaxPaid)}</span>
          </div>
        </div>

        {periodTaxes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Calculator size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No taxes calculated for this period yet.</p>
            {canManageJournals && (
              <button onClick={calculateTaxes} disabled={calculating}
                className="text-xs font-medium text-brand-600 hover:underline">
                Run calculation
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {periodTaxes.map(tax => {
              const info = TAX_INFO[tax.tax_type] ?? { label: tax.tax_type, authority: 'FIRS', filing: '—', color: 'bg-gray-100 text-gray-600' }
              return (
                <div key={tax.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${info.color}`}>
                          {tax.tax_type}
                        </span>
                        <span className="text-xs text-gray-500">{info.label}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[tax.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {tax.status.charAt(0).toUpperCase() + tax.status.slice(1)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-gray-400">Taxable amount</p>
                          <p className="font-semibold text-gray-700">{fmt(tax.taxable_amount)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Rate</p>
                          <p className="font-semibold text-gray-700">{fmtPct(tax.rate_pct)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Tax amount</p>
                          <p className="font-bold text-red-600">{fmt(tax.tax_amount)}</p>
                        </div>
                        {tax.tax_type === 'VAT' && (
                          <div>
                            <p className="text-gray-400">Net VAT payable</p>
                            <p className={`font-bold ${tax.net_vat >= 0 ? 'text-red-600' : 'text-green-700'}`}>
                              {fmt(Math.abs(tax.net_vat))}
                              {tax.net_vat < 0 ? ' (refund)' : ''}
                            </p>
                          </div>
                        )}
                      </div>

                      {tax.notes && (
                        <p className="text-xs text-gray-400 mt-2 italic">{tax.notes}</p>
                      )}

                      <div className="mt-2 text-xs text-gray-400">
                        <span className="font-medium text-gray-600">Authority:</span> {info.authority} ·
                        <span className="font-medium text-gray-600 ml-1">Filing:</span> {info.filing}
                      </div>
                    </div>

                    {/* Status actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {canManageJournals && tax.status === 'calculated' && (
                        <button onClick={() => updateStatus(tax.id, 'filed')}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
                          Mark filed
                        </button>
                      )}
                      {canManageJournals && (tax.status === 'calculated' || tax.status === 'filed') && (
                        <button onClick={() => updateStatus(tax.id, 'paid')}
                          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                          Mark paid
                        </button>
                      )}
                      {tax.status === 'paid' && (
                        <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                          <CheckCircle2 size={14} />
                          {tax.paid_date ? new Date(tax.paid_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Paid'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* All tax types reference */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Nigerian tax reference guide</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {Object.entries(TAX_INFO).map(([code, info]) => (
            <div key={code} className="px-5 py-3 flex items-center gap-4">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 w-16 text-center ${info.color}`}>{code}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{info.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{info.filing}</p>
              </div>
              <span className="text-xs text-gray-500 shrink-0">{info.authority}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

