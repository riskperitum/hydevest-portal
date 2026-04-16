'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Loader2, Scale, Pencil, Check, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'

interface Account {
  id: string
  code: string
  name: string
  type: string
  subtype: string | null
  is_bank: boolean
  bank_name: string | null
  bank_account_number: string | null
  is_system: boolean
  is_active: boolean
  description: string | null
  balance: number
}

const TYPE_COLOR: Record<string, string> = {
  asset:     'bg-blue-50 text-blue-700',
  liability: 'bg-red-50 text-red-600',
  equity:    'bg-purple-50 text-purple-700',
  revenue:   'bg-green-50 text-green-700',
  expense:   'bg-amber-50 text-amber-700',
  tax:       'bg-gray-100 text-gray-600',
}

const TYPES = ['asset','liability','equity','revenue','expense','tax']
const SUBTYPES: Record<string, string[]> = {
  asset:     ['current_asset','non_current_asset','header'],
  liability: ['current_liability','non_current_liability','header'],
  equity:    ['equity','header'],
  revenue:   ['revenue','header'],
  expense:   ['cost_of_sales','opex','header'],
  tax:       ['tax_expense','header'],
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function AccountsTab() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editRow, setEditRow] = useState<Account | null>(null)
  const [form, setForm] = useState({
    code: '', name: '', type: 'asset', subtype: 'current_asset',
    is_bank: false, bank_name: '', bank_account_number: '',
    description: '',
  })

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: accountData } = await supabase
      .from('finance_accounts')
      .select('*')
      .order('code')

    // Calculate balance for each account from journal lines
    const { data: lineData } = await supabase
      .from('finance_journal_lines')
      .select(`
        account_id, debit_ngn, credit_ngn,
        journal:finance_journals!finance_journal_lines_journal_id_fkey(status)
      `)

    const balanceMap: Record<string, number> = {}
    for (const line of (lineData ?? [])) {
      const j = line.journal as any
      if (j?.status !== 'posted') continue
      if (!balanceMap[line.account_id]) balanceMap[line.account_id] = 0
      // Assets and expenses: DR increases balance
      // Liabilities, equity, revenue: CR increases balance
      balanceMap[line.account_id] += Number(line.debit_ngn) - Number(line.credit_ngn)
    }

    setAccounts((accountData ?? []).map(a => ({
      ...a,
      balance: balanceMap[a.id] ?? 0,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRow(null)
    setForm({ code: '', name: '', type: 'asset', subtype: 'current_asset', is_bank: false, bank_name: '', bank_account_number: '', description: '' })
    setOpen(true)
  }

  function openEdit(row: Account) {
    setEditRow(row)
    setForm({
      code: row.code, name: row.name, type: row.type,
      subtype: row.subtype ?? 'current_asset',
      is_bank: row.is_bank, bank_name: row.bank_name ?? '',
      bank_account_number: row.bank_account_number ?? '',
      description: row.description ?? '',
    })
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const payload = {
      code: form.code, name: form.name, type: form.type,
      subtype: form.subtype, is_bank: form.is_bank,
      bank_name: form.is_bank ? form.bank_name : null,
      bank_account_number: form.is_bank ? form.bank_account_number : null,
      description: form.description || null,
    }
    if (editRow) {
      await supabase.from('finance_accounts').update(payload).eq('id', editRow.id)
    } else {
      await supabase.from('finance_accounts').insert({ ...payload, is_system: false })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  async function toggleActive(row: Account) {
    if (row.is_system) return
    const supabase = createClient()
    await supabase.from('finance_accounts').update({ is_active: !row.is_active }).eq('id', row.id)
    load()
  }

  const filtered = accounts.filter(a =>
    typeFilter === 'all' || a.type === typeFilter
  )

  // Group by type
  const grouped = TYPES.reduce((acc, type) => {
    const group = filtered.filter(a => a.type === type && a.subtype !== 'header')
    if (group.length > 0) acc[type] = group
    return acc
  }, {} as Record<string, Account[]>)

  const totalAssets = accounts.filter(a => a.type === 'asset').reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = accounts.filter(a => a.type === 'liability').reduce((s, a) => s + Math.abs(a.balance), 0)
  const totalEquity = accounts.filter(a => a.type === 'equity').reduce((s, a) => s + Math.abs(a.balance), 0)

  return (
    <div className="p-5 space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Chart of accounts</h2>
          <p className="text-xs text-gray-400 mt-0.5">{accounts.filter(a => a.is_active).length} active accounts</p>
        </div>
        <button onClick={openAdd}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
          <Plus size={14} /> Add account
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total assets',      value: fmt(totalAssets),      color: 'text-blue-700',   bg: 'bg-blue-50' },
          { label: 'Total liabilities', value: fmt(totalLiabilities), color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Total equity',      value: fmt(totalEquity),      color: 'text-green-700',  bg: 'bg-green-50' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-white`}>
            <p className="text-xs text-gray-500 mb-1">{m.label}</p>
            <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {['all', ...TYPES].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors capitalize
              ${typeFilter === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Accounts table grouped by type */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([type, accts]) => (
            <div key={type} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${TYPE_COLOR[type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {type}
                </span>
                <span className="text-xs text-gray-400">{accts.length} accounts</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 w-20">Code</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Name</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Subtype</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Description</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 w-40">Balance</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-400 w-20">Status</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {accts.map(a => (
                    <tr key={a.id} className={`hover:bg-gray-50/50 transition-colors ${!a.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-brand-700 font-medium">{a.code}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {a.name}
                        {a.is_bank && <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Bank</span>}
                        {a.is_system && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">System</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 capitalize">{a.subtype?.replace('_', ' ') ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[200px] truncate">{a.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-sm font-semibold ${a.balance === 0 ? 'text-gray-300' : a.balance > 0 ? 'text-gray-800' : 'text-red-600'}`}>
                          {a.balance === 0 ? '—' : fmt(Math.abs(a.balance))}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {!a.is_system && (
                            <button onClick={() => openEdit(a)}
                              className="p-1.5 rounded hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors">
                              <Pencil size={13} />
                            </button>
                          )}
                          {!a.is_system && (
                            <button onClick={() => toggleActive(a)}
                              className={`p-1.5 rounded transition-colors ${a.is_active ? 'hover:bg-red-50 text-gray-300 hover:text-red-500' : 'hover:bg-green-50 text-gray-300 hover:text-green-600'}`}>
                              {a.is_active ? <X size={13} /> : <Check size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Add/edit modal */}
      <Modal open={open} onClose={() => setOpen(false)}
        title={editRow ? 'Edit account' : 'Add account'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Account code <span className="text-red-400">*</span>
              </label>
              <input required value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="e.g. 1050"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Account name <span className="text-red-400">*</span>
              </label>
              <input required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Petty cash"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select value={form.type}
                onChange={e => {
                  const subs = SUBTYPES[e.target.value] ?? []
                  setForm(f => ({ ...f, type: e.target.value, subtype: subs[0] ?? '' }))
                }}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Subtype</label>
              <select value={form.subtype}
                onChange={e => setForm(f => ({ ...f, subtype: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {(SUBTYPES[form.type] ?? []).map(s => (
                  <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="is_bank" checked={form.is_bank}
              onChange={e => setForm(f => ({ ...f, is_bank: e.target.checked }))}
              className="w-4 h-4 text-brand-600 rounded" />
            <label htmlFor="is_bank" className="text-sm font-medium text-gray-700">This is a bank account</label>
          </div>
          {form.is_bank && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank name</label>
                <input value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  placeholder="e.g. Guaranty Trust Bank"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account number</label>
                <input value={form.bank_account_number}
                  onChange={e => setForm(f => ({ ...f, bank_account_number: e.target.value }))}
                  placeholder="0123456789"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <input value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this account"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editRow ? 'Save changes' : 'Add account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

