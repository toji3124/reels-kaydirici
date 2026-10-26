'use client'

import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Heart, Search, Trash2, Play, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, PageHeader, TextInput } from '../primitives'

type FavVideo = {
  id: string
  url: string
  originalUrl?: string
  title: string
  thumbnail?: string
  author?: string
  date?: string
  duration?: number
}

const FAVORITES_STORAGE_KEY = 'video_pro_favorites_v1'

export function FavoritesView({
  favorites,
  onToggleFavorite,
  onClear,
  onBrowse,
}: {
  favorites: Set<string>
  onToggleFavorite: (id: string) => void
  onClear: () => void
  onBrowse: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState('')
  const [favList, setFavList] = useState<FavVideo[]>([])
  const [modalVideo, setModalVideo] = useState<{ url: string; title: string } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (modalVideo) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [modalVideo])

  const loadFavorites = () => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
      if (stored) {
        setFavList(JSON.parse(stored))
      } else {
        setFavList([])
      }
    } catch {
      setFavList([])
    }
  }

  useEffect(() => {
    loadFavorites()
  }, [favorites])

  const handleRemove = (videoUrl: string) => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
      const current: FavVideo[] = stored ? JSON.parse(stored) : []
      const updated = current.filter((v) => (v.originalUrl || v.url) !== videoUrl && v.id !== videoUrl)
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated))
      setFavList(updated)
      onToggleFavorite(videoUrl)
    } catch {}
  }

  const handleClearAll = () => {
    if (confirm('Tüm favori videolar silinsin mi?')) {
      localStorage.removeItem(FAVORITES_STORAGE_KEY)
      setFavList([])
      onClear()
    }
  }

  const items = useMemo(() => {
    const q = query.toLowerCase()
    return favList.filter(
      (v) => (v.title && v.title.toLowerCase().includes(q)) || (v.author && v.author.toLowerCase().includes(q))
    )
  }, [favList, query])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="07 — Kütüphane"
        title="Favori Videolar"
        description={`${favList.length} video kaydedildi. X veya Arşivdeki kalp ikonuyla yenilerini ekleyebilirsin.`}
        actions={
          <Button
            variant="destructive"
            size="lg"
            className="h-10 px-4"
            onClick={handleClearAll}
            disabled={!favList.length}
          >
            <Trash2 data-icon="inline-start" />
            Tümünü temizle
          </Button>
        }
      />

      <div className="relative md:w-80">
        <label htmlFor="fav-search" className="sr-only">
          Favorilerde ara
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <TextInput
          id="fav-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Başlık veya kullanıcı ara"
          className="pl-11"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Heart />}
          title={favList.length ? 'Eşleşen favori yok' : 'Henüz favori video yok'}
          description="X görüntüleyicideki veya arşivdeki videolarda kalp butonuna tıklayarak buraya kaydedebilirsin."
        >
          <Button variant="outline" size="lg" className="mt-2 h-10 px-4" onClick={onBrowse}>
            Arşive göz at
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {items.map((v) => {
            const videoUrl = v.originalUrl || v.url
            return (
              <article
                key={v.id || videoUrl}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-foreground/20"
              >
                <div
                  className="relative aspect-video w-full overflow-hidden bg-black/90 cursor-pointer"
                  onClick={() => setModalVideo({ url: videoUrl, title: v.title })}
                >
                  <img
                    src={v.thumbnail || ''}
                    alt={v.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/15 transition-colors">
                    <div className="flex size-11 items-center justify-center rounded-full bg-black/70 text-white border border-white/40 shadow-lg group-hover:scale-110 group-hover:bg-primary group-hover:border-primary transition-all">
                      <Play className="ml-0.5 size-5 fill-current" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemove(videoUrl)
                    }}
                    className="absolute top-2.5 right-2.5 z-10 flex size-8 items-center justify-center rounded-full border border-red-500/60 bg-red-500/20 text-red-500 backdrop-blur-md hover:bg-red-500/30"
                    title="Favorilerden Çıkar"
                  >
                    <Heart className="size-4 fill-current" />
                  </button>
                </div>

                <div className="flex flex-1 flex-col justify-between p-3.5 gap-3 bg-[#111217]">
                  <div className="flex flex-col gap-1">
                    <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-foreground/90" title={v.title}>
                      {v.title || 'Favori Video'}
                    </h3>
                    <span className="text-[11px] text-muted-foreground">@{v.author || 'Video'}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs font-medium"
                      onClick={() => setModalVideo({ url: videoUrl, title: v.title })}
                    >
                      <Play className="size-3.5 fill-current" />
                      İzle
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => handleRemove(videoUrl)}
                      title="Sil"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Video Modal Player (Sesi Açık - createPortal ile tam ortada) */}
      {mounted && modalVideo && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 backdrop-blur-md"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(12px)',
          }}
          onClick={() => setModalVideo(null)}
        >
          <div
            className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-[#0f1015] shadow-2xl"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 bg-[#14151b]">
              <span className="truncate pr-4 text-sm font-semibold text-foreground">
                {modalVideo.title}
              </span>
              <button
                type="button"
                onClick={() => setModalVideo(null)}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="relative flex items-center justify-center bg-black min-h-[300px] max-h-[75vh] overflow-hidden">
              <video
                src={modalVideo.url}
                controls
                autoPlay
                playsInline
                className="max-h-[75vh] w-full object-contain"
                ref={(el) => {
                  if (el) {
                    el.muted = false
                    el.volume = 1.0
                  }
                }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
