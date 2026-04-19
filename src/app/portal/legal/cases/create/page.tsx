'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, X } from 'lucide-react'
import { getAdminProfiles } from '@/lib/utils/getAdminProfiles'

interface Customer {
  id: string
  name: string
  customer_id: string
}

export default function CreateLegalCasePage() {
  const router = useRouter()
  const [saving, setSaving]         = useState(false)
  const [customers, setCustomers]   = useState<Customer[]>([])
  const [employees, setEmployees]   = useState<any[]>([])
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')

  const [form, setForm] = useState({
    title:       '',
    description: '',
    case_type:   'debt_recovery',
    status:      'open',
    priority:    'normal',
    opened_date: new Date().toISOString().split('T')[0],
    assigned_to: '',
  })

  useEffect(() => {
    const supabase = createClient()
    supabase.from('customers').select('id, name, customer_id')
      .eq('is_active', true).order('name')
      .then(({ data }) => {
        setCustomers(data ?? [])
      })
    getAdminProfiles().then(setEmployees)
  }, [])

  function addCustomer(customer: Customer) {
    if (!selectedCustomers.find(c => c.id === customer.id)) {
      setSelectedCustomers(prev => [...prev, customer])
    }
    setCustomerSearch('')
  }

  function removeCustomer(id: string) {
    setSelectedCustomers(prev => prev.filter(c => c.id !== id))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const seq = Date.now().toString().slice(-5)

    const { data: legalCase, error } = await supabase.from('legal_cases').insert({
      case_id:     `CASE-${seq}`,
      title:       form.title,
      description: form.description || null,
      case_type:   form.case_type,
      status:      form.status,
      priority:    form.priority,
      opened_date: form.opened_date,
      assigned_to: form.assigned_to || null,
      created_by:  user?.id,
    }).select().single()

    if (error || !legalCase) { setSaving(false); return }

    // Link customers
    if (selectedCustomers.length > 0) {
      await supabase.from('legal_case_customers').insert(
        selectedCustomers.map(c => ({ case_id: legalCase.id, customer_id: c.id }))
      )
    }

    // Log activity
    await supabase.from('legal_case_activity').insert({
      case_id:    legalCase.id,
      action:     'Case created',
      notes:      `Case ${legalCase.case_id} opened`,
      created_by: user?.id,
    })

    setSaving(false)
    router.push(`/portal/legal/cases/${legalCase.id}`)
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New legal case</h1>
          <p className="text-sm text-gray-400">Create a new case record</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="space-y-5">

        {/* Basic details */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Case details</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Case title <span className="text-red-400">*</span>
              </label>
              <input required value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Brief description of the case"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea rows={3} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Detailed description of the case..."
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Case type</label>
                <select value={form.case_type}
                  onChange={e => setForm(f => ({ ...f, case_type: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="debt_recovery">Debt recovery</option>
                  <option value="contract_dispute">Contract dispute</option>
                  <option value="property">Property</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
                <select value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                <select value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="pending_court">Pending court</option>
                  <option value="police_arrest">Police arrest</option>
                  <option value="settled">Settled</option>
                  <option value="closed">Closed</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Date opened</label>
                <input type="date" value={form.opened_date}
                  onChange={e => setForm(f => ({ ...f, opened_date: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assigned to</label>
              <select value={form.assigned_to}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">Unassigned</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.full_name ?? e.email}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Customers */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Associated customers</h3>
          </div>
          <div className="p-5 space-y-3">
            {/* Selected customer tags */}
            {selectedCustomers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedCustomers.map(c => (
                  <div key={c.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border"
                    style={{ background: '#f0ecfc', color: '#55249E', borderColor: '#d4c8f7' }}>
                    <span>{c.name}</span>
                    <span className="opacity-50 text-xs">({c.customer_id})</span>
                    <button type="button" onClick={() => removeCustomer(c.id)}
                      className="ml-1 hover:opacity-60 transition-opacity">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="flex gap-2">
              <input
                list="customer-list"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const match = customers.find(c =>
                      `${c.name} (${c.customer_id})` === customerSearch ||
                      c.name.toLowerCase() === customerSearch.toLowerCase() ||
                      c.customer_id.toLowerCase() === customerSearch.toLowerCase()
                    )
                    if (match) { addCustomer(match); }
                  }
                }}
                placeholder="Type to search and add customers..."
                className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button type="button"
                onClick={() => {
                  const match = customers.find(c =>
                    `${c.name} (${c.customer_id})` === customerSearch ||
                    c.name.toLowerCase() === customerSearch.toLowerCase() ||
                    c.customer_id.toLowerCase() === customerSearch.toLowerCase()
                  )
                  if (match) addCustomer(match)
                }}
                className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 whitespace-nowrap"
                style={{ background: '#55249E' }}>
                Add
              </button>
            </div>
            <datalist id="customer-list">
              {customers
                .filter(c => !selectedCustomers.find(sc => sc.id === c.id))
                .map(c => (
                  <option key={c.id} value={`${c.name} (${c.customer_id})`} />
                ))}
            </datalist>
            <p className="text-xs text-gray-400">
              Search by name or customer ID. Press Enter or click Add to tag a customer.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()}
            className="px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 disabled:opacity-50"
            style={{ background: '#55249E' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Save size={14} /> Create case</>}
          </button>
        </div>
      </form>
    </div>
  )
}

