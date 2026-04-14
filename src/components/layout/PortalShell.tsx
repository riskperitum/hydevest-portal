'use client'

import { usePreventScrollOnNumberInputs } from '@/lib/utils/usePreventScrollOnNumberInputs'

export default function PortalShell({ children }: { children: React.ReactNode }) {
  usePreventScrollOnNumberInputs()
  return <>{children}</>
}

