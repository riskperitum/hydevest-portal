'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Users, DollarSign, Play, CheckCircle2,
  AlertCircle, RefreshCw, Plus, Settings,
  TrendingUp, Wallet, FileText,
} from 'lucide-react'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'

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
  created_at: string
}

interface PayrollSummary {
  total_employees: number
  salary_earning: number
  total_advances_pending: number
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600'   },
  confirmed: { label: 'Confirmed', color: 'bg-blue-50 text-blue-700'    },
  paid:      { label: 'Paid',      color: 'bg-green-50 text-green-700'  },
}

export default function PayrollPage() {
  const router  = useRouter()
  const [runs, setRuns]       = useState<PayrollRun[]>([])
  const [summary, setSummary] = useState<PayrollSummary>({ total_employees: 0, salary_earning: 0, total_advances_pending: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'runs' | 'employees' | 'advances' | 'settings'>('runs')

  const { permissions, isSuperAdmin } = usePermissions()
  const canRunPayroll       = isSuperAdmin || can(permissions, isSuperAdmin, 'payroll.run')
  const canManageEmployees  = isSuperAdmin || can(permissions, isSuperAdmin, 'payroll.manage_employees')
  const canManageAdvances   = isSuperAdmin || can(permissions, isSuperAdmin, 'payroll.manage_advances')
  const canApprovePayroll   = isSuperAdmin || can(permissions, isSuperAdmin, 'payroll.approve')

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: runsData }, { data: empData }, { data: advData }] = await Promise.all([
      supabase.from('payroll_runs').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false }),
      supabase.from('payroll_employees').select('id, is_salary_earning, is_active').eq('is_active', true),
      supabase.from('payroll_advances').select('id, amount, status').eq('status', 'approved'),
    ])

    setRuns((runsData ?? []).map(r => ({
      ...r,
      total_gross:            Number(r.total_gross),
      total_net:              Number(r.total_net),
      total_paye:             Number(r.total_paye),
      total_pension_employee: Number(r.total_pension_employee),
      total_pension_employer: Number(r.total_pension_employer),
    })))

    setSummary({
      total_employees:        (empData ?? []).length,
      salary_earning:         (empData ?? []).filter(e => e.is_salary_earning).length,
      total_advances_pending: (advData ?? []).reduce((s, a) => s + Number(a.amount), 0),
    })

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const tabs = [
    { key: 'runs',      label: 'Payroll runs',  icon: Play      },
    { key: 'employees', label: 'Employees',      icon: Users     },
    { key: 'advances',  label: 'Advances',       icon: Wallet    },
    { key: 'settings',  label: 'Settings',       icon: Settings  },
  ]

  return (
    <PermissionGate permKey="payroll.view">
    <div className="space-y-5 max-w-7xl">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-400 mt-0.5">Nigerian PAYE payroll management</p>
        </div>
        <div className="flex items-center gap-2">
          {canRunPayroll && (
            <button type="button" onClick={() => router.push('/portal/payroll/run/new')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700">
              <Play size={14} /> Run payroll
            </button>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Salary employees',    value: summary.salary_earning.toString(),     color: 'text-blue-700',   bg: 'bg-blue-50',   icon: <Users size={15} className="text-blue-600" /> },
          { label: 'Total employees',     value: summary.total_employees.toString(),    color: 'text-gray-700',   bg: 'bg-gray-50',   icon: <Users size={15} className="text-gray-500" /> },
          { label: 'Pending advances',    value: fmt(summary.total_advances_pending),   color: 'text-amber-700',  bg: 'bg-amber-50',  icon: <Wallet size={15} className="text-amber-600" /> },
          { label: 'Payroll runs',        value: runs.length.toString(),               color: 'text-brand-700',  bg: 'bg-brand-50',  icon: <Play size={15} className="text-brand-600" /> },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">{m.icon}<p className="text-xs text-gray-500">{m.label}</p></div>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap
                  ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={14} /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* PAYROLL RUNS TAB */}
        {activeTab === 'runs' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Payroll run history</h3>
              {canRunPayroll && (
                <button type="button" onClick={() => router.push('/portal/payroll/run/new')}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                  <Plus size={12} /> New run
                </button>
              )}
            </div>

            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Play size={24} className="text-gray-200" />
                <p className="text-sm text-gray-400">No payroll runs yet</p>
                {canRunPayroll && (
                  <button type="button" onClick={() => router.push('/portal/payroll/run/new')}
                    className="text-xs font-medium text-brand-600 hover:underline">
                    Run first payroll
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Run ID','Period','Employees','Gross','PAYE','Pension (EE)','Net pay','Status',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {runs.map(run => {
                      const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.draft
                      return (
                        <tr key={run.id}
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => router.push(`/portal/payroll/run/${run.id}`)}>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{run.run_id}</span>
                          </td>
                          <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{run.period_label}</td>
                          <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">—</td>
                          <td className="px-3 py-3 font-medium text-gray-800 whitespace-nowrap">{fmt(run.total_gross)}</td>
                          <td className="px-3 py-3 text-xs text-red-600 font-medium whitespace-nowrap">{fmt(run.total_paye)}</td>
                          <td className="px-3 py-3 text-xs text-blue-600 font-medium whitespace-nowrap">{fmt(run.total_pension_employee)}</td>
                          <td className="px-3 py-3 font-bold text-green-700 whitespace-nowrap">{fmt(run.total_net)}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                          </td>
                          <td className="px-3 py-3">
                            <FileText size={14} className="text-gray-300 hover:text-brand-600" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Other tabs — built as separate components */}
        {activeTab === 'employees' && (
          <PayrollEmployeesTab onRefresh={load} canManageEmployees={canManageEmployees} />
        )}
        {activeTab === 'advances' && (
          <PayrollAdvancesTab
            onRefresh={load}
            canManageAdvances={canManageAdvances}
            canApprovePayroll={canApprovePayroll}
          />
        )}
        {activeTab === 'settings' && (
          <div className="p-5 text-sm text-gray-400">Payroll settings coming soon.</div>
        )}
      </div>
    </div>
    </PermissionGate>
  )
}

// ── EMPLOYEES TAB ─────────────────────────────────────────────────────────────
function PayrollEmployeesTab({ onRefresh, canManageEmployees }: { onRefresh: () => void; canManageEmployees: boolean }) {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // Load all profiles that are not partners
    supabase.from('profiles')
      .select(`
        id, full_name, email, is_active,
        user_roles(roles(name))
      `)
      .eq('is_active', true)
      .then(async ({ data: profiles }) => {
        // Filter out partners
        const nonPartners = (profiles ?? []).filter(p => {
          const roles = (p.user_roles ?? []).map((ur: any) => ur.roles?.name)
          return !roles.includes('partner')
        })

        // Load payroll employee records
        const { data: payrollEmps } = await supabase
          .from('payroll_employees')
          .select(`
            id, employee_id, is_salary_earning, is_active, is_pension_enrolled,
            basic_salary, housing_allowance, transport_allowance,
            meal_allowance, other_allowances,
            bank:payroll_bank_accounts(bank_name, account_name, account_number)
          `)
          .eq('is_active', true)

        const payrollMap = Object.fromEntries((payrollEmps ?? []).map(e => [e.employee_id, e]))

        setEmployees(nonPartners.map(p => ({
          ...p,
          payroll: payrollMap[p.id] ?? null,
        })))
        setLoading(false)
      })
  }, [])

  async function toggleSalaryEarning(profileId: string, payrollId: string | null, current: boolean) {
    if (!canManageEmployees) return
    setSaving(profileId)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (payrollId) {
      await supabase.from('payroll_employees').update({ is_salary_earning: !current }).eq('id', payrollId)
    } else {
      await supabase.from('payroll_employees').insert({
        employee_id: profileId,
        is_salary_earning: true,
        created_by: user?.id,
      })
    }
    setSaving(null)
    onRefresh()
    // Reload
    const { data: payrollEmps } = await supabase.from('payroll_employees').select('*').eq('employee_id', profileId).single()
    setEmployees(prev => prev.map(e => e.id === profileId ? { ...e, payroll: payrollEmps } : e))
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Payroll employees</h3>
          <p className="text-xs text-gray-400 mt-0.5">Tick employees to include in payroll runs</p>
        </div>
      </div>

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Salary earning','Pension','Employee','Basic salary','Housing','Transport','Meal','Total CTC','Bank','Action'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {employees.map(emp => {
                const pe = emp.payroll
                const totalCTC = pe
                  ? Number(pe.basic_salary) + Number(pe.housing_allowance) + Number(pe.transport_allowance) + Number(pe.meal_allowance) + Number(pe.other_allowances)
                  : 0
                const bank = pe?.bank?.[0] ?? null
                return (
                  <tr key={emp.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-3">
                      {canManageEmployees ? (
                        <button type="button"
                          onClick={() => toggleSalaryEarning(emp.id, pe?.id ?? null, pe?.is_salary_earning ?? false)}
                          disabled={saving === emp.id}
                          className={`w-9 h-5 rounded-full transition-colors relative ${pe?.is_salary_earning ? 'bg-brand-600' : 'bg-gray-200'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${pe?.is_salary_earning ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      ) : (
                        <div className={`w-9 h-5 rounded-full relative pointer-events-none ${pe?.is_salary_earning ? 'bg-brand-600' : 'bg-gray-200'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow ${pe?.is_salary_earning ? 'left-4' : 'left-0.5'}`} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {pe?.is_pension_enrolled ? (
                        <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Enrolled</span>
                      ) : (
                        <span className="text-xs font-medium bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Not enrolled</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm font-medium text-gray-900">{emp.full_name ?? emp.email}</p>
                      <p className="text-xs text-gray-400">{emp.email}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-700">{pe ? fmt(pe.basic_salary) : '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-700">{pe ? fmt(pe.housing_allowance) : '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-700">{pe ? fmt(pe.transport_allowance) : '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-700">{pe ? fmt(pe.meal_allowance) : '—'}</td>
                    <td className="px-3 py-3 text-xs font-semibold text-brand-700">{pe ? fmt(totalCTC) : '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">
                      {bank ? (
                        <div>
                          <p className="font-medium text-gray-700">{bank.bank_name}</p>
                          <p className="font-mono text-gray-400">{bank.account_number}</p>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {canManageEmployees ? (
                        <button type="button" onClick={() => router.push(`/portal/payroll/employee/${emp.id}`)}
                          className="text-xs font-medium text-brand-600 hover:underline whitespace-nowrap">
                          Edit salary →
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── ADVANCES TAB ─────────────────────────────────────────────────────────────
function PayrollAdvancesTab({
  onRefresh,
  canManageAdvances,
  canApprovePayroll,
}: {
  onRefresh: () => void
  canManageAdvances: boolean
  canApprovePayroll: boolean
}) {
  const [advances, setAdvances]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [addOpen, setAddOpen]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; isSuperAdmin: boolean } | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm]           = useState({ employee_id: '', amount: '', reason: '' })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser({ id: user.id, isSuperAdmin: false })
    })
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const [{ data: advData }, { data: empData }] = await Promise.all([
      supabase.from('payroll_advances').select(`
        id, advance_id, amount, reason, status, created_at,
        employee:payroll_employees!payroll_advances_employee_id_fkey(
          employee_id,
          profile:profiles!payroll_employees_employee_id_fkey(full_name, email)
        ),
        approver:profiles!payroll_advances_approved_by_fkey(full_name)
      `).order('created_at', { ascending: false }),
      supabase.from('payroll_employees').select(`
        id, employee_id,
        profile:profiles!payroll_employees_employee_id_fkey(full_name, email)
      `).eq('is_active', true),
    ])
    setAdvances(advData ?? [])
    setEmployees(empData ?? [])
    setLoading(false)
  }

  async function submitAdvance(e: React.FormEvent) {
    e.preventDefault()
    if (!canManageAdvances || !form.employee_id || !form.amount) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const seq = Date.now().toString().slice(-5)

    const status = canApprovePayroll ? 'approved' : 'pending'

    await supabase.from('payroll_advances').insert({
      advance_id:   `ADV-${seq}`,
      employee_id:  form.employee_id,
      amount:       parseFloat(form.amount),
      reason:       form.reason || null,
      status,
      requested_by: user?.id,
      approved_by:  canApprovePayroll ? user?.id : null,
      approved_at:  canApprovePayroll ? new Date().toISOString() : null,
    })

    if (!canApprovePayroll) {
      // Create approval task
      await supabase.from('tasks').insert({
        task_id:      `TASK-${seq}`,
        title:        `Salary advance request — ${form.amount}`,
        module:       'payroll',
        status:       'pending',
        priority:     'normal',
        requested_by: user?.id,
        type:         'approval_request',
      })
    }

    setSaving(false)
    setAddOpen(false)
    setForm({ employee_id: '', amount: '', reason: '' })
    loadData()
    onRefresh()
  }

  async function approveAdvance(id: string) {
    if (!canApprovePayroll) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('payroll_advances').update({
      status:      'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    loadData()
    onRefresh()
  }

  async function rejectAdvance(id: string) {
    if (!canApprovePayroll) return
    const supabase = createClient()
    await supabase.from('payroll_advances').update({ status: 'rejected' }).eq('id', id)
    loadData()
    onRefresh()
  }

  const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const STATUS_CFG: Record<string, string> = {
    pending:  'bg-amber-50 text-amber-700',
    approved: 'bg-green-50 text-green-700',
    rejected: 'bg-red-50 text-red-600',
    deducted: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Salary advances</h3>
        {canManageAdvances && (
          <button type="button" onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
            <Plus size={12} /> Record advance
          </button>
        )}
      </div>

      {canManageAdvances && addOpen && (
        <form onSubmit={submitAdvance} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Employee</label>
              <select required value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Select employee...</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>
                    {(e.profile as any)?.full_name ?? (e.profile as any)?.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount (NGN)</label>
              <input type="number" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reason</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAddOpen(false)}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Saving…' : canApprovePayroll ? 'Record & approve' : 'Submit for approval'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
        ))
      ) : advances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Wallet size={24} className="text-gray-200" />
          <p className="text-sm text-gray-400">No salary advances recorded</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Ref','Employee','Amount','Reason','Status','Approved by','Date',''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {advances.map(adv => (
              <tr key={adv.id} className="hover:bg-gray-50/50">
                <td className="px-3 py-3">
                  <span className="font-mono text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">{adv.advance_id}</span>
                </td>
                <td className="px-3 py-3 text-xs font-medium text-gray-800">
                  {(adv.employee as any)?.profile?.full_name ?? (adv.employee as any)?.profile?.email ?? '—'}
                </td>
                <td className="px-3 py-3 text-sm font-bold text-amber-700">{fmt(Number(adv.amount))}</td>
                <td className="px-3 py-3 text-xs text-gray-500 max-w-[150px] truncate">{adv.reason ?? '—'}</td>
                <td className="px-3 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CFG[adv.status] ?? ''}`}>
                    {adv.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-gray-500">
                  {(adv.approver as any)?.full_name ?? '—'}
                </td>
                <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {new Date(adv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {adv.status === 'pending' && canApprovePayroll && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => approveAdvance(adv.id)}
                        className="text-xs font-medium text-green-600 hover:underline">Approve</button>
                      <span className="text-gray-300">·</span>
                      <button type="button" onClick={() => rejectAdvance(adv.id)}
                        className="text-xs font-medium text-red-500 hover:underline">Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
