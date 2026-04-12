interface ModifiedIndicatorProps {
  lastReviewedAt?: string | null
}

export function ModifiedIndicator({ lastReviewedAt }: ModifiedIndicatorProps) {
  const label = lastReviewedAt
    ? `Modified since last review (${new Date(lastReviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`
    : 'Modified since last review'
  return (
    <span className="group relative inline-flex items-center ml-1.5 cursor-default">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M5.93 2L0.9 11A.85.85 0 001.72 12.3H12.28a.85.85 0 00.82-1.3L8.07 2a1.15 1.15 0 00-2.14 0z" fill="#EF9F27" stroke="#BA7517" strokeWidth="0.5"/>
        <text x="7" y="10.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="#633806">!</text>
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-[11px] text-gray-100 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {label}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </span>
    </span>
  )
}
