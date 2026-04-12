'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import AccountTable from '@/components/ui/AccountTable'
import Modal from '@/components/ui/Modal'
import { Loader2 } from 'lucide-react'

interface ClearingAgent {
  id: string
  agent_id: string
  name: string
  phone: string | null
  company_name: string | null
  email: string | null
  country: string | null
  location: string | null
  is_active: boolean
  created_at: string
}

const blank = { name: '', phone: '', company_name: '', email: '', country: '', location: '' }

export default function ClearingAgentsTab() {
  const [data, setData] = useState<ClearingAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank)
  const [editRow, setEditRow] = useState<ClearingAgent | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: rows } = await supabase
      .from('clearing_agents')
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

  function openEdit(row: ClearingAgent) {
    setEditRow(row)
    setForm({
      name: row.name,
      phone: row.phone ?? '',
      company_name: row.company_name ?? '',
      email: row.email ?? '',
      country: row.country ?? '',
      location: row.location ?? '',
    })
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    if (editRow) {
      await supabase
        .from('clearing_agents')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editRow.id)
    } else {
      await supabase.from('clearing_agents').insert({ ...form })
    }
    setOpen(false)
    setSaving(false)
    load()
  }

  async function handleDelete(row: ClearingAgent) {
    if (!confirm(`Delete clearing agent ${row.name}? This cannot be undone.`)) return
    const supabase = createClient()
    await supabase.from('clearing_agents').delete().eq('id', row.id)
    load()
  }

  const columns = [
    {
      key: 'agent_id', label: 'ID',
      render: (r: ClearingAgent) => (
        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{r.agent_id}</span>
      )
    },
    {
      key: 'name', label: 'Name',
      render: (r: ClearingAgent) => <span className="font-medium text-gray-900">{r.name}</span>
    },
    { key: 'company_name', label: 'Company', render: (r: ClearingAgent) => r.company_name ?? '—' },
    { key: 'phone', label: 'Phone', render: (r: ClearingAgent) => r.phone ?? '—' },
    { key: 'email', label: 'Email', render: (r: ClearingAgent) => r.email ?? '—' },
    { key: 'country', label: 'Country', render: (r: ClearingAgent) => r.country ?? '—' },
    {
      key: 'location', label: 'Location',
      render: (r: ClearingAgent) => (
        <span className="text-gray-500 truncate block max-w-xs">{r.location ?? '—'}</spa