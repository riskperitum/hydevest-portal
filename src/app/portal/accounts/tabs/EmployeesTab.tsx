'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import AccountTable from '@/components/ui/AccountTable'
import Modal from '@/components/ui/Modal'
import { Loader2, ShieldCheck } from 'lucide-react'

interface Employee {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
  roles: string
}

export default function EmployeesTab() {
  const [data, setData] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '' })

  async function load() {
    const supabase = createClient()
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, is_active, created_at')
      .order('created_at', { ascending: false })

    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('user_id, role:roles(name)')

    const roleMap: Record<string, string[]> = {}
    for (const ur of userRoles ?? []) {
      const role = ur.role as { name: string } | null
      if (!role) continue
      if (!roleMap[ur.user_id]) roleMap[ur.user_id] = []
      roleMap[ur.user_id].push(role.name)
    }

    setData((profiles ?? []).map(p => ({
      ...p,
      roles: (roleMap[p.id] ?? []).join(', ') || 'No role',
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: authData, error: signUpError } = await supabase.auth.admin.createUser({
      email: form.email,
      password: form.password,
      user_metadata: { full_name: form.full_name },
      email_confirm: true,
    })

    if (signUpError) {
      setError(signUpError.message)
      setSaving(false)
      return
    }

    if (authData.user && form.phone) {
      await supabase.from('profiles').update({ phone: form.phone, full_name: form.full_name }).eq('id', authData.user.id)
    }

    setOpen(false)
    setForm({ full_name: '', email: '', password: '', phone: '' })
    load()
    setSaving(false)
  }

  const columns = [
    {
      key: 'full_name', label: 'Name', render: (r: Employee) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold shrink-0">
            {(r.full_name ?? r.email)[0].toUpperCase()}
          </div>
          <span className="font-medium text-gray-900">{r.full_name ?? '—'}</span>
        </div>
      )
    },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone', render: (r: Employee) => r.phone ?? '—' },
    {
      key: 'roles', label: 'Role', render: (r: Employee) => (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
          <ShieldCheck size={11} /> {r.roles}
        </span>
      )
    },
    {
      key: 'is_active', label: 'Status', render: (r: Employee) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      )
    },
    { key: 'created_at', label: 'Joined', render: (r: Employee) => new Date(r.created_at).toLocaleDateString() },
  ]

  return (
    <>
      <AccountTable
        title="Employees" description="Portal user accounts"
        columns={columns} data={data} loading={loading}
        onAdd={() => setOpen(true)} addLabel="Add employee"
        searchPlaceholder="Search employees..."
        emptyMessage="No employees yet. Add your first team member."
        rowActions={() => [
          { label: 'Edit', onClick: () => {} },
          { label: 'Manage roles', onClick: () => {} },
          { label: 'Deactivate', onClick: () => {}, danger: true },
        ]}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="Add employee" description="Creates a new portal login account">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="+234 800 000 0000" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="john@hydevest.com" />
          </div>
          <div>
            <label className="block