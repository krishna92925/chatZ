import type { Profile } from '@shared/types'
import { useMe } from '@/features/chat/queries'

/** The signed-in person's profile. Only used inside routes that already require one. */
export function useProfile(): Profile {
  const { data } = useMe()
  if (!data?.profile) throw new Error('useProfile used before the profile exists')
  return data.profile
}
