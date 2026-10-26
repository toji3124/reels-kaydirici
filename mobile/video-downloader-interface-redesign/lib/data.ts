export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'x'

export type ViewId =
  | 'url'
  | 'profile'
  | 'explore'
  | 'pool'
  | 'archive'
  | 'twitter'
  | 'favorites'
  | 'player'

export type PoolLink = {
  id: string
  url: string
  platform: Platform
  addedAt: string
}

export type ArchiveVideo = {
  id: string
  name: string
  platform: Platform
  author: string
  size: string
  duration: string
  date: string
  thumb: string
  path?: string
}

export const initialPool: PoolLink[] = []

export const archiveVideos: ArchiveVideo[] = []

export const platformMeta: Record<Platform, { label: string; short: string; dot: string }> = {
  instagram: { label: 'Instagram', short: 'IG', dot: 'bg-pink-400' },
  tiktok: { label: 'TikTok', short: 'TT', dot: 'bg-cyan-300' },
  youtube: { label: 'YouTube', short: 'YT', dot: 'bg-primary' },
  x: { label: 'X', short: 'X', dot: 'bg-foreground' },
}

export function detectPlatform(url: string): Platform | null {
  const u = url.toLowerCase()
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('twitter.com') || u.includes('x.com')) return 'x'
  return null
}
