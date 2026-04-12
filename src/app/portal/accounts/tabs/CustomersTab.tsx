'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import AccountTable from '@/components/ui/AccountTable'
import Modal from '@/components/ui/Modal'
import { Loader2 } from 'lucide-react'

interface Customer {
  id: string
  customer_id: string
  name: string
  phone: string | null
  address: string | null
  is_active: boolean
  created_at: string
}

const blank = { name: '', phone: '', address: '' }

export default function CustomersTab() {
  const [data, setData] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank)
  const [editRow, setEditRow] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: rows } = await supabase
      .from('customers')
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

  function openEdit(row: Customer) {
    setEditRow(row)
    setForm({ name: row.name, phone: row.phone ?? '', address: row.address ?? '' })
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    if (editRow) {
      await supabase.from('customers').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editRow.id)
    } else {
      await supabase.from('customers').insert({ ...form })
    }
    setOpen(false)
    setSaving(false)
    load()
  }

  async function handleDelete(row: Customer) {
    if (!confirm(`Delete customer ${row.name}? This cannot be undone.`)) return
    const supabase = createClient()
    await supabase.from('customers').delete().eq('id', row.id)
    load()
  }

  const columns = [
    {
      key: 'customer_id', label: 'ID',
      render: (r: Customer) => (
        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{r.customer_id}</span>
      )
    },
    {
      key: 'name', label: 'Name',
      render: (r: Customer) => <span className="font-medium text-gray-900">{r.name}</span>
    },
    { key: 'phone', label: 'Phone', render: (r: Customer) => r.phone ?? '—' },
    {
      key: 'address', label: 'Address',
      render: (r: Customer) => <span className="text-gray-500 truncate max-w-xs block">{r.address ?? '—'}</span>
    },
    {
      key: 'is_active', label: 'Status',
      render: (r: Customer) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      key: 'created_at', label: 'Added',
      render: (r: Customer) => new Date(r.created_at).toLocaleDateString()
    },
  ]

  return (
    <>
      <AccountTable
        title="Customers" description="Buyer accounts referenced in sales"
        columns={columns} data={data} loading={loading}
        onAdd={openAdd} addLabel="Add customer"
        searchPlaceholder="Search cus