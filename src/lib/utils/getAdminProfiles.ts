import { createClient } from '@/lib/supabase/client'

export interface AdminProfile {
  id: string
  full_name: string | null
  email: string
}

export async function getAdminProfiles(): Promise<AdminProfile[]> {
  const supabase = createClient()

  // Get user IDs with admin or super_admin roles
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('user_id, roles(name)')

  const adminUserIds = (roleData ?? [])
    .filter((r: any) => {
      const role = r.roles as { name?: string } | null
      return role?.name === 'admin' || role?.name === 'super_admin'
    })
    .map((r: any) => r.user_id as string)

  if (adminUserIds.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('is_active', true)
    .in('id', adminUserIds)
    .order('full_name')

  return profiles ?? []
}
