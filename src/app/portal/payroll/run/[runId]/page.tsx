'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, CheckCircle2, Printer, Loader2,
  DollarSign, Edit2, Save, X, FileText
} from 'lucide-react'

interface RunLine {
  id: string
  employee_id: string
  full_name: string | null
  email: string
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  meal_allowance: number
  other_allowances: number
  bonus: number
  bonus_note: string | null
  gross_income: number
  pension_employee: number
  pension_employer: number
  cra: number
  taxable_income: number
  paye_tax: number
  advance_deduction: number
  other_deductions: number
  net_pay: number
  is_overridden: boolean
  override_net_pay: number | null
  override_note: string | null
  is_paid: boolean
  paid_at: string | null
  paid_amount: number | null
  payment_note: string | null
}

interface PayrollRun {
  id: string
  run_id: string
  period_label: string
  period_month: number
  period_year: number
  status: string
  total_gross: number
  total_net: number
  total_paye: number
  total_pension_employee: number
  total_pension_employer: number
  confirmed_at: string | null
}

const fmt = (n: number) => `₦${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600'  },
  confirmed: { label: 'Confirmed', color: 'bg-blue-50 text-blue-700'   },
  paid:      { label: 'Paid',      color: 'bg-green-50 text-green-700' },
}

export default function PayrollRunPage() {
  const params  = useParams()
  const router  = useRouter()
  const runId   = params.runId as string

  const [run, setRun]             = useState<PayrollRun | null>(null)
  const [lines, setLines]         = useState<RunLine[]>([])
  const [loading, setLoading]     = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [confirming, setConfirming]   = useState(false)

  // Edit override state
  const [editingLine, setEditingLine]     = useState<string | null>(null)
  const [overrideValue, setOverrideValue] = useState('')
  const [overrideNote, setOverrideNote]   = useState('')

  // Mark paid state
  const [payingLine, setPayingLine]       = useState<string | null>(null)
  const [paidAmount, setPaidAmount]       = useState('')
  const [paidNote, setPaidNote]           = useState('')

  // Payslip
  const [payslipLine, setPayslipLine]     = useState<RunLine | null>(null)
  const [settings, setSettings]           = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: runData }, { data: linesData }, { data: settingsData }, { data: authData }] = await Promise.all([
      supabase.from('payroll_runs').select('*').eq('id', runId).single(),
      supabase.from('payroll_run_lines').select(`
        *,
        profile:payroll_employees!payroll_run_lines_employee_id_fkey(
          employee_id,
          profile:profiles!payroll_employees_employee_id_fkey(full_name, email),
          bank:payroll_bank_accounts(bank_name, account_name, account_number)
        )
      `).eq('run_id', runId).order('created_at'),
      supabase.from('finance_settings').select('key, value'),
      supabase.auth.getUser(),
    ])

    setRun(runData)
    setSettings(Object.fromEntries((settingsData ?? []).map(s => [s.key, s.value])))

    if (authData.user) {
      setCurrentUser({ id: authData.user.id })
    }

    setLines((linesData ?? []).map(l => ({
      id:                  l.id,
      employee_id:         l.employee_id,
      full_name:           (l.profile as any)?.profile?.full_name ?? null,
      email:               (l.profile as any)?.profile?.email ?? '',
      bank_name:           (l.profile as any)?.bank?.[0]?.bank_name ?? null,
      account_name:        (l.profile as any)?.bank?.[0]?.account_name ?? null,
      account_number:      (l.profile as any)?.bank?.[0]?.account_number ?? null,
      basic_salary:        Number(l.basic_salary),
      housing_allowance:   Number(l.housing_allowance),
      transport_allowance: Number(l.transport_allowance),
      meal_allowance:      Number(l.meal_allowance),
      other_allowances:    Number(l.other_allowances),
      bonus:               Number(l.bonus),
      bonus_note:          l.bonus_note,
      gross_income:        Number(l.gross_income),
      pension_employee:    Number(l.pension_employee),
      pension_employer:    Number(l.pension_employer),
      cra:                 Number(l.cra),
      taxable_income:      Number(l.taxable_income),
      paye_tax:            Number(l.paye_tax),
      advance_deduction:   Number(l.advance_deduction),
      other_deductions:    Number(l.other_deductions),
      net_pay:             Number(l.net_pay),
      is_overridden:       l.is_overridden,
      override_net_pay:    l.override_net_pay ? Number(l.override_net_pay) : null,
      override_note:       l.override_note,
      is_paid:             l.is_paid,
      paid_at:             l.paid_at,
      paid_amount:         l.paid_amount ? Number(l.paid_amount) : null,
      payment_note:        l.payment_note,
    })))

    setLoading(false)
  }, [runId])

  useEffect(() => { load() }, [load])

  async function confirmRun() {
    if (!run) return
    setConfirming(true)
    const supabase = createClient()
    await supabase.from('payroll_runs').update({
      status:       'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: currentUser?.id,
    }).eq('id', runId)
    setConfirming(false)
    load()
  }

  async function saveOverride(lineId: string) {
    const supabase = createClient()
    await supabase.from('payroll_run_lines').update({
      is_overridden:   true,
      override_net_pay: parseFloat(overrideValue) || null,
      override_note:   overrideNote || null,
    }).eq('id', lineId)
    setEditingLine(null)
    load()
  }

  async function markPaid(lineId: string, line: RunLine) {
    const supabase = createClient()
    const amount = parseFloat(paidAmount) || (line.is_overridden ? line.override_net_pay : line.net_pay) || 0
    await supabase.from('payroll_run_lines').update({
      is_paid:      true,
      paid_at:      new Date().toISOString(),
      paid_amount:  amount,
      paid_by:      currentUser?.id,
      payment_note: paidNote || null,
    }).eq('id', lineId)

    // Check if all lines are paid — update run status
    const updatedLines = lines.map(l => l.id === lineId ? { ...l, is_paid: true } : l)
    if (updatedLines.every(l => l.is_paid)) {
      await supabase.from('payroll_runs').update({ status: 'paid' }).eq('id', runId)
    }

    setPayingLine(null)
    setPaidAmount('')
    setPaidNote('')
    load()
  }

  const totalNet    = lines.reduce((s, l) => s + (l.is_overridden ? (l.override_net_pay ?? l.net_pay) : l.net_pay), 0)
  const totalPaid   = lines.filter(l => l.is_paid).reduce((s, l) => s + (l.paid_amount ?? 0), 0)
  const paidCount   = lines.filter(l => l.is_paid).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-600" />
    </div>
  )

  if (!run) return (
    <div className="text-center py-16 text-gray-400">Payroll run not found.</div>
  )

  const statusCfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.draft
  const sigImage  = settings.authorized_signature ?? ''
  const sigName   = settings.authorized_signatory_name ?? 'Authorized Signatory'
  const companyName = settings.company_name ?? 'Hydevest Solutions Limited'

  return (
    <div className="space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">{run.period_label}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">{run.run_id} · {lines.length} employees</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {run.status === 'draft' && (
            <button onClick={confirmRun} disabled={confirming}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50">
              {confirming ? <><Loader2 size={14} className="animate-spin" /> Confirming…</> : <><CheckCircle2 size={14} /> Confirm run</>}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total gross',    value: fmt(run.total_gross),            color: 'text-gray-800',  bg: 'bg-gray-50'   },
          { label: 'Total PAYE',     value: fmt(run.total_paye),             color: 'text-red-700',   bg: 'bg-red-50'    },
          { label: 'Pension (EE)',   value: fmt(run.total_pension_employee), color: 'text-blue-700',  bg: 'bg-blue-50'   },
          { label: 'Total net pay',  value: fmt(totalNet),                   color: 'text-green-700', bg: 'bg-green-50'  },
          { label: 'Total paid out', value: fmt(totalPaid),                  color: 'text-brand-700', bg: 'bg-brand-50'  },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <p className="text-xs text-gray-500 mb-1">{m.label}</p>
            <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Payment progress */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>Payment progress</span>
          <span className="font-semibold">{paidCount} of {lines.length} employees paid</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${paidCount === lines.length ? 'bg-green-500' : 'bg-brand-500'}`}
            style={{ width: `${lines.length > 0 ? (paidCount / lines.length) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Employee payroll lines</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Employee','Bank','Gross','Pension','PAYE','Bonus','Advance','Net pay','Override','Status','Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lines.map(line => {
                const effectiveNet = line.is_overridden ? (line.override_net_pay ?? line.net_pay) : line.net_pay
                const isEditing    = editingLine === line.id
                const isPaying     = payingLine  === line.id

                return (
                  <tr key={line.id} className={`hover:bg-gray-50/50 ${line.is_paid ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="text-xs font-semibold text-gray-900">{line.full_name ?? line.email}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {line.bank_name ? (
                        <div>
                          <p className="text-xs text-gray-600">{line.bank_name}</p>
                          <p className="text-xs font-mono text-gray-400">{line.account_number}</p>
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-gray-800 whitespace-nowrap">{fmt(line.gross_income)}</td>
                    <td className="px-3 py-3 text-xs text-red-600 whitespace-nowrap">{fmt(line.pension_employee)}</td>
                    <td className="px-3 py-3 text-xs text-red-600 whitespace-nowrap">{fmt(line.paye_tax)}</td>
                    <td className="px-3 py-3 text-xs text-brand-600 whitespace-nowrap">
                      {line.bonus > 0 ? fmt(line.bonus) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-amber-600 whitespace-nowrap">
                      {line.advance_deduction > 0 ? fmt(line.advance_deduction) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-sm font-bold text-green-700">{fmt(effectiveNet)}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input type="number" value={overrideValue}
                            onChange={e => setOverrideValue(e.target.value)}
                            placeholder="Net pay"
                            className="w-24 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          <input value={overrideNote}
                            onChange={e => setOverrideNote(e.target.value)}
                            placeholder="Note"
                            className="w-24 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          <button onClick={() => saveOverride(line.id)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded">
                            <Save size={12} />
                          </button>
                          <button onClick={() => setEditingLine(null)}
                            className="p-1 text-red-400 hover:bg-red-50 rounded">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {line.is_overridden && (
                            <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                              Overridden
                            </span>
                          )}
                          {!line.is_paid && run.status !== 'paid' && (
                            <button onClick={() => {
                              setEditingLine(line.id)
                              setOverrideValue(effectiveNet.toString())
                              setOverrideNote(line.override_note ?? '')
                            }}
                              className="p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded">
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {line.is_paid ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                          Paid
                        </span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          Unpaid
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {/* Payslip button */}
                        <button onClick={() => setPayslipLine(line)}
                          className="p-1.5 rounded hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors"
                          title="View payslip">
                          <FileText size={13} />
                        </button>

                        {/* Mark paid button */}
                        {!line.is_paid && run.status === 'confirmed' && (
                          isPaying ? (
                            <div className="flex items-center gap-1">
                              <input type="number" value={paidAmount}
                                onChange={e => setPaidAmount(e.target.value)}
                                placeholder={effectiveNet.toString()}
                                className="w-24 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none" />
                              <input value={paidNote}
                                onChange={e => setPaidNote(e.target.value)}
                                placeholder="Note"
                                className="w-20 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none" />
                              <button onClick={() => markPaid(line.id, line)}
                                className="p-1 text-green-600 hover:bg-green-50 rounded">
                                <Save size={12} />
                              </button>
                              <button onClick={() => setPayingLine(null)}
                                className="p-1 text-red-400 hover:bg-red-50 rounded">
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => {
                              setPayingLine(line.id)
                              setPaidAmount(effectiveNet.toString())
                            }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">
                              <DollarSign size={11} /> Mark paid
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payslip modal */}
      {payslipLine && (
        <PayslipModal
          line={payslipLine}
          run={run}
          companyName={companyName}
          sigImage={sigImage}
          sigName={sigName}
          onClose={() => setPayslipLine(null)}
        />
      )}
    </div>
  )
}

// ── PAYSLIP MODAL ─────────────────────────────────────────────────────────────
function PayslipModal({
  line, run, companyName, sigImage, sigName, onClose
}: {
  line: RunLine
  run: PayrollRun
  companyName: string
  sigImage: string
  sigName: string
  onClose: () => void
}) {
  const fmt2 = (n: number) => `₦${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // All figures are editable before printing
  const [basic,       setBasic]       = useState(line.basic_salary.toString())
  const [housing,     setHousing]     = useState(line.housing_allowance.toString())
  const [transport,   setTransport]   = useState(line.transport_allowance.toString())
  const [meal,        setMeal]        = useState(line.meal_allowance.toString())
  const [other,       setOther]       = useState(line.other_allowances.toString())
  const [bonus,       setBonus]       = useState(line.bonus.toString())
  const [pensionEE,   setPensionEE]   = useState(line.pension_employee.toString())
  const [paye,        setPaye]        = useState(line.paye_tax.toString())
  const [advDeduct,   setAdvDeduct]   = useState(line.advance_deduction.toString())
  const [otherDeduct, setOtherDeduct] = useState(line.other_deductions.toString())
  const [showEdit,    setShowEdit]    = useState(false)

  const gross   = [basic, housing, transport, meal, other, bonus].reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const netPay  = gross - (parseFloat(pensionEE) || 0) - (parseFloat(paye) || 0) - (parseFloat(advDeduct) || 0) - (parseFloat(otherDeduct) || 0)
  const invoiceDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Modal controls */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 print:hidden">
          <h3 className="text-sm font-semibold text-gray-800">Payslip — {line.full_name ?? line.email}</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEdit(!showEdit)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              <Edit2 size={12} /> {showEdit ? 'Hide edits' : 'Edit figures'}
            </button>
            <button onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90"
              style={{ background: '#55249E' }}>
              <Printer size={12} /> Print / PDF
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Edit panel */}
        {showEdit && (
          <div className="p-4 bg-amber-50 border-b border-amber-100 print:hidden">
            <p className="text-xs font-semibold text-amber-800 mb-3">Edit payslip figures before printing</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Basic',        value: basic,       set: setBasic       },
                { label: 'Housing',      value: housing,     set: setHousing     },
                { label: 'Transport',    value: transport,   set: setTransport   },
                { label: 'Meal',         value: meal,        set: setMeal        },
                { label: 'Other allow.', value: other,       set: setOther       },
                { label: 'Bonus',        value: bonus,       set: setBonus       },
                { label: 'Pension (EE)', value: pensionEE,   set: setPensionEE   },
                { label: 'PAYE',         value: paye,        set: setPaye        },
                { label: 'Advance ded.', value: advDeduct,   set: setAdvDeduct   },
                { label: 'Other deduct', value: otherDeduct, set: setOtherDeduct },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs text-amber-700 mb-1">{f.label}</label>
                  <input type="number" value={f.value} onChange={e => f.set(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAYSLIP DOCUMENT */}
        <div id="payslip-document" style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, padding: '24px 28px' }}>

          {/* Header */}
          <div style={{ background: '#55249E', padding: '14px 20px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ background: 'white', borderRadius: 6, padding: '3px 6px' }}>
                <img src="/logo.png" alt="Logo" style={{ height: 32, objectFit: 'contain' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </div>
              <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>{companyName}</span>
            </div>
            <div style={{ color: 'white', textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>PAYSLIP</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{run.period_label}</div>
            </div>
          </div>

          {/* Employee info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ background: '#f8f7ff', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#55249E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Employee</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{line.full_name ?? line.email}</div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{line.email}</div>
            </div>
            <div style={{ background: '#f8f7ff', borderRadius: 8, padding: '10px 14px', textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#55249E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Payment details</div>
              {line.bank_name && <div style={{ fontSize: 11, fontWeight: 600, color: '#111' }}>{line.bank_name}</div>}
              {line.account_name && <div style={{ fontSize: 10, color: '#666' }}>{line.account_name}</div>}
              {line.account_number && <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#111', letterSpacing: 1 }}>{line.account_number}</div>}
            </div>
          </div>

          {/* Earnings and Deductions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* Earnings */}
            <div>
              <div style={{ background: '#55249E', color: 'white', padding: '6px 10px', borderRadius: '6px 6px 0 0', fontSize: 10, fontWeight: 700 }}>
                EARNINGS
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <tbody>
                  {[
                    { label: 'Basic salary',        value: parseFloat(basic)       || 0 },
                    { label: 'Housing allowance',   value: parseFloat(housing)     || 0 },
                    { label: 'Transport allowance', value: parseFloat(transport)   || 0 },
                    { label: 'Meal allowance',      value: parseFloat(meal)        || 0 },
                    { label: 'Other allowances',    value: parseFloat(other)       || 0 },
                    { label: 'Bonus',               value: parseFloat(bonus)       || 0 },
                  ].filter(r => r.value > 0).map((row, i) => (
                    <tr key={row.label} style={{ background: i % 2 === 0 ? '#f8f7ff' : '#fff' }}>
                      <td style={{ padding: '5px 8px', color: '#555' }}>{row.label}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: '#111' }}>{fmt2(row.value)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #55249E', background: '#f0ecfc' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 700, color: '#111' }}>Gross earnings</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 800, color: '#55249E', fontSize: 12 }}>{fmt2(gross)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Deductions */}
            <div>
              <div style={{ background: '#dc2626', color: 'white', padding: '6px 10px', borderRadius: '6px 6px 0 0', fontSize: 10, fontWeight: 700 }}>
                DEDUCTIONS
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <tbody>
                  {[
                    { label: 'Pension (Employee 8%)', value: parseFloat(pensionEE)   || 0 },
                    { label: 'PAYE tax',              value: parseFloat(paye)        || 0 },
                    { label: 'Salary advance',        value: parseFloat(advDeduct)   || 0 },
                    { label: 'Other deductions',      value: parseFloat(otherDeduct) || 0 },
                  ].filter(r => r.value > 0).map((row, i) => (
                    <tr key={row.label} style={{ background: i % 2 === 0 ? '#fff5f5' : '#fff' }}>
                      <td style={{ padding: '5px 8px', color: '#555' }}>{row.label}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{fmt2(row.value)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #dc2626', background: '#fef2f2' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 700, color: '#111' }}>Total deductions</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: 12 }}>
                      {fmt2((parseFloat(pensionEE) || 0) + (parseFloat(paye) || 0) + (parseFloat(advDeduct) || 0) + (parseFloat(otherDeduct) || 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net pay */}
          <div style={{ background: 'linear-gradient(135deg, #55249E, #7c3aed)', borderRadius: 8, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: 10, opacity: 0.8 }}>NET PAY</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt2(netPay)}</div>
            </div>
            <div style={{ color: 'white', textAlign: 'right', fontSize: 10, opacity: 0.8 }}>
              <div>{run.period_label}</div>
              <div style={{ marginTop: 2 }}>{invoiceDate}</div>
            </div>
          </div>

          {/* Signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
            <div>
              <div style={{ borderBottom: '1.5px solid #333', minHeight: 52, marginBottom: 6, display: 'flex', alignItems: 'flex-end' }}>
                {sigImage ? (
                  <img src={sigImage} alt="Signature"
                    style={{ height: 48, maxWidth: 200, objectFit: 'contain', mixBlendMode: 'multiply' }} />
                ) : null}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#111' }}>Authorized Signatory</div>
              <div style={{ fontSize: 9, color: '#666' }}>{companyName}</div>
              <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>Date: {invoiceDate}</div>
            </div>
            <div>
              <div style={{ borderBottom: '1.5px solid #333', minHeight: 52, marginBottom: 6 }}></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#111' }}>{line.full_name ?? 'Employee'}</div>
              <div style={{ fontSize: 9, color: '#666' }}>Employee Signature</div>
              <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>Date: ___________</div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: 8, textAlign: 'center', fontSize: 9, color: '#aaa', marginTop: 16 }}>
            {companyName} · This is a computer generated payslip · {run.run_id}
          </div>
        </div>

      </div>

      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { visibility: hidden; }
          #payslip-document, #payslip-document * { visibility: visible; }
          #payslip-document { position: fixed; left: 0; top: 0; width: 100%; padding: 1cm; }
          .print\\:hidden { display: none !important; }
          @page { margin: 0.5cm; size: A4 portrait; }
        }
      `}</style>
    </div>
  )
}
