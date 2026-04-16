'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, Loader2, Search, Pencil, Check, X } from 'lucide-react'
import Link from 'next/link'
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
  balance_dr: number
  balance_cr: number
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

const fmt = (n: number) => `₦${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const blank = { code: '', name: '', type: 'asset', subtype: 'current_asset', is_bank: false, bank_name: '', bank_account_number: '', description: '' }

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editRow, setEditRow] = useState<Account | null>(null)
  const [form, setForm] = useState(blank)

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: accts }, { data: lines }] = await Promise.all([
      supabase.from('finance_accounts').select('*').order('code'),
      supabase.from('finance_journal_lines').select('account_id, debit_ngn, credit_ngn'),
    ])

    // Calculate balances
    const balMap: Record<string, { dr: number; cr: number }> = {}
    for (const line of lines ?? []) {
      if (!balMap[line.account_id]) balMap[line.account_id] = { dr: 0, cr: 0 }
      balMap[line.account_id].dr += Number(line.debit_ngn)
      balMap[line.account_id].cr += Number(line.credit_ngn)
    }

    setAccounts((accts ?? []).filter(a => a.subtype !== 'header').map(a => {
      const bal = balMap[a.id] ?? { dr: 0, cr: 0 }
      const balance = ['asset', 'expense', 'tax'].includes(a.type)
        ? bal.dr - bal.cr
        : bal.cr - bal.dr
      return {
        ...a,
        balance_dr: bal.dr,
        balance_cr: bal.cr,
        balance,
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    if (editRow) {
      await supabase.from('finance_accounts').update({
        name:                 form.name,
        description:          form.description || null,
        is_bank:              form.is_bank,
        bank_name:            form.bank_name || null,
        bank_account_number:  form.bank_account_number || null,
      }).eq('id', editRow.id)
    } else {
      await supabase.from('finance_accounts').insert({
        code:                 form.code,
        name:                 form.name,
        type:                 form.type,
        subtype:              form.subtype,
        is_bank:              form.is_bank,
        bank_name:            form.bank_name || null,
        bank_account_number:  form.bank_account_number || null,
        description:          form.description || null,
        is_system:            false,
      })
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

  const filtered = accounts.filter(a => {
    const matchSearch = search === '' ||
      a.code.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === '' || a.type === typeFilter
    return matchSearch && matchType
  })

  const subtypes = [
    { value: 'current_asset',       label: 'Current asset' },
    { value: 'non_current_asset',   label: 'Non-current asset' },
    { value: 'current_liability',   label: 'Current liability' },
    { value: 'non_current_liability', label: 'Non-current liability' },
    { value: 'equity',              label: 'Equity' },
    { value: 'revenue',             label: 'Revenue' },
    { value: 'cost_of_sales',       label: 'Cost of sales' },
    { value: 'opex',                label: 'Operating expense' },
    { value: 'tax_expense',         label: 'Tax expense' },
  ]

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/portal/finance" className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Chart of Accounts</h1>
          <p className="text-sm text-gray-400 mt-0.5">All accounts used in your double-entry bookkeeping system</p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by code or name..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All types</option>
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
          <option value="revenue">Revenue</option>
          <option value="expense">Expense</option>
          <option value="tax">Tax</option>
        </select>
        <button onClick={() => { setEditRow(null); setForm(blank); setOpen(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
          <Plus size={15} /> Add account
        </button>
      </div>

      {/* Accounts table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Code', 'Account name', 'Type', 'Subtype', 'Balance', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.map(acct => (
                <tr key={acct.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${!acct.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">{acct.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{acct.name}</p>
                    {acct.description && <p className="text-xs text-gray-400 mt-0.5">{acct.description}</p>}
                    {acct.is_bank && acct.bank_name && (
                      <p className="text-xs text-blue-600 mt-0.5 font-medium">{acct.bank_name} {acct.bank_account_number ? `— ${acct.bank_account_number}` : ''}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_COLOR[acct.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {acct.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap capitalize">
                    {(acct.subtype ?? '—').replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-sm font-semibold ${acct.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {acct.balance !== 0 ? fmt(acct.balance) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${acct.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {acct.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {acct.is_system && (
                      <span className="ml-1 text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditRow(acct); setForm({ code: acct.code, name: acct.name, type: acct.type, subtype: acct.subtype ?? 'current_asset', is_bank: acct.is_bank, bank_name: acct.bank_name ?? '', bank_account_number: acct.bank_account_number ?? '', description: acct.description ?? '' }); setOpen(true) }}
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                        <Pencil size={13} />
                      </button>
                      {!acct.is_system && (
                        <button onClick={() => toggleActive(acct)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title={acct.is_active ? 'Deactivate' : 'Activate'}>
                          {acct.is_active ? <X size={13} /> : <Check size={13} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/edit modal */}
      <Modal open={open} onClose={() => setOpen(false)}
        title={editRow ? 'Edit account' : 'Add account'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          {!editRow && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account code <span className="text-red-400">*</span></label>
                <input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. 1005"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Type <span className="text-red-400">*</span></label>
                <select required value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                  <option value="tax">Tax</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Account name <span className="text-red-400">*</span></label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Petty cash"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {!editRow && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Subtype</label>
              <select value={form.subtype} onChange={e => setForm(f => ({ ...f, subtype: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {subtypes.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="is_bank" checked={form.is_bank}
              onChange={e => setForm(f => ({ ...f, is_bank: e.target.checked }))}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            <label htmlFor="is_bank" className="text-sm font-medium text-gray-700">This is a bank account</label>
          </div>

          {form.is_bank && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank name</label>
                <input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  placeholder="e.g. GTBank"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Account number</label>
                <input value={form.bank_account_number} onChange={e => setForm(f => ({ ...f, bank_account_number: e.target.value }))}
                  placeholder="e.g. 0123456789"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editRow ? 'Save changes' : 'Add account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

