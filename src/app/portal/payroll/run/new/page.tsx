'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Play, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface PayrollEmployee {
  id: string
  profile_id: string
  full_name: string | null
  email: string
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  meal_allowance: number
  other_allowances: number
  other_allowances_note: string | null
  pending_advance: number
  bank_name: string | null
  account_number: string | null
}

interface ComputedLine {
  employee_id: string
  full_name: string
  gross: number
  pensionable: number
  pension_ee: number
  pension_er: number
  cra: number
  taxable: number
  paye: number
  advance_deduction: number
  net_pay: number
  bonus: number
  bonus_note: string
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function computePAYE(taxableIncome: number, gross: number): number {
  if (taxableIncome <= 0) return gross * 0.01
  const bands = [
    { limit: 300000,   rate: 0.07 },
    { limit: 300000,   rate: 0.11 },
    { limit: 500000,   rate: 0.15 },
    { limit: 500000,   rate: 0.19 },
    { limit: 1600000,  rate: 0.21 },
    { limit: Infinity, rate: 0.24 },
  ]
  let tax = 0
  let remaining = taxableIncome
  for (const band of bands) {
    if (remaining <= 0) break
    const chunk = Math.min(remaining, band.limit)
    tax += chunk * band.rate
    remaining -= chunk
  }
  return Math.max(tax, gross * 0.01)
}

function computeEmployee(emp: PayrollEmployee, bonus: number): ComputedLine {
  const gross       = emp.basic_salary + emp.housing_allowance + emp.transport_allowance + emp.meal_allowance + emp.other_allowances + bonus
  const pensionable = emp.basic_salary + emp.housing_allowance + emp.transport_allowance
  const pension_ee  = pensionable * 0.08
  const pension_er  = pensionable * 0.10
  const cra         = 200000 + (gross * 0.20)
  const taxable     = Math.max(0, gross - cra - pension_ee)
  const paye        = computePAYE(taxable, gross)
  const net_pay     = gross - pension_ee - paye - emp.pending_advance + 0

  return {
    employee_id:       emp.id,
    full_name:         emp.full_name ?? emp.email,
    gross,
    pensionable,
    pension_ee,
    pension_er,
    cra,
    taxable,
    paye,
    advance_deduction: 0,
    net_pay,
    bonus,
    bonus_note:        '',
  }
}

export default function NewPayrollRunPage() {
  const router = useRouter()
  const now    = new Date()

  const [month, setMonth]       = useState(now.getMonth() + 1)
  const [year, setYear]         = useState(now.getFullYear())
  const [employees, setEmployees] = useState<PayrollEmployee[]>([])
  const [lines, setLines]       = useState<ComputedLine[]>([])
  const [bonuses, setBonuses]   = useState<Record<string, string>>({})
  const [bonusNotes, setBonusNotes] = useState<Record<string, string>>({})
  const [advDeductions, setAdvDeductions] = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState(false)
  const [computed, setComputed] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [existingRun, setExistingRun] = useState(false)

  async function loadEmployees() {
    setLoading(true)
    const supabase = createClient()

    // Check if run already exists for this period
    const { data: existing } = await supabase
      .from('payroll_runs')
      .select('id')
      .eq('period_month', month)
      .eq('period_year', year)
      .single()

    if (existing) {
      setExistingRun(true)
      setLoading(false)
      return
    }
    setExistingRun(false)

    // Load salary earning employees
    const { data: payrollEmps } = await supabase
      .from('payroll_employees')
      .select(`
        id, basic_salary, housing_allowance, transport_allowance,
        meal_allowance, other_allowances, other_allowances_note,
        profile:profiles!payroll_employees_employee_id_fkey(id, full_name, email),
        bank:payroll_bank_accounts(bank_name, account_number)
      `)
      .eq('is_salary_earning', true)
      .eq('is_active', true)

    // Load approved advances for each employee
    const empIds = (payrollEmps ?? []).map(e => e.id)
    const { data: advances } = empIds.length > 0
      ? await supabase.from('payroll_advances')
          .select('employee_id, amount')
          .eq('status', 'approved')
          .in('employee_id', empIds)
      : { data: [] }

    const advMap: Record<string, number> = {}
    for (const adv of (advances ?? [])) {
      advMap[adv.employee_id] = (advMap[adv.employee_id] ?? 0) + Number(adv.amount)
    }

    const emps: PayrollEmployee[] = (payrollEmps ?? []).map(e => ({
      id:                    e.id,
      profile_id:            (e.profile as any)?.id,
      full_name:             (e.profile as any)?.full_name,
      email:                 (e.profile as any)?.email,
      basic_salary:          Number(e.basic_salary),
      housing_allowance:     Number(e.housing_allowance),
      transport_allowance:   Number(e.transport_allowance),
      meal_allowance:        Number(e.meal_allowance),
      other_allowances:      Number(e.other_allowances),
      other_allowances_note: e.other_allowances_note,
      pending_advance:       advMap[e.id] ?? 0,
      bank_name:             (e.bank as any)?.[0]?.bank_name ?? null,
      account_number:        (e.bank as any)?.[0]?.account_number ?? null,
    }))

    setEmployees(emps)

    // Compute initial lines
    const initialLines = emps.map(emp => computeEmployee(emp, 0))
    setLines(initialLines)
    setComputed(true)
    setLoading(false)
  }

  function recompute() {
    const newLines = employees.map((emp, i) => {
      const bonus     = parseFloat(bonuses[emp.id] ?? '0') || 0
      const advDeduct = parseFloat(advDeductions[emp.id] ?? '0') || 0
      const line      = computeEmployee(emp, bonus)
      line.advance_deduction = advDeduct
      line.net_pay    = line.gross - line.pension_ee - line.paye - advDeduct
      line.bonus_note = bonusNotes[emp.id] ?? ''
      return line
    })
    setLines(newLines)
  }

  useEffect(() => { if (computed) recompute() }, [bonuses, bonusNotes, advDeductions])

  async function saveRun() {
    if (!lines.length) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const seq      = Date.now().toString().slice(-5)
    const runLabel = `${MONTHS[month - 1]} ${year}`

    const totalGross   = lines.reduce((s, l) => s + l.gross, 0)
    const totalNet     = lines.reduce((s, l) => s + l.net_pay, 0)
    const totalPAYE    = lines.reduce((s, l) => s + l.paye, 0)
    const totalPensEE  = lines.reduce((s, l) => s + l.pension_ee, 0)
    const totalPensER  = lines.reduce((s, l) => s + l.pension_er, 0)

    const { data: run } = await supabase.from('payroll_runs').insert({
      run_id:                 `PAY-${year}-${String(month).padStart(2, '0')}-${seq}`,
      period_month:           month,
      period_year:            year,
      period_label:           runLabel,
      status:                 'draft',
      total_gross:            totalGross,
      total_net:              totalNet,
      total_paye:             totalPAYE,
      total_pension_employee: totalPensEE,
      total_pension_employer: totalPensER,
      created_by:             user?.id,
    }).select().single()

    if (!run) { setSaving(false); return }

    // Insert run lines
    await supabase.from('payroll_run_lines').insert(
      lines.map(l => ({
        run_id:              run.id,
        employee_id:         l.employee_id,
        basic_salary:        employees.find(e => e.id === l.employee_id)?.basic_salary ?? 0,
        housing_allowance:   employees.find(e => e.id === l.employee_id)?.housing_allowance ?? 0,
        transport_allowance: employees.find(e => e.id === l.employee_id)?.transport_allowance ?? 0,
        meal_allowance:      employees.find(e => e.id === l.employee_id)?.meal_allowance ?? 0,
        other_allowances:    employees.find(e => e.id === l.employee_id)?.other_allowances ?? 0,
        bonus:               l.bonus,
        bonus_note:          l.bonus_note || null,
        gross_income:        l.gross,
        pension_employee:    l.pension_ee,
        pension_employer:    l.pension_er,
        cra:                 l.cra,
        taxable_income:      l.taxable,
        paye_tax:            l.paye,
        advance_deduction:   l.advance_deduction,
        net_pay:             l.net_pay,
      }))
    )

    // Mark advances as deducted
    for (const line of lines) {
      if (line.advance_deduction > 0) {
        await supabase.from('payroll_advances')
          .update({ status: 'deducted', deducted_run_id: run.id })
          .eq('employee_id', line.employee_id)
          .eq('status', 'approved')
      }
    }

    setSaving(false)
    router.push(`/portal/payroll/run/${run.id}`)
  }

  const totalGross  = lines.reduce((s, l) => s + l.gross, 0)
  const totalNet    = lines.reduce((s, l) => s + l.net_pay, 0)
  const totalPAYE   = lines.reduce((s, l) => s + l.paye, 0)
  const totalPensEE = lines.reduce((s, l) => s + l.pension_ee, 0)

  return (
    <div className="space-y-5 max-w-7xl">

      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New payroll run</h1>
          <p className="text-sm text-gray-400">Select period and compute payroll</p>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Select payroll period</h3>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Month</label>
            <select value={month} onChange={e => { setMonth(parseInt(e.target.value)); setComputed(false) }}
              className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Year</label>
            <select value={year} onChange={e => { setYear(parseInt(e.target.value)); setComputed(false) }}
              className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button onClick={loadEmployees} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {loading ? <><Loader2 size={14} className="animate-spin" /> Loading…</> : <><Play size={14} /> Compute payroll</>}
          </button>
        </div>

        {existingRun && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <AlertTriangle size={14} className="text-amber-600" />
            <p className="text-sm text-amber-700">
              A payroll run already exists for {MONTHS[month - 1]} {year}.
              <button onClick={() => router.push('/portal/payroll')}
                className="ml-2 font-medium underline">View existing run</button>
            </p>
          </div>
        )}
      </div>

      {/* Computed lines */}
      {computed && !existingRun && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Employees',    value: lines.length.toString(), color: 'text-blue-700',  bg: 'bg-blue-50'  },
              { label: 'Total gross',  value: fmt(totalGross),         color: 'text-gray-800',  bg: 'bg-gray-50'  },
              { label: 'Total PAYE',   value: fmt(totalPAYE),          color: 'text-red-700',   bg: 'bg-red-50'   },
              { label: 'Total net pay',value: fmt(totalNet),           color: 'text-green-700', bg: 'bg-green-50' },
            ].map(m => (
              <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
                <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {lines.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 flex flex-col items-center gap-2">
              <AlertTriangle size={24} className="text-amber-300" />
              <p className="text-sm text-gray-500 font-medium">No salary earning employees found</p>
              <p className="text-xs text-gray-400">Go to Payroll → Employees and toggle salary earning for employees</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">
                  Payroll computation — {MONTHS[month - 1]} {year}
                </h3>
                <p className="text-xs text-gray-400">Add bonuses or advance deductions below</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      {['Employee','Gross','Pension (EE)','PAYE','Bonus','Advance deduct','Net pay'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lines.map((line, i) => {
                      const emp = employees.find(e => e.id === line.employee_id)
                      return (
                        <tr key={line.employee_id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{line.full_name}</p>
                            {emp?.bank_name && (
                              <p className="text-xs text-gray-400">{emp.bank_name} · {emp.account_number}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-gray-800 whitespace-nowrap">{fmt(line.gross)}</td>
                          <td className="px-4 py-3 text-xs text-red-600 whitespace-nowrap">{fmt(line.pension_ee)}</td>
                          <td className="px-4 py-3 text-xs text-red-600 whitespace-nowrap">{fmt(line.paye)}</td>
                          <td className="px-4 py-3">
                            <input type="number" min="0"
                              value={bonuses[line.employee_id] ?? ''}
                              onChange={e => setBonuses(b => ({ ...b, [line.employee_id]: e.target.value }))}
                              placeholder="0"
                              className="w-28 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          </td>
                          <td className="px-4 py-3">
                            {emp?.pending_advance ? (
                              <div className="flex items-center gap-1">
                                <input type="number" min="0" max={emp.pending_advance}
                                  value={advDeductions[line.employee_id] ?? ''}
                                  onChange={e => setAdvDeductions(d => ({ ...d, [line.employee_id]: e.target.value }))}
                                  placeholder="0"
                                  className="w-28 px-2 py-1 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 bg-amber-50" />
                                <span className="text-xs text-amber-600 whitespace-nowrap">
                                  (pending: {fmt(emp.pending_advance)})
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-green-700 whitespace-nowrap">{fmt(line.net_pay)}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-3 text-xs font-bold text-gray-700">Totals</td>
                      <td className="px-4 py-3 text-xs font-bold text-gray-800">{fmt(totalGross)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-red-600">{fmt(totalPensEE)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-red-600">{fmt(totalPAYE)}</td>
                      <td className="px-4 py-3 text-xs font-bold text-brand-600">
                        {fmt(lines.reduce((s, l) => s + l.bonus, 0))}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-amber-700">
                        {fmt(lines.reduce((s, l) => s + l.advance_deduction, 0))}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-green-700">{fmt(totalNet)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Review the figures above. You can adjust bonuses and advance deductions before saving.
                </p>
                <button onClick={saveRun} disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50">
                  {saving
                    ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                    : <><CheckCircle2 size={14} /> Save payroll run</>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
