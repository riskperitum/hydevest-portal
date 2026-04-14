'use client'

import { useRef, useEffect, useState } from 'react'

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
  if (!raw && raw !== '0') return ''
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [display, setDisplay] = useState(formatAmount(value))

  // Sync when value changes externally and input is not focused
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDisplay(formatAmount(value))
    }
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const cursorPos = input.selectionStart ?? 0
    const oldDisplay = display
    const rawTyped = input.value.replace(/,/g, '')

    // Only allow digits and one decimal point
    if (rawTyped !== '' && !/^\d*\.?\d*$/.test(rawTyped)) return

    const newDisplay = formatAmount(rawTyped)
    setDisplay(newDisplay)
    onChange(rawTyped)

    // Restore cursor position accounting for added/removed commas
    requestAnimationFrame(() => {
      if (!inputRef.current) return
      const addedCommas = (newDisplay.slice(0, cursorPos).match(/,/g) ?? []).length
      const oldCommas = (oldDisplay.slice(0, cursorPos).match(/,/g) ?? []).length
      const diff = addedCommas - oldCommas
      const newCursor = cursorPos + diff
      inputRef.current.setSelectionRange(newCursor, newCursor)
    })
  }

  function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
    e.preventDefault()
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
  }

  function handleBlur() {
    setDisplay(formatAmount(value))
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
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

