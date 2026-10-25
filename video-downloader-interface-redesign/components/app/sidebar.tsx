'use client'

import { useState, useEffect, type ReactNode } from 'react'
import {
  Bookmark,
  Clapperboard,
  Compass,
  Cookie,
  Download,
  FolderDown,
  Heart,
  Link2,
  QrCode,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ViewId } from '@/lib/data'
import { XLogo } from './primitives'

type NavItem = { id: ViewId; label: string; icon: ReactNode; count?: number }

export function Sidebar({
  active,
  onNavigate,
  poolCount,
  favoriteCount,
  onOpenCookies,
  onOpenQr,
}: {
  active: ViewId
  onNavigate: (id: ViewId) => void
  poolCount: number
  favoriteCount: number
  onOpenCookies?: () => void
  onOpenQr?: () => void
}) {
  const [storage, setStorage] = useState<{
    usedFormatted: string
    maxFormatted: string
    percent: number
  }>({
    usedFormatted: '0 GB',
    maxFormatted: '100 GB',
    percent: 1,
  })

  useEffect(() => {
    const fetchStorage = async () => {
      try {
        const res = await fetch('/api/storage')
        const data = await res.json()
        if (data.success) {
          setStorage({
            usedFormatted: data.usedFormatted,
            maxFormatted: data.maxFormatted,
            percent: data.percent,
          })
        }
      } catch {}
    }
    fetchStorage()
    const interval = setInterval(fetchStorage, 8000)
    return () => clearInterval(interval)
  }, [])

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: 'İndir',
      items: [
        { id: 'url', label: 'URL İndirici', icon: <Link2 /> },
        { id: 'profile', label: 'Profil Tarayıcı', icon: <UserRound /> },
        { id: 'explore', label: 'Keşfet Modu', icon: <Compass /> },
        { id: 'twitter', label: 'X / Twitter', icon: <XLogo className="size-3.5" /> },
      ],
    },
    {
      label: 'Kütüphane',
      items: [
        { id: 'player', label: 'Video Oynatıcı', icon: <Clapperboard /> },
        { id: 'archive', label: 'Arşiv', icon: <FolderDown /> },
        { id: 'favorites', label: 'Favoriler', icon: <Heart />, count: favoriteCount },
        { id: 'pool', label: 'Link Havuzu', icon: <Bookmark />, count: poolCount },
      ],
    },
  ]

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 px-2 pt-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_var(--primary)]">
          <Download className="size-4" strokeWidth={2.5} />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold tracking-tight text-foreground">Video Pro</span>
          <span className="text-xs text-muted-foreground">İndirme yöneticisi</span>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2.5 shadow-sm">
        <span className="text-xs text-muted-foreground">Oturumlar</span>
        <div className="flex items-center gap-1.5">
          {(['IG', 'TT', 'YT', 'X'] as const).map((p) => (
            <span
              key={p}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground"
            >
              <span aria-hidden className="pulse-dot size-1.5 rounded-full bg-success" />
              {p}
            </span>
          ))}
        </div>
      </div>

      <nav aria-label="Ana menü" className="flex flex-1 flex-col gap-6 overflow-y-auto scrollbar-thin">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 font-medium">
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = item.id === active
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-300 [&_svg]:size-4',
                    isActive
                      ? 'bg-primary/15 text-primary border border-primary/25 shadow-sm'
                      : 'text-muted-foreground hover:translate-x-0.5 hover:bg-card/80 hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                      isActive ? 'scale-y-100' : 'scale-y-0',
                    )}
                  />
                  <span
                    className={cn(
                      'flex items-center transition-all duration-300',
                      isActive ? 'scale-110 text-primary' : 'group-hover:text-foreground',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={cn(
                        'min-w-6 rounded-md px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                      )}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-border bg-card/60 p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">Depolama</span>
            <span className="font-mono text-foreground font-semibold">
              {storage.usedFormatted} / {storage.maxFormatted}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="shine h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-500"
              style={{ width: `${Math.max(4, storage.percent)}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ToolButton icon={<Cookie />} label="Cookie" onClick={onOpenCookies} />
          <ToolButton icon={<QrCode />} label="QR Bağlan" onClick={onOpenQr} />
          <ToolButton icon={<Clapperboard />} label="Oynatıcı" onClick={() => onNavigate('player')} />
        </div>
      </div>
    </div>
  )
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/70 px-2 py-2.5 text-[11px] font-medium text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-foreground active:translate-y-0 [&_svg]:size-4 [&_svg]:transition-transform hover:[&_svg]:scale-110 shadow-sm"
    >
      {icon}
      {label}
    </button>
  )
}
