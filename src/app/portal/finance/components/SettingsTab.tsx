'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, Loader2, Settings, Plus, Check } from 'lucide-react'

interface Setting {
  id: string
  key: string
  value: string
  description: string | null
}

interface Period {
  id: string
  name: string
  period_start: string
  period_end: string
  status: string
  is_opening: boolean
}

const SETTING_LABELS: Record<string, { label: string; group: string; type: string }> = {
  company_name:         { label: 'Company legal name',          group: 'Company',    type: 'text' },
  company_rc:           { label: 'CAC registration number',     group: 'Company',    type: 'text' },
  company_tin:          { label: 'Tax identification number',   group: 'Company',    type: 'text' },
  go_live_date:         { label: 'Finance go-live date',        group: 'Company',    type: 'date' },
  default_currency:     { label: 'Default currency',            group: 'Company',    type: 'text' },
  fiscal_year_start:    { label: 'Fiscal year start month',     group: 'Company',    type: 'text' },
  usd_rate:             { label: 'USD/NGN exchange rate',       group: 'Exchange',   type: 'number' },
  vat_rate:             { label: 'VAT rate (%)',                group: 'Tax rates',  type: 'number' },
  cit_small_threshold:  { label: 'CIT small threshold (NGN)',   group: 'Tax rates',  type: 'number' },
  cit_medium_threshold: { label: 'CIT medium threshold (NGN)',  group: 'Tax rates',  type: 'number' },
  cit_small_rate:       { label: 'CIT small rate (%)',          group: 'Tax rates',  type: 'number' },
  cit_medium_rate:      { label: 'CIT medium rate (%)',         group: 'Tax rates',  type: 'number' },
  cit_large_rate:       { label: 'CIT large rate (%)',          group: 'Tax rates',  type: 'number' },
  edt_rate:             { label: 'Education tax rate (%)',      group: 'Tax rates',  type: 'number' },
  nitda_rate:           { label: 'NITDA levy rate (%)',         group: 'Tax rates',  type: 'number' },
  nitda_threshold:      { label: 'NITDA threshold (NGN)',       group: 'Tax rates',  type: 'number' },
  wht_professional:     { label: 'WHT — professional fees (%)', group: 'Tax rates',  type: 'number' },
  wht_rent:             { label: 'WHT — rent (%)',              group: 'Tax rates',  type: 'number' },
  wht_dividend:         { label: 'WHT — dividends (%)',         group: 'Tax rates',  type: 'number' },
  depreciation_auto:    { label: 'Auto-run depreciation',       group: 'Automation', type: 'text' },
}

const GROUPS = ['Company', 'Exchange', 'Tax rates', 'Automation']

export default function SettingsTab({ canManageSettings }: { canManageSettings: boolean }) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [sigSaved, setSigSaved] = useState(false)
  const [sigCleared, setSigCleared] = useState(false)
  const [existingSig, setExistingSig] = useState('')
  const [signatoryName, setSignatoryName] = useState('')

  // New period form
  const [periodOpen, setPeriodOpen] = useState(false)
  const [periodForm, setPeriodForm] = useState({ name: '', period_start: '', period_end: '' })
  const [savingPeriod, setSavingPeriod] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: settingsData }, { data: periodData }] = await Promise.all([
      supabase.from('finance_settings').select('*'),
      supabase.from('finance_periods').select('*').order('period_start', { ascending: false }),
    ])
    const map = Object.fromEntries((settingsData ?? []).map(s => [s.key, s.value]))
    setSettings(map)
    setPeriods(periodData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      if (e instanceof TouchEvent) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        }
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    }

    const startDraw = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      isDrawing.current = true
      const pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    const draw = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      if (!isDrawing.current) return
      const pos = getPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    const stopDraw = () => { isDrawing.current = false }

    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDraw)
    canvas.addEventListener('mouseleave', stopDraw)
    canvas.addEventListener('touchstart', startDraw, { passive: false })
    canvas.addEventListener('touchmove', draw, { passive: false })
    canvas.addEventListener('touchend', stopDraw)

    return () => {
      canvas.removeEventListener('mousedown', startDraw)
      canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', stopDraw)
      canvas.removeEventListener('mouseleave', stopDraw)
      canvas.removeEventListener('touchstart', startDraw)
      canvas.removeEventListener('touchmove', draw)
      canvas.removeEventListener('touchend', stopDraw)
    }
  }, [])

  useEffect(() => {
    if (settings.authorized_signature) setExistingSig(settings.authorized_signature)
    if (settings.authorized_signatory_name) setSignatoryName(settings.authorized_signatory_name)
  }, [settings])

  function clearSignature() {
    if (!canManageSettings) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSigCleared(true)
    setSigSaved(false)
  }

  async function saveSignature() {
    if (!canManageSettings) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const supabase = (await import('@/lib/supabase/client')).createClient()
    await supabase.from('finance_settings')
      .upsert({ key: 'authorized_signature', value: dataUrl, updated_by: currentUser?.id }, { onConflict: 'key' })
    await supabase.from('finance_settings')
      .upsert({ key: 'authorized_signatory_name', value: signatoryName, updated_by: currentUser?.id }, { onConflict: 'key' })
    setExistingSig(dataUrl)
    setSigSaved(true)
    setTimeout(() => setSigSaved(false), 3000)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!canManageSettings) return
    setSaving(true)
    const supabase = createClient()
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from('finance_settings')
        .upsert({ key, value, updated_by: currentUser?.id }, { onConflict: 'key' })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function createPeriod(e: React.FormEvent) {
    e.preventDefault()
    if (!canManageSettings) return
    setSavingPeriod(true)
    const supabase = createClient()
    await supabase.from('finance_periods').insert({
      name: periodForm.name,
      period_start: periodForm.period_start,
      period_end: periodForm.period_end,
      status: 'open',
      is_opening: false,
    })
    setSavingPeriod(false)
    setPeriodOpen(false)
    setPeriodForm({ name: '', period_start: '', period_end: '' })
    load()
  }

  async function closePeriod(id: string) {
    if (!canManageSettings) return
    if (!confirm('Close this period? No more journal entries can be posted to a closed period.')) return
    const supabase = createClient()
    await supabase.from('finance_periods').update({ status: 'closed' }).eq('id', id)
    load()
  }

  async function lockPeriod(id: string) {
    if (!canManageSettings) return
    if (!confirm('Lock this period? This is permanent and cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('finance_periods').update({ status: 'locked' }).eq('id', id)
    load()
  }

  // Auto-generate next month period name
  function autoNextPeriod() {
    if (!canManageSettings) return
    const lastPeriod = periods.find(p => !p.is_opening)
    if (!lastPeriod) return
    const nextStart = new Date(lastPeriod.period_end)
    nextStart.setDate(nextStart.getDate() + 1)
    const nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 0)
    const name = nextStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    setPeriodForm({
      name,
      period_start: nextStart.toISOString().split('T')[0],
      period_end: nextEnd.toISOString().split('T')[0],
    })
    setPeriodOpen(true)
  }

  const STATUS_COLOR: Record<string, string> = {
    open:   'bg-green-50 text-green-700',
    closed: 'bg-gray-100 text-gray-500',
    locked: 'bg-red-50 text-red-600',
  }

  return (
    <div className="p-5 space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Finance settings</h2>
          <p className="text-xs text-gray-400 mt-0.5">Company details, tax rates and accounting periods</p>
        </div>
      </div>

      {/* Settings form */}
      <form onSubmit={saveSettings} className="space-y-6">
        {GROUPS.map(group => {
          const groupSettings = Object.entries(SETTING_LABELS).filter(([, v]) => v.group === group)
          return (
            <div key={group} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{group}</h3>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {groupSettings.map(([key, meta]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{meta.label}</label>
                    {key === 'depreciation_auto' ? (
                      <select value={settings[key] ?? 'true'}
                        onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    ) : (
                      <input
                        type={meta.type === 'number' ? 'number' : meta.type === 'date' ? 'date' : 'text'}
                        step={meta.type === 'number' ? '0.01' : undefined}
                        value={settings[key] ?? ''}
                        onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Signature section */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Authorized signatory</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Signatory name</label>
              <input value={signatoryName}
                onChange={e => setSignatoryName(e.target.value)}
                placeholder="e.g. Sak Adeleye"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Draw signature</label>
              <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-white" style={{ maxWidth: 400 }}>
                <canvas ref={canvasRef} width={400} height={150}
                  className="w-full cursor-crosshair touch-none block"
                  style={{ height: 150 }} />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Draw your signature above using mouse or finger</p>
            </div>

            {existingSig && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Current saved signature:</p>
                <div className="border border-gray-100 rounded-xl p-3 bg-gray-50 inline-block">
                  <img src={existingSig} alt="Saved signature" style={{ height: 60, maxWidth: 300 }} className="object-contain" />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              {canManageSettings && (
                <button type="button" onClick={saveSignature}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700">
                  {sigSaved ? '✓ Signature saved' : 'Save signature'}
                </button>
              )}
              {canManageSettings && (
                <button type="button" onClick={clearSignature}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          {canManageSettings && (
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : saved ? <><Check size={14} /> Saved!</>
                : <><Save size={14} /> Save settings</>}
            </button>
          )}
        </div>
      </form>

      {/* Accounting periods */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Accounting periods</h3>
          {canManageSettings && (
            <button onClick={autoNextPeriod}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              <Plus size={12} /> Add next period
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Period','Start','End','Status',''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {periods.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {p.name}
                    {p.is_opening && <span className="ml-2 text-xs bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded">Opening</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(p.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(p.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {canManageSettings && p.status === 'open' && !p.is_opening && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => closePeriod(p.id)}
                          className="text-xs font-medium text-amber-600 hover:text-amber-700 hover:underline">
                          Close
                        </button>
                      </div>
                    )}
                    {canManageSettings && p.status === 'closed' && (
                      <button onClick={() => lockPeriod(p.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline">
                        Lock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual add period modal */}
      {periodOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPeriodOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Add accounting period</h2>
            <form onSubmit={createPeriod} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Period name</label>
                <input required value={periodForm.name}
                  onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. January 2026"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Start date</label>
                  <input type="date" required value={periodForm.period_start}
                    onChange={e => setPeriodForm(f => ({ ...f, period_start: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">End date</label>
                  <input type="date" required value={periodForm.period_end}
                    onChange={e => setPeriodForm(f => ({ ...f, period_end: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPeriodOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={!canManageSettings || savingPeriod}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingPeriod ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

