'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Building2, Plus, Trash2 } from 'lucide-react'

interface EmployeeProfile {
  id: string
  full_name: string | null
  email: string
}

interface PayrollEmployee {
  id: string
  is_salary_earning: boolean
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  meal_allowance: number
  other_allowances: number
  other_allowances_note: string | null
}

interface BankAccount {
  id: string
  bank_name: string
  account_name: string
  account_number: string
  is_active: boolean
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function PayrollEmployeePage() {
  const params     = useParams()
  const router     = useRouter()
  const profileId  = params.employeeId as string

  const [profile, setProfile]     = useState<EmployeeProfile | null>(null)
  const [payroll, setPayroll]     = useState<PayrollEmployee | null>(null)
  const [bank, setBank]           = useState<BankAccount | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)

  const [form, setForm] = useState({
    is_salary_earning:     false,
    basic_salary:          '',
    housing_allowance:     '',
    transport_allowance:   '',
    meal_allowance:        '',
    other_allowances:      '',
    other_allowances_note: '',
  })

  const [bankForm, setBankForm] = useState({
    bank_name:      '',
    account_name:   '',
    account_number: '',
  })

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: profileData }, { data: payrollData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('id', profileId).single(),
      supabase.from('payroll_employees').select('*').eq('employee_id', profileId).single(),
    ])

    setProfile(profileData)

    if (payrollData) {
      setPayroll(payrollData)
      setForm({
        is_salary_earning:     payrollData.is_salary_earning,
        basic_salary:          payrollData.basic_salary?.toString() ?? '',
        housing_allowance:     payrollData.housing_allowance?.toString() ?? '',
        transport_allowance:   payrollData.transport_allowance?.toString() ?? '',
        meal_allowance:        payrollData.meal_allowance?.toString() ?? '',
        other_allowances:      payrollData.other_allowances?.toString() ?? '',
        other_allowances_note: payrollData.other_allowances_note ?? '',
      })

      const { data: bankData } = await supabase
        .from('payroll_bank_accounts')
        .select('*')
        .eq('employee_id', payrollData.id)
        .eq('is_active', true)
        .single()

      if (bankData) {
        setBank(bankData)
        setBankForm({
          bank_name:      bankData.bank_name,
          account_name:   bankData.account_name,
          account_number: bankData.account_number,
        })
      }
    }

    setLoading(false)
  }, [profileId])

  useEffect(() => { load() }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      employee_id:           profileId,
      is_salary_earning:     form.is_salary_earning,
      basic_salary:          parseFloat(form.basic_salary)          || 0,
      housing_allowance:     parseFloat(form.housing_allowance)     || 0,
      transport_allowance:   parseFloat(form.transport_allowance)   || 0,
      meal_allowance:        parseFloat(form.meal_allowance)        || 0,
      other_allowances:      parseFloat(form.other_allowances)      || 0,
      other_allowances_note: form.other_allowances_note || null,
      updated_at:            new Date().toISOString(),
    }

    let payrollId = payroll?.id

    if (payroll) {
      await supabase.from('payroll_employees').update(payload).eq('id', payroll.id)
    } else {
      const { data: newPayroll } = await supabase.from('payroll_employees')
        .insert({ ...payload, created_by: user?.id })
        .select().single()
      payrollId = newPayroll?.id
    }

    // Save bank account
    if (payrollId && (bankForm.bank_name || bankForm.account_number)) {
      if (bank) {
        await supabase.from('payroll_bank_accounts').update({
          bank_name:      bankForm.bank_name,
          account_name:   bankForm.account_name,
          account_number: bankForm.account_number,
        }).eq('id', bank.id)
      } else {
        await supabase.from('payroll_bank_accounts').insert({
          employee_id:    payrollId,
          bank_name:      bankForm.bank_name,
          account_name:   bankForm.account_name,
          account_number: bankForm.account_number,
        })
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    load()
  }

  // Computed preview
  const basic    = parseFloat(form.basic_salary)          || 0
  const housing  = parseFloat(form.housing_allowance)     || 0
  const transport= parseFloat(form.transport_allowance)   || 0
  const meal     = parseFloat(form.meal_allowance)        || 0
  const other    = parseFloat(form.other_allowances)      || 0
  const gross    = basic + housing + transport + meal + other
  const pensionable = basic + housing + transport
  const pensionEE   = pensionable * 0.08
  const pensionER   = pensionable * 0.10
  const cra         = 200000 + (gross * 0.20)
  const taxable     = Math.max(0, gross - cra - pensionEE)

  function computePAYE(taxableIncome: number): number {
    if (taxableIncome <= 0) return 0
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
      const taxable = Math.min(remaining, band.limit)
      tax += taxable * band.rate
      remaining -= taxable
    }
    const minimumTax = gross * 0.01
    return Math.max(tax, minimumTax)
  }

  const paye   = computePAYE(taxable)
  const netPay = gross - pensionEE - paye

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-600" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-4xl">

      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {profile?.full_name ?? profile?.email ?? '—'}
          </h1>
          <p className="text-sm text-gray-400">Payroll configuration</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">

        {/* Salary earning toggle */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Include in payroll</p>
              <p className="text-xs text-gray-400 mt-0.5">Toggle to include this employee in monthly payroll runs</p>
            </div>
            <button type="button"
              onClick={() => setForm(f => ({ ...f, is_salary_earning: !f.is_salary_earning }))}
              className={`w-11 h-6 rounded-full transition-colors relative ${form.is_salary_earning ? 'bg-brand-600' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.is_salary_earning ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {/* Salary components */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Salary components (monthly)</h3>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            {[
              { key: 'basic_salary',        label: 'Basic salary',        required: true  },
              { key: 'housing_allowance',   label: 'Housing allowance',   required: false },
              { key: 'transport_allowance', label: 'Transport allowance', required: false },
              { key: 'meal_allowance',      label: 'Meal allowance',      required: false },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {field.label} {field.required && <span className="text-red-400">*</span>}
                </label>
                <input type="number" step="0.01" min="0"
                  value={(form as any)[field.key]}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Other allowances</label>
              <input type="number" step="0.01" min="0"
                value={form.other_allowances}
                onChange={e => setForm(f => ({ ...f, other_allowances: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Other allowances note</label>
              <input value={form.other_allowances_note}
                onChange={e => setForm(f => ({ ...f, other_allowances_note: e.target.value }))}
                placeholder="e.g. Car maintenance"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>

        {/* Bank account */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <Building2 size={14} className="text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Bank account for salary payment</h3>
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank name</label>
              <input value={bankForm.bank_name}
                onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))}
                placeholder="e.g. Guaranty Trust Bank"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account name</label>
              <input value={bankForm.account_name}
                onChange={e => setBankForm(f => ({ ...f, account_name: e.target.value }))}
                placeholder="Full account name"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account number</label>
              <input value={bankForm.account_number}
                onChange={e => setBankForm(f => ({ ...f, account_number: e.target.value }))}
                placeholder="0123456789"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>

        {/* Tax preview */}
        {gross > 0 && (
          <div className="bg-brand-50 rounded-xl border border-brand-100 p-5">
            <h3 className="text-sm font-semibold text-brand-800 mb-4">Monthly tax computation preview (PAYE)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Gross income',     value: fmt(gross),      color: 'text-gray-900' },
                { label: 'Pension (EE 8%)',  value: fmt(pensionEE),  color: 'text-red-600'  },
                { label: 'PAYE tax',         value: fmt(paye),       color: 'text-red-600'  },
                { label: 'Net pay',          value: fmt(netPay),     color: 'text-green-700'},
              ].map(m => (
                <div key={m.label} className="bg-white/60 rounded-xl p-3">
                  <p className="text-xs text-brand-600 mb-1">{m.label}</p>
                  <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-brand-100 grid grid-cols-3 gap-4 text-xs text-brand-700">
              <div><span className="opacity-70">Pensionable:</span> {fmt(pensionable)}</div>
              <div><span className="opacity-70">CRA:</span> {fmt(cra)}</div>
              <div><span className="opacity-70">Taxable income:</span> {fmt(taxable)}</div>
            </div>
            <div className="mt-2 text-xs text-brand-600">
              Employer pension contribution (10%): {fmt(pensionER)} / month
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()}
            className="px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : saved ? <><Save size={14} /> Saved!</>
              : <><Save size={14} /> Save configuration</>}
          </button>
        </div>
      </form>
    </div>
  )
}
