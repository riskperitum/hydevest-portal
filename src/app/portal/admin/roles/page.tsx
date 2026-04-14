'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2,
  X, Shield, ChevronRight, Lock
} from 'lucide-react'
import Link from 'next/link'

interface Role {
  id: string
  name: string
  description: string | null
  is_system: boolean
  created_at: string
  permission_count?: number
  user_count?: number
}

export default function RolesPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: rolesData } = await supabase
      .from('roles')
      .select('*')
      .order('created_at', { ascending: true })

    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('role_id')

    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id')

    const permCount = (rolePerms ?? []).reduce((acc, rp) => {
      acc[rp.role_id] = (acc[rp.role_id] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    const userCount = (userRoles ?? []).reduce((acc, ur) => {
      acc[ur.role_id] = (acc[ur.role_id] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    setRoles((rolesData ?? []).map(r => ({
      ...r,
      permission_count: permCount[r.id] ?? 0,
      user_count: userCount[r.id] ?? 0,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    if (editRole) {
      await supabase.from('roles').update({ name: form.name, description: form.description }).eq('id', editRole.id)
    } else {
      await supabase.from('roles').insert({ name: form.name, description: form.description })
    }
    setSaving(false)
    setModalOpen(false)
    setEditRole(null)
    setForm({ name: '', description: '' })
    load()
  }

  async function handleDelete(role: Role) {
    if (role.is_system) return
    if (!confirm(`Delete role "${role.name}"? This will remove it from all users.`)) return
    const supabase = createClient()
    await supabase.from('roles').delete().eq('id', role.id)
    load()
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/portal/admin"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Roles & Groups</h1>
            <p className="text-sm text-gray-400 mt-0.5">{roles.length} roles configured</p>
          </div>
        </div>
        <button onClick={() => { setEditRole(null); setForm({ name: '', description: '' }); setModalOpen(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
          <Plus size={16} /> Create role
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-brand-600" size={24} />
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {roles.map(role => (
              <div key={role.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors group">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                  ${role.is_system ? 'bg-brand-100' : 'bg-gray-100'}`}>
                  {role.is_system
                    ? <Lock size={15} className="text-brand-600" />
                    : <Shield size={15} className="text-gray-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{role.name}</p>
                    {role.is_system && (
                      <span className="text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-medium">System</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{role.description ?? 'No description'}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0">
                  <span>{role.permission_count} permission{role.permission_count !== 1 ? 's' : ''}</span>
                  <span>{role.user_count} user{role.user_count !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => router.push(`/portal/admin/roles/${role.id}`)}
                    className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors"
                    title="Manage permissions">
                    <ChevronRight size={16} />
                  </button>
                  {!role.is_system && (
                    <>
                      <button onClick={() => { setEditRole(role); setForm({ name: role.name, description: role.description ?? '' }); setModalOpen(true) }}
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors opacity-0 group-hover:opacity-100">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(role)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{editRole ? 'Edit role' : 'Create role'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role name <span className="text-red-400">*</span></label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. Sales Manager" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="Describe what this role can do..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editRole ? 'Save changes' : 'Create role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

