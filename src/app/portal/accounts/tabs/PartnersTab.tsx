'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import AccountTable from '@/components/ui/AccountTable'
import Modal from '@/components/ui/Modal'
import { Loader2, Wallet } from 'lucide-react'

interface Partner {
  id: string
  partner_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  wallet_balance: number
  total_invested: number
  total_profit: number
  total_withdrawn: number
  is_active: boolean
  created_at: string
}

const blank = { name: '', phone: '', email: '', address: '' }
const fmt = (n: number) => `₦${Number(n).toLocaleString()}`

export default function PartnersTab() {
  const [data, setData] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank)
  const [editRow, setEditRow] = useState<Partner | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: rows } = await supabase
      .from('partners')
      .select('*')
      .order('created_at', { ascending: false })
    setData(rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditRow(null)
    setForm(blank)
    setOpen(true)
  }

  function openEdit(row: Partner) {
    setEditRow(row)
    setForm({
      name: row.name,
      phone: row.phone ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
    })
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    if (editRow) {
      await supabase
        .from('partners')
        .update({ name: form.name, phone: form.phone, email: form.email, address: form.address })
        .eq('id', editRow.id)
    } else {
      await supabase.from('partners').insert({
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
      })
    }
    setOpen(false)
    setSaving(false)
    load()
  }

  async function handleDelete(row: Partner) {
    if (!confirm(`Delete partner ${row.name}? This cannot be undone.`)) return
    const supabase = createClient()
    await supabase.from('partners').delete().eq('id', row.id)
    load()
  }

  const columns = [
    {
      key: 'partner_id', label: 'ID',
      render: (r: Partner) => (
        <span className="font-mono text-xs bg-brand-50 px-2 py-0.5 rounded text-brand-700">{r.partner_id}</span>
      )
    },
    {
      key: 'name', label: 'Name',
      render: (r: Partner) => <span className="font-medium text-gray-900">{r.name}</span>
    },
    { key: 'phone', label: 'Phone', render: (r: Partner) => r.phone ?? '—' },
    { key: 'email', label: 'Email', render: (r: Partner) => r.email ?? '—' },
    {
      key: 'wallet_balance', label: 'Wallet',
      render: (r: Partner) => (
        <span className="inline-flex items-center gap-1 font-medium text-green-700">
          <Wallet size={13} /> {fmt(r.wallet_balance)}
        </span>
      )
    },
    {
      key: 'total_invested', label: 'Invested',
      render: (r: Partner) => <span className="text-gray-600">{fmt(r.total_invested)}</span>
    },
    {
      key: 'total_profit', label: 'Profit',
      render: (r: Partner) => <span className="text-green-600">{fmt(r.total_profit)}</span>
    },
    {
      key: 'is_active', label: 'Status',
      render: (r: Partner) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      )
    },
  ]

  return (
    <>
      <AccountTable
        title="Partners" description="Investment partners with wallet access"
        columns={columns} data={data} loading={loading}
        onAdd={openAdd} addLabel="Add partner"
        searchPlaceholder="Search partners..."
        emptyMessage="No partners yet. Add your first partner."
        rowActions={row => [
          { label: 'Edit', onClick: () => openEdit(row) },
          { label: 'View wallet', onClick: () => {} },
          { label: 'Record transaction', onClick: () => {} },
          { label: 'Delete', onClick: () => handleDelete(row), danger: true },
        ]}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editRow ? 'Edit partner' : 'Add partner'}
        description="Partner ID is auto-generated. Link a login account after creating."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full name <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Partner name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="+234 800 000 0000"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="partner@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              rows={2}
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Partner address"
            />
          </div>
          <div className="p-3 rounded-lg bg-brand-50 text-brand-700 text-xs">
            After creating the partner profile, go to the Employees tab to create their login account, then assign them the partner role.
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editRow ? 'Save changes' : 'Add partner'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}