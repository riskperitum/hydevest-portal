'use client'

import { useEffect } from 'react'

export function usePreventScrollOnNumberInputs() {
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' &&
        ((target as HTMLInputElement).type === 'number' ||
         (target as HTMLInputElement).getAttribute('inputmode') === 'decimal' ||
         (target as HTMLInputElement).getAttribute('inputmode') === 'numeric')
      ) {
        e.preventDefault()
        target.blur()
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [])
}

