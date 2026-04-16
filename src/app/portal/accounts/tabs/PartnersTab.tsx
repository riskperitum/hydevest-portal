'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import AccountTable from '@/components/ui/AccountTable'
import Modal from '@/components/ui/Modal'
import { Loader2, UserPlus, CheckCircle2, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Partner {
  id: string
  partner_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  wallet_balance: number
  wallet_allocated: number
  total_invested: number
  total_profit: number
  total_withdrawn: number
  is_active: boolean
  user_id: string | null
  created_at: string
  linked_email: string | null
  linked_name: string | null
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function PartnersTab() {
  const router = useRouter()
  const [data, setData] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)

  // Add / edit partner modal
  const [partnerOpen, setPartnerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editRow, setEditRow] = useState<Partner | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' })

  // Create login modal
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginPartner, setLoginPartner] = useState<Partner | null>(null)
  const [loginForm, setLoginForm] = useState({ email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [savingLogin, setSavingLogin] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)
  const [loginError, setLoginError] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: rows } = await supabase
      .from('partners')
      .select(`
        *,
        profile:profiles!partners_user_id_fkey(email, full_name)
      `)
      .order('created_at', { ascending: false })

    setData((rows ?? []).map(r => ({
      ...r,
      wallet_balance:   Number(r.wallet_balance ?? 0),
      wallet_allocated: Number(r.wallet_allocated ?? 0),
      total_invested:   Number(r.total_invested ?? 0),
      total_profit:     Number(r.total_profit ?? 0),
      total_withdrawn:  Number(r.total_withdrawn ?? 0),
      linked_email:     (r.profile as { email?: string } | null)?.email ?? null,
      linked_name:      (r.profile as { full_name?: string } | null)?.full_name ?? null,
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  function openAdd() {
    setEditRow(null)
    setForm({ name: '', phone: '', email: '', address: '' })
    setPartnerOpen(true)
  }

  function openEdit(row: Partner) {
    setEditRow(row)
    setForm({
      name:    row.name,
      phone:   row.phone ?? '',
      email:   row.email ?? '',
      address: row.address ?? '',
    })
    setPartnerOpen(true)
  }

  function openCreateLogin(row: Partner) {
    setLoginPartner(row)
    setLoginForm({ email: row.email ?? '', password: '', confirmPassword: '' })
    setLoginSuccess(false)
    setLoginError('')
    setLoginOpen(true)
  }

  async function handleSavePartner(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()

    if (editRow) {
      await supabase.from('partners').update({
        name: form.name, phone: form.phone || null,
        email: form.email || null, address: form.address || null,
      }).eq('id', editRow.id)
    } else {
      await supabase.from('partners').insert({
        name: form.name, phone: form.phone || null,
        email: form.email || null, address: form.address || null,
      })
    }

    setSaving(false)
    setPartnerOpen(false)
    load()
  }

  async function handleCreateLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!loginPartner) return
    setLoginError('')

    if (loginForm.password !== loginForm.confirmPassword) {
      setLoginError('Passwords do not match.')
      return
    }
    if (loginForm.password.length < 8) {
      setLoginError('Password must be at least 8 characters.')
      return
    }
    if (!loginForm.email) {
      setLoginError('Email is required.')
      return
    }

    setSavingLogin(true)

    try {
      const res = await fetch('/api/partners/create-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:      loginForm.email,
          password:   loginForm.password,
          full_name:  loginPartner.name,
          partner_id: loginPartner.id,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setLoginError(result.error ?? 'Failed to create login account.')
        setSavingLogin(false)
        return
      }

      setSavingLogin(false)
      setLoginSuccess(true)
      load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.'
      setLoginError(message)
      setSavingLogin(false)
    }
  }

  async function handleDelete(row: Partner) {
    if (!confirm(`Delete partner ${row.name}? This cannot be undone.`)) return
    const supabase = createClient()
    await supabase.from('partners').delete().eq('id', row.id)
    load()
  }

  async function toggleActive(row: Partner) {
    const supabase = createClient()
    await supabase.from('partners').update({ is_active: !row.is_active }).eq('id', row.id)
    // Also block/unblock linked user if exists
    if (row.user_id) {
      await supabase.from('profiles').update({ is_active: !row.is_active }).eq('id', row.user_id)
    }
    load()
  }

  const columns = [
    {
      key: 'partner_id', label: 'ID',
      render: (r: Partner) => (
        <span className="font-mono text-xs bg-brand-50 px-2 py-0.5 rounded text-brand-700">{r.partner_id}</span>
      ),
    },
    {
      key: 'name', label: 'Name',
      render: (r: Partner) => (
        <div>
          <p className="font-medium text-gray-900">{r.name}</p>
          {r.phone && <p className="text-xs text-gray-400">{r.phone}</p>}
        </div>
      ),
    },
    {
      key: 'email', label: 'Email',
      render: (r: Partner) => (
        <span className="text-sm text-gray-600">{r.email ?? '—'}</span>
      ),
    },
    {
      key: 'login', label: 'Portal login',
      render: (r: Partner) => r.user_id ? (
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-xs text-green-700 font-medium">Active</span>
          <span className="text-xs text-gray-400 truncate max-w-[120px]">{r.linked_email}</span>
        </div>
      ) : (
        <span className="text-xs text-gray-400 italic">No login yet</span>
      ),
    },
    {
      key: 'wallet_balance', label: 'Wallet',
      render: (r: Partner) => (
        <div>
          <p className="text-sm font-semibold text-brand-700">{fmt(r.wallet_balance)}</p>
          {r.wallet_allocated > 0 && (
            <p className="text-xs text-blue-600">+{fmt(r.wallet_allocated)} allocated</p>
          )}
        </div>
      ),
    },
    {
      key: 'total_profit', label: 'Profit',
      render: (r: Partner) => (
        <span className={`text-sm font-medium ${r.total_profit > 0 ? 'text-green-600' : 'text-gray-400'}`}>
          {r.total_profit > 0 ? fmt(r.total_profit) : '—'}
        </span>
      ),
    },
    {
      key: 'is_active', label: 'Status',
      render: (r: Partner) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ]

  return (
    <>
      <AccountTable
        title="Partners"
        description="Investment partners with portal access and wallet management"
        columns={columns}
        data={data}
        loading={loading}
        onAdd={openAdd}
        addLabel="Add partner"
        searchPlaceholder="Search partners..."
        emptyMessage="No partners yet."
        rowActions={row => [
          { label: 'Edit details',       onClick: () => openEdit(row) },
          { label: 'View in partnership', onClick: () => router.push(`/portal/partnership/partner/${row.id}`) },
          ...(!row.user_id
            ? [{ label: 'Create login account', onClick: () => openCreateLogin(row) }]
            : [{ label: 'Reset login / change email', onClick: () => openCreateLogin(row) }]
          ),
          { label: row.is_active ? 'Deactivate' : 'Activate', onClick: () => toggleActive(row) },
          { label: 'Delete', onClick: () => handleDelete(row), danger: true },
        ]}
      />

      {/* Add / edit partner modal */}
      <Modal
        open={partnerOpen}
        onClose={() => setPartnerOpen(false)}
        title={editRow ? 'Edit partner' : 'Add new partner'}
        description={editRow ? `Editing ${editRow.name}` : 'Partner ID is auto-generated. Create a login account after saving.'}
        size="md"
      >
        <form onSubmit={handleSavePartner} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Full name <span className="text-red-400">*</span>
              </label>
              <input required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ebun Adeleye"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+234 800 000 0000"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
            <input type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="partner@email.com"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
            <textarea rows={2} value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Partner address"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPartnerOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editRow ? 'Save changes' : 'Add partner'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create login modal */}
      <Modal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title={loginPartner?.user_id ? 'Update login account' : 'Create login account'}
        description={`Setting up portal access for ${loginPartner?.name ?? ''}`}
        size="sm"
      >
        {loginSuccess ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-green-600" />
              </div>
              <p className="text-base font-semibold text-gray-900 text-center">Login account created!</p>
              <div className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Partner</span>
                  <span className="font-semibold text-gray-900">{loginPartner?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Login email</span>
                  <span className="font-semibold text-gray-900">{loginForm.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Password</span>
                  <span className="font-semibold text-gray-900">As set above</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-gray-500 shrink-0">Portal URL</span>
                  <Link href="/portal/partner-dashboard" className="font-semibold text-brand-600 inline-flex items-center gap-1 truncate hover:underline">
                    /portal/partner-dashboard <ExternalLink size={12} className="shrink-0" />
                  </Link>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Share these credentials with {loginPartner?.name}. They can change their password after logging in.
              </p>
            </div>
            <button onClick={() => { setLoginOpen(false); setLoginSuccess(false) }}
              className="w-full px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateLogin} className="space-y-4">
            {loginPartner?.user_id && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-700 font-medium">
                  This partner already has a login. Creating a new one will replace the existing credentials.
                </p>
              </div>
            )}

            <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
              <p className="text-xs text-brand-700 font-medium">Partner: <span className="font-bold">{loginPartner?.name}</span></p>
              <p className="text-xs text-brand-600 mt-0.5">
                They will log in at the same URL and be redirected to their partner dashboard automatically.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Login email <span className="text-red-400">*</span>
              </label>
              <input required type="email" value={loginForm.email}
                onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                placeholder="partner@email.com"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Temporary password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="At least 8 characters"
                  className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm password <span className="text-red-400">*</span>
              </label>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={loginForm.confirmPassword}
                onChange={e => setLoginForm(f => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Re-enter password"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {loginError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loginError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setLoginOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={savingLogin}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingLogin ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><UserPlus size={14} /> {loginPartner?.user_id ? 'Update account' : 'Create account'}</>}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
