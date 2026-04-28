import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import PortalShell from '@/components/layout/PortalShell'
import SessionGuard from '@/components/auth/SessionGuard'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('id', user.id)
    .single()

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id)

  function roleNameFromRow(row: { roles?: unknown }): string | undefined {
    const roles = row.roles as { name?: string } | { name?: string }[] | null | undefined
    if (!roles) return undefined
    const r = Array.isArray(roles) ? roles[0] : roles
    return r?.name
  }

  const isSuperAdmin = (roleData ?? []).some(r => roleNameFromRow(r) === 'super_admin')
  const isPartner    = (roleData ?? []).some(r => roleNameFromRow(r) === 'partner')

  // Redirect partners away from non-partner pages
  if (isPartner) {
    const headerList = await headers()
    const pathname = headerList.get('x-pathname') ?? ''
    const partnerAllowed = [
      '/portal/partner-dashboard',
      '/portal/partner-requestbox',
      '/portal/notifications',
    ]
    if (!partnerAllowed.some(p => pathname.startsWith(p))) {
      redirect('/portal/partner-dashboard')
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar isPartner={isPartner} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header profile={profile} isSuperAdmin={isSuperAdmin} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
            <PortalShell>
              {children}
            </PortalShell>
          </div>
        </main>
        <SessionGuard userId={user.id} />
      </div>
    </div>
  )
}
