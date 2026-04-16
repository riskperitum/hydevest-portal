'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AccountTable from '@/components/ui/AccountTable'
import Modal from '@/components/ui/Modal'
import { Loader2, ShieldCheck } from 'lucide-react'

interface Employee {
  id: string
  user_id: string | null
  full_name: string | null
  email: string
  phone: string | null
  is_active: boolean
  blocked: boolean
  created_at: string
  roles: string
}

const blank = { full_name: '', email: '', password: '', phone: '', blocked: false }

export default function EmployeesTab() {
  const router = useRouter()
  const [data, setData] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<Employee | null>(null)
  const [form, setForm] = useState(blank)

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
      const r = ur.role as { name: string } | { name: string }[] | null | undefined
      if (!r) continue
      const names = Array.isArray(r) ? r.map(x => x.name) : [r.name]
      if (!roleMap[ur.user_id]) roleMap[ur.user_id] = []
      roleMap[ur.user_id].push(...names)
    }

    setData((profiles ?? []).map(p => ({
      ...p,
      user_id: p.id,
      roles: (roleMap[p.id] ?? []).join(', ') || 'No role',
    })))
    setLoading(false)
  }

  useEffect(() => {
    const t = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(t)
  }, [])

  function openAdd() {
    setEditRow(null)
    setForm(blank)
    setError(null)
    setOpen(true)
  }

  function openEdit(row: Employee) {
    setEditRow(row)
    setForm({
      full_name: row.full_name ?? '',
      email: row.email,
      password: '',
      phone: row.phone ?? '',
      blocked: !row.is_active,
    })
    setOpen(true)
    setError(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (!editRow) {
      const res = await fetch('/api/employees/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          phone: form.phone,
        }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error)
        setSaving(false)
        return
      }
    } else {
      const supabase = createClient()
      await supabase.from('profiles').update({
        full_name: form.full_name,
        phone: form.phone || null,
        is_active: !form.blocked,
        updated_at: new Date().toISOString(),
      }).eq('id', editRow.id)
    }

    setOpen(false)
    setForm(blank)
    setEditRow(null)
    load()
    setSaving(false)
  }

  const columns = [
    {
      key: 'name', label: 'Name',
      render: (r: Employee) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold shrink-0">
            {(r.full_name ?? r.email ?? 'U')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900">{r.full_name ?? <span className="text-gray-400 italic">No name set</span>}</p>
            <p className="text-xs text-gray-400">{r.email}</p>
          </div>
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
          {r.is_active ? 'Active' : 'Blocked'}
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
        onAdd={openAdd} addLabel="Add employee"
        searchPlaceholder="Search employees..."
        emptyMessage="No employees yet. Add your first team member."
        rowActions={row => [
          { label: 'Edit', onClick: () => openEdit(row) },
          {
            label: 'Manage roles & permissions',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            ),
            onClick: () => {
              if (row.user_id) {
                router.push(`/portal/admin/users/${row.user_id}`)
              } else {
                alert('This employee does not have a login account yet.')
              }
            },
          },
          { label: 'Deactivate', onClick: () => {}, danger: true },
        ]}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editRow ? 'Edit employee' : 'Add employee'}
        description={editRow ? 'Update profile details' : 'Creates a new portal login account'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name <span className="text-red-400">*</span></label>
              <input
                required
                value={form.full_name.split(' ')[0] ?? ''}
                onChange={e => {
                  const last = form.full_name.split(' ').slice(1).join(' ')
                  setForm(f => ({ ...f, full_name: `${e.target.value}${last ? ' ' + last : ''}` }))
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                value={form.full_name.split(' ').slice(1).join(' ') ?? ''}
                onChange={e => {
                  const first = form.full_name.split(' ')[0] ?? ''
                  setForm(f => ({ ...f, full_name: `${first}${e.target.value ? ' ' + e.target.value : ''}` }))
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Last name"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="+234 800 000 0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              readOnly={!!editRow}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 read-only:bg-gray-50 read-only:text-gray-600"
              placeholder="john@hydevest.com"
            />
          </div>
          {!editRow && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          )}

          {editRow && (
            <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
              <div className="flex items-center h-5 mt-0.5">
                <input
                  id="blocked"
                  type="checkbox"
                  checked={form.blocked}
                  onChange={e => setForm(f => ({ ...f, blocked: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                />
              </div>
              <div>
                <label htmlFor="blocked" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Block system access
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  When checked, this user will not be able to log in to the portal.
                </p>
                {form.blocked && (
                  <p className="text-xs text-red-500 font-medium mt-1">
                    ⚠ This user will be locked out immediately after saving.
                  </p>
                )}
              </div>
            </div>
          )}
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
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editRow ? 'Save changes' : 'Add employee'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}