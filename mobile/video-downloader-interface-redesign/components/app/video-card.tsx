'use client'

import { useState } from 'react'
import { Download, Heart, Play, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArchiveVideo } from '@/lib/data'
import { PlatformBadge } from './primitives'

export function VideoCard({
  video,
  isFavorite,
  onToggleFavorite,
  onDelete,
}: {
  video: ArchiveVideo
  isFavorite: boolean
  onToggleFavorite: () => void
  onDelete?: () => void
}) {
  const [imgError, setImgError] = useState(false)

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-black/50">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black/60">
        {!imgError && video.thumb ? (
          <img
            src={video.thumb}
            alt={video.name}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#141418] text-muted-foreground">
            <Play className="size-8 opacity-40" />
            <span className="font-mono text-[10px] text-muted-foreground/60">Önizleme</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-transparent to-background/40" />

        <div className="absolute inset-x-3 top-3 flex items-center justify-between z-10">
          <PlatformBadge platform={video.platform} className="bg-background/80 backdrop-blur-md" />
          <div className="flex items-center gap-1.5">
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                title="Videoyu sil"
                className="flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground backdrop-blur-md transition-colors hover:border-destructive hover:bg-destructive/20 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite()
              }}
              aria-pressed={isFavorite}
              title={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              className={cn(
                'flex size-8 items-center justify-center rounded-full border backdrop-blur-md transition-colors',
                isFavorite
                  ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_12px_var(--primary)]'
                  : 'border-border/60 bg-background/80 text-foreground hover:text-primary',
              )}
            >
              <Heart className={cn('size-3.5', isFavorite && 'fill-current')} />
            </button>
          </div>
        </div>

        <button
          type="button"
          className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-[0_0_24px_var(--primary)] transition-all duration-300 group-hover:opacity-100 group-hover:scale-110 focus-visible:opacity-100"
        >
          <Play className="ml-0.5 size-5 fill-current" />
          <span className="sr-only">{video.name} oynat</span>
        </button>

        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between font-mono text-[11px] z-10">
          <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-foreground/80 backdrop-blur-md">
            {video.duration || 'Video'}
          </span>
          <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-medium text-foreground/90 backdrop-blur-md">
            {video.size}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-sm font-medium text-foreground" title={video.name}>
            {video.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {video.author || 'Genel'} {video.date ? `· ${video.date}` : ''}
          </p>
        </div>
        <a
          href={video.path || `/downloads/${video.platform}/${video.name}`}
          download={video.name}
          onClick={(e) => e.stopPropagation()}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
          title="İndir"
        >
          <Download className="size-3.5" />
        </a>
      </div>
    </article>
  )
}
