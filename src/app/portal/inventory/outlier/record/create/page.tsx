'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Search, Plus, Trash2 } from 'lucide-react'
import { usePermissions, can } from '@/lib/permissions/hooks'
import PermissionGate from '@/components/ui/PermissionGate'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'

interface Container {
  id: string
  container_id: string
  tracking_number: string | null
  trip: { trip_id: string; title: string } | null
}

const TYPES = ['ISINLE', 'BAYA', 'BLEACHING'] as const

const TYPE_COLORS: Record<string, string> = {
  ISINLE:    'bg-blue-50 text-blue-700 border-blue-200',
  BAYA:      'bg-purple-50 text-purple-700 border-purple-200',
  BLEACHING: 'bg-amber-50 text-amber-700 border-amber-200',
}

interface LineItem {
  type: typeof TYPES[number] | ''
  quantity: string
  notes: string
}

export default function CreateOutlierRecordPage() {
  const router = useRouter()
  const [containers, setContainers] = useState<Container[]>([])
  const [loadingContainers, setLoadingContainers] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([{ type: '', quantity: '', notes: '' }])

  const [selfApprove, setSelfApprove] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { permissions, isSuperAdmin } = usePermissions()
  const canSelfApprove = isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*') || can(permissions, isSuperAdmin, 'outlier.approve')

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
      const emps = await getAdminProfiles()
      setEmployees(emps)

      const one = <T,>(v: T | T[] | null | undefined): T | null => v == null ? null : (Array.isArray(v) ? v[0] ?? null : v)

      const { data } = await supabase.from('containers')
        .select('id, container_id, tracking_number, trip:trips(trip_id, title)')
        .order('created_at', { ascending: false })
      setContainers((data ?? []).map(c => ({ ...c, trip: one(c.trip) })) as Container[])
      setLoadingContainers(false)
    }
    init()
  }, [])

  const filteredContainers = containers.filter(c => {
    if (search === '') return true
    const s = search.toLowerCase()
    return c.container_id.toLowerCase().includes(s) ||
      (c.tracking_number ?? '').toLowerCase().includes(s) ||
      (c.trip?.trip_id ?? '').toLowerCase().includes(s)
  })

  function updateLineItem(index: number, field: keyof LineItem, value: string) {
    setLineItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function addLineItem() {
    setLineItems(items => [...items, { type: '', quantity: '', notes: '' }])
  }

  function removeLineItem(index: number) {
    setLineItems(items => items.length > 1 ? items.filter((_, i) => i !== index) : items)
  }

  async function submit() {
    if (!selectedContainer) {
      setError('Please select a container')
      return
    }
    const validItems = lineItems.filter(i => i.type && i.quantity && Number(i.quantity) > 0)
    if (validItems.length === 0) {
      setError('Please add at least one valid line item')
      return
    }
    if (!selfApprove && !assignee) {
      setError('Please select an approver or use self-approve')
      return
    }

    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const status = (selfApprove && canSelfApprove) ? 'approved' : 'pending_approval'
    const approvedAt = (selfApprove && canSelfApprove) ? new Date().toISOString() : null
    const approvedBy = (selfApprove && canSelfApprove) ? user?.id : null

    const inserts = validItems.map(item => ({
      container_id: selectedContainer.id,
      type: item.type,
      quantity: Number(item.quantity),
      notes: item.notes.trim() || null,
      status,
      approved_at: approvedAt,
      approved_by: approvedBy,
      created_by: user?.id,
    }))

    const { data: created, error: insertError } = await supabase.from('outlier_records').insert(inserts).select()
    if (insertError || !created) {
      setError(insertError?.message ?? 'Failed to create records')
      setSaving(false)
      return
    }

    // Activity log + tasks
    for (const rec of created) {
      await supabase.from('outlier_record_activity_log').insert({
        outlier_record_id: rec.id,
        action: (selfApprove && canSelfApprove) ? 'Record created (self-approved)' : 'Record created',
        performed_by: user?.id,
      })

      if (selfApprove && canSelfApprove) {
        await supabase.from('tasks').insert({
          type: 'approval_request',
          title: `Outlier record approval: ${rec.record_id} (self-approved)`,
          description: `${rec.type} × ${rec.quantity} on ${selectedContainer.container_id}`,
          module: 'outlier_records',
          record_id: rec.id,
          record_ref: rec.record_id,
          requested_by: user?.id,
          assigned_to: user?.id,
          status: 'approved',
          priority: 'normal',
          review_note: 'Self-approved by ' + (user?.email ?? 'admin'),
        })
      } else {
        const { data: task } = await supabase.from('tasks').insert({
          type: 'approval_request',
          title: `Outlier record approval: ${rec.record_id}`,
          description: `${rec.type} × ${rec.quantity} on ${selectedContainer.container_id}`,
          module: 'outlier_records',
          record_id: rec.id,
          record_ref: rec.record_id,
          requested_by: user?.id,
          assigned_to: assignee,
          priority: 'normal',
        }).select().single()

        if (assignee) {
          await supabase.from('notifications').insert({
            user_id: assignee,
            type: 'task_approval_request',
            title: 'New task: Outlier record approval',
            message: `${rec.record_id} — ${rec.type} × ${rec.quantity}`,
            task_id: task?.id,
            record_id: rec.id,
            record_ref: rec.record_id,
            module: 'outlier_records',
          })
        }
      }
    }

    router.push('/portal/inventory/outlier')
  }

  return (
    <PermissionGate permKey="outlier.create">
      <div className="space-y-5 max-w-4xl">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Record outlier hides</h1>
            <p className="text-sm text-gray-400 mt-0.5">Add outlier hides recorded against a container</p>
          </div>
        </div>

        {/* Step 1: Select container */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">1. Select container</h2>
            {selectedContainer && (
              <button type="button" onClick={() => setSelectedContainer(null)}
                className="text-xs text-red-500 hover:text-red-700 font-medium">Change container</button>
            )}
          </div>

          {!selectedContainer ? (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by container ID, tracking, or trip..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                {loadingContainers ? (
                  <div className="p-4 text-center text-sm text-gray-400">Loading...</div>
                ) : filteredContainers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">No containers found</div>
                ) : filteredContainers.map(c => (
                  <button key={c.id} type="button" onClick={() => setSelectedContainer(c)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left">
                    <div>
                      <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{c.container_id}</span>
                      {c.tracking_number && <span className="text-xs text-gray-500 ml-2">{c.tracking_number}</span>}
                      <p className="text-xs text-gray-400 mt-0.5">{c.trip?.trip_id ?? '—'} · {c.trip?.title ?? '—'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
              <span className="font-mono text-xs bg-white text-brand-700 px-2 py-0.5 rounded">{selectedContainer.container_id}</span>
              {selectedContainer.tracking_number && <span className="text-xs text-gray-500 ml-2">{selectedContainer.tracking_number}</span>}
              <p className="text-xs text-gray-600 mt-1">{selectedContainer.trip?.trip_id ?? '—'} · {selectedContainer.trip?.title ?? '—'}</p>
            </div>
          )}
        </div>

        {/* Step 2: Line items */}
        {selectedContainer && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">2. Outlier line items</h2>
              <button type="button" onClick={addLineItem}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg">
                <Plus size={12} /> Add another
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Type <span className="text-red-400">*</span></label>
                    <select value={item.type} onChange={e => updateLineItem(i, 'type', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white ${item.type ? TYPE_COLORS[item.type] : 'border-gray-200'}`}>
                      <option value="">Select...</option>
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity <span className="text-red-400">*</span></label>
                    <input type="number" min="1" value={item.quantity} onChange={e => updateLineItem(i, 'quantity', e.target.value)}
                      placeholder="0" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div className="col-span-6">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
                    <input value={item.notes} onChange={e => updateLineItem(i, 'notes', e.target.value)}
                      placeholder="Optional notes..." className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div className="col-span-1 pt-7">
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLineItem(i)}
                        className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Approval */}
        {selectedContainer && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">3. Approval</h2>

            {canSelfApprove && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={selfApprove} onChange={e => setSelfApprove(e.target.checked)} className="mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-amber-900">Self-approve these records</span>
                    <p className="text-xs text-amber-700 mt-0.5">As an admin, you can create these records as already approved.</p>
                  </div>
                </label>
              </div>
            )}

            {!selfApprove && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Assign approval to <span className="text-red-400">*</span></label>
                <select value={assignee} onChange={e => setAssignee(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="">Select approver...</option>
                  {employees.filter(e => e.id !== currentUserId).map(e => (
                    <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {selectedContainer && (
          <>
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg"><p className="text-sm text-red-700">{error}</p></div>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => router.back()}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={submit} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {selfApprove ? 'Save & approve' : 'Submit for approval'}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </PermissionGate>
  )
}
