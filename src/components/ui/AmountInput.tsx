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

function formatDisplay(raw: string): string {
  if (!raw) return ''
  const clean = raw.replace(/[^0-9.]/g, '')
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
  const [display, setDisplay] = useState(() => formatDisplay(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const isFocused = useRef(false)

  // When value changes externally (e.g. when editField opens with a new value),
  // re-format the display — but only if the input is not currently focused
  useEffect(() => {
    if (!isFocused.current) {
      setDisplay(formatDisplay(value))
    }
  }, [value])

  function handleFocus() {
    isFocused.current = true
  }

  function handleBlur() {
    isFocused.current = false
    setDisplay(formatDisplay(value))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
    setDisplay(formatDisplay(raw))
    onChange(raw)
  }

  function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
    e.preventDefault()
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Block up/down arrow keys
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
    }
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className={`[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
    />
  )
}

