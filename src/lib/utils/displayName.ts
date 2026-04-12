/**
 * Returns the display name for a user profile.
 * Priority: first name > full name > email username > email
 */
export function displayName(profile: {
  full_name?: string | null
  email?: string | null
} | null | undefined): string {
  if (!profile) return 'Unknown'
  if (profile.full_name) {
    // Return just the first name for compact displays
    return profile.full_name.split(' ')[0]
  }
  if (profile.email) {
    return profile.email.split('@')[0]
  }
  return 'Unknown'
}

/**
 * Returns the full display name for a user profile.
 */
export function fullDisplayName(profile: {
  full_name?: string | null
  email?: string | null
} | null | undefined): string {
  if (!profile) return 'Unknown'
  if (profile.full_name) return profile.full_name
  if (profile.email) return profile.email
  return 'Unknown'
}
