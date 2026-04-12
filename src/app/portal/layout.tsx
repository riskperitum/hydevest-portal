import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .eq('id', user.id)
    .single()

  const { data: userRolesData } = await supabase
    .from('user_roles')
    .select('role:roles(name)')
    .eq('user_id', user.id)

  const roles = (userRolesData ?? []).flatMap((ur) => {
    const r = ur.role as { name: string } | { name: string }[] | null | undefined;
    if (!r) return [];
    if (Array.isArray(r)) return r.map((x) => x.name).filter(Boolean);
    return r.name ? [r.name] : [];
  });

  const isSuperAdmin = roles.includes('super_admin')
  const isPartner = roles.includes('partner') && !isSuperAdmin
  if (isPartner) redirect('/dashboard')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar roles={roles} isSuperAdmin={isSuperAdmin} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header profile={profile} isSuperAdmin={isSuperAdmin} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}