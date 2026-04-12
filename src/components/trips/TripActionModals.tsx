'use client'
import { useState } from 'react'
import { AlertTriangle, Star, Loader2, CheckCircle2 } from 'lucide-react'

export interface TripForModal {
  id: string
  trip_id: string
  title: string
  location?: string | null
  last_reviewed_at?: string | null
  modified_since_last_review?: boolean
}

export function RequestReviewModal({ trip, open, onClose, onConfirm }: { trip: TripForModal; open: boolean; onClose: () => void; onConfirm: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  if (!open) return null
  async function handleConfirm() {
    setLoading(true)
    await onConfirm(trip.id)
    setLoading(false)
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
            <Star size={16} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Request review</h2>
            <p className="text-xs text-gray-400">Notify the assigned reviewer</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 border border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md font-semibold border border-brand-100 shrink-0">{trip.trip_id}</span>
            <span className="text-sm font-medium text-gray-700 truncate">{trip.title}</span>
          </div>
          {trip.modified_since_last_review && (
            <span className="flex items-center gap-1 text-[11px] text-amber-600 shrink-0">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M4.8 1.6L0.75 8.8A.65.65 0 001.37 9.8H9.63a.65.65 0 00.62-1L6.2 1.6a.84.84 0 00-1.4 0z" fill="#EF9F27"/></svg>
              Modified
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          This will notify the assigned reviewer that <span className="font-medium text-gray-700">{trip.title}</span> is ready for review.
          {trip.last_reviewed_at && <> Last reviewed on {new Date(trip.last_reviewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</>}
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={loading} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
            {loading ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Star size={14} /> Send request</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DeleteApprovalModal({ trip, open, onClose, onConfirm }: { trip: TripForModal; open: boolean; onClose: () => void; onConfirm: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  if (!open) return null
  async function handleConfirm() {
    setLoading(true)
    await onConfirm(trip.id)
    setLoading(false)
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Deletion requires approval</h2>
            <p className="text-xs text-gray-400">A request will be submitted for review</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center gap-3 border border-gray-100">
          <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md font-semibold border border-brand-100 shrink-0">{trip.trip_id}</span>
          <span className="text-sm font-medium text-gray-700 truncate">{trip.title}</span>
          {trip.location && <span className="ml-auto text-xs text-gray-400 shrink-0">{trip.location}</span>}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">Deleting this trip is irreversible. A deletion request will be submitted and must be approved before the trip is permanently removed.</p>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={loading} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
            {loading ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : 'Submit deletion request'}
          </button>
        </div>
      </div>
    </div>
  )
}
