'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Loader2, Pencil, Users, PieChart } from 'lucide-react'
import Modal from '@/components/ui/Modal'

interface Director {
  id: string
  director_id: string
  full_name: string
  nationality: string | null
  address: string | null
  email: string | null
  phone: string | null
  shareholding_pct: number
  appointed_date: string | null
  resigned_date: string | null
  is_active: boolean
  notes: string | null
}

export default function DirectorsTab({ canManageSettings }: { canManageSettings: boolean }) {
  const [directors, setDirectors] = useState<Director[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editRow, setEditRow] = useState<Director | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    nationality: 'Nigerian',
    address: '',
    email: '',
    phone: '',
    shareholding_pct: '',
    appointed_date: '',
    notes: '',
  })

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('finance_directors')
      .select('*')
      .order('shareholding_pct', { ascending: false })
    setDirectors((data ?? []).map(d => ({ ...d, shareholding_pct: Number(d.shareholding_pct) })))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  function openAdd() {
    setEditRow(null)
    setForm({ full_name: '', nationality: 'Nigerian', address: '', email: '', phone: '', shareholding_pct: '', appointed_date: new Date().toISOString().split('T')[0], notes: '' })
    setOpen(true)
  }

  function openEdit(row: Director) {
    setEditRow(row)
    setForm({
      full_name: row.full_name, nationality: row.nationality ?? '',
      address: row.address ?? '', email: row.email ?? '',
      phone: row.phone ?? '', shareholding_pct: row.shareholding_pct.toString(),
      appointed_date: row.appointed_date ?? '', notes: row.notes ?? '',
    })
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canManageSettings) return
    setSaving(true)
    const supabase = createClient()
    const seq = Date.now().toString().slice(-4)
    const payload = {
      full_name: form.full_name, nationality: form.nationality || null,
      address: form.address || null, email: form.email || null,
      phone: form.phone || null,
      shareholding_pct: parseFloat(form.shareholding_pct) || 0,
      appointed_date: form.appointed_date || null,
      notes: form.notes || null,
      created_by: currentUser?.id,
    }
    if (editRow) {
      await supabase.from('finance_directors').update(payload).eq('id', editRow.id)
    } else {
      await supabase.from('finance_directors').insert({ ...payload, director_id: `DIR-${seq}` })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  async function toggleActive(row: Director) {
    if (!canManageSettings) return
    const supabase = createClient()
    const update: any = { is_active: !row.is_active }
    if (row.is_active) update.resigned_date = new Date().toISOString().split('T')[0]
    await supabase.from('finance_directors').update(update).eq('id', row.id)
    load()
  }

  const totalShares = directors.filter(d => d.is_active).reduce((s, d) => s + d.shareholding_pct, 0)
  const activeDirectors = directors.filter(d => d.is_active)

  return (
    <div className="p-5 space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Directors register</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {activeDirectors.length} active director{activeDirectors.length !== 1 ? 's' : ''} · Total shareholding: {totalShares.toFixed(2)}%
          </p>
        </div>
        {canManageSettings && (
          <button onClick={openAdd}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
            <Plus size={14} /> Add director
          </button>
        )}
      </div>

      {/* Shareholding visual */}
      {activeDirectors.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <PieChart size={15} className="text-brand-600" /> Shareholding structure
          </h3>
          <div className="space-y-3">
            {activeDirectors.map((d, i) => {
              const colors = ['bg-brand-500','bg-blue-500','bg-green-500','bg-amber-500','bg-purple-500','bg-red-500']
              const color = colors[i % colors.length]
              return (
                <div key={d.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800">{d.full_name}</span>
                    <span className="font-bold text-brand-700">{d.shareholding_pct.toFixed(2)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`}
                      style={{ width: `${Math.min(d.shareholding_pct, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          {Math.abs(totalShares - 100) > 0.01 && totalShares > 0 && (
            <p className={`text-xs font-medium mt-3 ${totalShares > 100 ? 'text-red-600' : 'text-amber-600'}`}>
              ⚠ Total shareholding is {totalShares.toFixed(2)}% — should equal 100%
            </p>
          )}
          {Math.abs(totalShares - 100) <= 0.01 && (
            <p className="text-xs font-medium text-green-600 mt-3">✓ Shareholding structure totals 100%</p>
          )}
        </div>
      )}

      {/* Directors table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="p-4 border-b animate-pulse flex gap-4">
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))
        ) : directors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Users size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No directors added yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['ID','Full name','Nationality','Email','Phone','Shareholding','Appointed','Status',''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {directors.map(d => (
                  <tr key={d.id} className={`hover:bg-gray-50/50 transition-colors ${!d.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{d.director_id}</span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{d.full_name}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{d.nationality ?? '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{d.email ?? '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{d.phone ?? '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-sm font-bold text-brand-700">{d.shareholding_pct.toFixed(2)}%</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {d.appointed_date
                        ? new Date(d.appointed_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${d.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {d.is_active ? 'Active' : 'Resigned'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {canManageSettings && (
                          <button onClick={() => openEdit(d)}
                            className="p-1.5 rounded hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors">
                            <Pencil size={13} />
                          </button>
                        )}
                        {canManageSettings && (
                          <button onClick={() => toggleActive(d)}
                            className="text-xs font-medium text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                            {d.is_active ? 'Resign' : 'Reinstate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/edit modal */}
      <Modal open={open} onClose={() => setOpen(false)}
        title={editRow ? 'Edit director' : 'Add director'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Full legal name <span className="text-red-400">*</span>
              </label>
              <input required value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="e.g. Adewale Babatunde Johnson"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nationality</label>
              <input value={form.nationality}
                onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                placeholder="e.g. Nigerian"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Shareholding % <span className="text-red-400">*</span>
              </label>
              <input required type="number" step="0.01" min="0" max="100"
                value={form.shareholding_pct}
                onChange={e => setForm(f => ({ ...f, shareholding_pct: e.target.value }))}
                placeholder="e.g. 50.00"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="director@email.com"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+234 800 000 0000"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date appointed</label>
              <input type="date" value={form.appointed_date}
                onChange={e => setForm(f => ({ ...f, appointed_date: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Residential address</label>
            <textarea rows={2} value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Director residential address"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional information..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={!canManageSettings || saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editRow ? 'Save changes' : 'Add director'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

