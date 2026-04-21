'use client'

import { useRef, useState } from 'react'

interface AmountInputProps {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
}

export function formatAmount(raw: string): string {
  if (!raw) return ''
  const clean = String(raw).replace(/[^0-9.]/g, '')
  if (!clean) return ''
  const parts = clean.split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (parts.length > 1) return `${intPart}.${parts[1]}`
  return intPart
}

export default function AmountInput({
  value,
  onChange,
  placeholder = '0.00',
  required = false,
  disabled = false,
  className = '',
  id,
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const focused = useRef(false)

  // Display is fully controlled by this component while focused
  // When not focused, derive from the prop value
  const [display, setDisplay] = useState(formatAmount(value))

  function handleFocus() {
    focused.current = true
  }

  function handleBlur() {
    focused.current = false
    // Re-sync with parent value on blur
    setDisplay(formatAmount(value))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const cursorPos = input.selectionStart ?? 0

    // Strip commas to get raw number
    const raw = input.value.replace(/,/g, '')

    // Only allow valid numeric input
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return

    const newDisplay = formatAmount(raw)

    // Calculate how many commas exist before cursor in old and new display
    const commasBefore = (display.substring(0, cursorPos).match(/,/g) ?? []).length
    const newCommasBefore = (newDisplay.substring(0, cursorPos).match(/,/g) ?? []).length
    const cursorAdjust = newCommasBefore - commasBefore

    setDisplay(newDisplay)
    onChange(raw)

    requestAnimationFrame(() => {
      if (inputRef.current) {
        const newCursor = cursorPos + cursorAdjust
        inputRef.current.setSelectionRange(newCursor, newCursor)
      }
    })
  }

  function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
    e.preventDefault()
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
  }

  // If not focused, always show formatted prop value
  const displayValue = focused.current ? display : formatAmount(value)

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className={className}
    />
  )
}

