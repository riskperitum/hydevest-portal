'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import AccountTable from '@/components/ui/AccountTable'
import Modal from '@/components/ui/Modal'
import { Loader2 } from 'lucide-react'

interface Supplier {
  id: string
  supplier_id: string
  name: string
  phone: string | null
  address: string | null
  is_active: boolean
  created_at: string
}

const blank = { name: '', phone: '', address: '' }

export default function SuppliersTab() {
  const [data, setData] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank)
  const [editRow, setEditRow] = useState<Supplier | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: rows } = await supabase
      .from('suppliers')
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

  function openEdit(row: Supplier) {
    setEditRow(row)
    setForm({ name: row.name, phone: row.phone ?? '', address: row.address ?? '' })
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    if (editRow) {
      await supabase.from('suppliers').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editRow.id)
    } else {
      await supabase.from('suppliers').insert({ ...form })
    }
    setOpen(false)
    setSaving(false)
    load()
  }

  async function handleDelete(row: Supplier) {
    if (!confirm(`Delete supplier ${row.name}? This cannot be undone.`)) return
    const supabase = createClient()
    await supabase.from('suppliers').delete().eq('id', row.id)
    load()
  }

  const columns = [
    {
      key: 'supplier_id', label: 'ID',
      render: (r: Supplier) => (
        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{r.supplier_id}</span>
      )
    },
    {
      key: 'name', label: 'Name',
      render: (r: Supplier) => <span className="font-medium text-gray-900">{r.name}</span>
    },
    { key: 'phone', label: 'Phone', render: (r: Supplier) => r.phone ?? '—' },
    {
      key: 'address', label: 'Address',
      render: (r: Supplier) => <span className="text-gray-500 truncate max-w-xs block">{r.address ?? '—'}</span>
    },
    {
      key: 'is_active', label: 'Status',
      render: (r: Supplier) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      key: 'created_at', label: 'Added',
      render: (r: Supplier) => new Date(r.created_at).toLocaleDateString()
    },
  ]

  return (
    <>
      <AccountTable
        title="Suppliers" description="Referenced in purchase trips"
        columns={columns} data={data} loading={loading}
        onAdd={openAdd}