'use client'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronLeft, ChevronRight, FolderOpen, Play, RefreshCw, Search, Trash2, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ArchiveVideo, Platform } from '@/lib/data'
import { EmptyState, PageHeader, TextInput } from '../primitives'
import { VideoCard } from '../video-card'

const filters: { id: Platform | 'all'; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'x', label: 'X / Twitter' },
  { id: 'youtube', label: 'YouTube' },
]

function formatBytes(bytes: number | string) {
  if (typeof bytes === 'string' && (bytes.includes('MB') || bytes.includes('KB') || bytes.includes('GB'))) return bytes
  const n = typeof bytes === 'number' ? bytes : Number(bytes)
  if (isNaN(n) || n <= 0) return ''
  if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}

export function ArchiveView({
  favorites,
  onToggleFavorite,
  onOpenPlayer,
}: {
  favorites: Set<string>
  onToggleFavorite: (id: string) => void
  onOpenPlayer?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Platform | 'all'>('all')
  const [activePlayVideo, setActivePlayVideo] = useState<ArchiveVideo | null>(null)
  const [realVideos, setRealVideos] = useState<ArchiveVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (activePlayVideo) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [activePlayVideo])

  const fetchVideos = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/files')
      const data = await res.json()
      if (Array.isArray(data.files)) {
        const mapped: ArchiveVideo[] = data.files.map((f: any, i: number) => ({
          id: `file_${i}_${f.name}`,
          name: f.name,
          platform: (f.platform === 'twitter' ? 'x' : f.platform) as Platform || 'tiktok',
          author: f.uploader || 'Genel',
          size: formatBytes(f.size),
          duration: '',
          date: f.date ? new Date(f.date).toLocaleDateString('tr-TR') : '',
          thumb: f.thumbnail || `/api/thumbnail/${f.platform}/${f.name}`,
          path: f.path || `/downloads/${f.platform}/${f.name}`,
        }))
        setRealVideos(mapped)
      } else {
        setRealVideos([])
      }
    } catch {
      setRealVideos([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchVideos()
  }, [])

  const handleDeleteVideo = async (video: ArchiveVideo) => {
    if (!confirm(`"${video.name}" dosyasını silmek istediğine emin misin?`)) return
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: video.path, name: video.name, platform: video.platform }),
      })
      const data = await res.json()
      if (data.success) {
        setRealVideos((prev) => prev.filter((v) => v.id !== video.id))
      } else {
        alert(data.error || 'Dosya silinemedi')
      }
    } catch (e: any) {
      alert(e.message || 'Silme işlemi başarısız')
    }
  }

  const platformCounts = useMemo(() => {
    const c: Record<string, number> = {
      all: realVideos.length,
      tiktok: 0,
      instagram: 0,
      x: 0,
      youtube: 0,
    }
    realVideos.forEach((v) => {
      const p = (v.platform === 'twitter' ? 'x' : v.platform) as string
      if (c[p] !== undefined) c[p]++
      else c[p] = 1
    })
    return c
  }, [realVideos])

  const handleDeletePlatform = async (targetPlatform: string, label: string) => {
    const targetKey = targetPlatform === 'twitter' ? 'x' : targetPlatform
    const count = platformCounts[targetKey] || 0
    if (count === 0) {
      alert(`${label} kategorisinde kayıtlı video bulunamadı.`)
      return
    }
    const confirmed = confirm(
      `Sadece ${label} kategorisindeki ${count} videoyu silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz.`
    )
    if (!confirmed) return

    setIsDeletingAll(true)
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: targetPlatform }),
      })
      const data = await res.json()
      if (data.success) {
        setRealVideos((prev) =>
          prev.filter((v) => {
            const p = v.platform === 'twitter' ? 'x' : v.platform
            return p !== targetKey
          })
        )
        setActivePlayVideo(null)
      } else {
        alert(data.error || `${label} videoları silinemedi`)
      }
    } catch (e: any) {
      alert(e.message || 'Silme işlemi başarısız')
    } finally {
      setIsDeletingAll(false)
      fetchVideos()
    }
  }

  const handleDeleteAllVideos = async () => {
    if (realVideos.length === 0) return
    const confirmed = confirm(
      `Arşivdeki ${realVideos.length} videonun TÜMÜ kalıcı olarak silinecektir.\n\nEmin misiniz?`
    )
    if (!confirmed) return

    setIsDeletingAll(true)
    try {
      const res = await fetch('/api/files/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const data = await res.json()
      if (data.success) {
        setRealVideos([])
        setActivePlayVideo(null)
      } else {
        alert(data.error || 'Videolar silinemedi')
      }
    } catch (e: any) {
      alert(e.message || 'Silme işlemi başarısız')
    } finally {
      setIsDeletingAll(false)
      fetchVideos()
    }
  }

  const videos = useMemo(() => {
    const q = query.toLowerCase()
    return realVideos.filter(
      (v) =>
        (filter === 'all' || v.platform === filter || (filter === 'x' && (v.platform as string) === 'twitter')) &&
        (v.name.toLowerCase().includes(q) || v.author.toLowerCase().includes(q)),
    )
  }, [realVideos, query, filter])

  const currentModalIndex = activePlayVideo
    ? videos.findIndex((v) => v.id === activePlayVideo.id)
    : -1

  const handleModalNext = () => {
    if (videos.length === 0 || currentModalIndex === -1) return
    const nextIdx = (currentModalIndex + 1) % videos.length
    setActivePlayVideo(videos[nextIdx])
  }

  const handleModalPrev = () => {
    if (videos.length === 0 || currentModalIndex === -1) return
    const prevIdx = (currentModalIndex - 1 + videos.length) % videos.length
    setActivePlayVideo(videos[prevIdx])
  }

  useEffect(() => {
    if (!activePlayVideo) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleModalNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleModalPrev()
      } else if (e.key === 'Escape') {
        setActivePlayVideo(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePlayVideo, currentModalIndex, videos])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="05 — Kütüphane"
        title="Video Arşivi"
        description={
          <div className="flex flex-col gap-2.5">
            <span>İndirilenler klasöründe kayıtlı <strong>{realVideos.length}</strong> gerçek video. Platform bazlı sayıları inceleyebilir, istediğin platformu tek tıkla silebilirsin.</span>
            {/* Gerçek Zamanlı Platform İstatistik Sayaçları */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs text-foreground font-medium shadow-xs">
                <span className="size-2 rounded-full bg-primary" />
                Toplam: <strong className="font-mono text-primary font-bold">{realVideos.length}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs text-foreground font-medium shadow-xs">
                <span className="size-2 rounded-full bg-[#00f2fe]" />
                TikTok: <strong className="font-mono text-[#00f2fe] font-bold">{platformCounts.tiktok || 0}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs text-foreground font-medium shadow-xs">
                <span className="size-2 rounded-full bg-[#e1306c]" />
                Instagram: <strong className="font-mono text-[#e1306c] font-bold">{platformCounts.instagram || 0}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs text-foreground font-medium shadow-xs">
                <span className="size-2 rounded-full bg-[#1d9bf0]" />
                X / Twitter: <strong className="font-mono text-[#1d9bf0] font-bold">{platformCounts.x || 0}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs text-foreground font-medium shadow-xs">
                <span className="size-2 rounded-full bg-[#ff0000]" />
                YouTube: <strong className="font-mono text-[#ff0000] font-bold">{platformCounts.youtube || 0}</strong>
              </span>
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {onOpenPlayer && (
              <Button
                variant="default"
                size="lg"
                className="h-10 px-4 bg-primary text-primary-foreground shadow-sm"
                onClick={onOpenPlayer}
                title="Tam ekran TikTok/Reels video oynatıcıyı aç"
              >
                <Play data-icon="inline-start" className="fill-current" />
                Oynatıcıda İzle
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              className="h-10 px-4"
              onClick={() => fetch('/api/open-folder')}
              title="İndirilenler klasörünü Windows Gezgini'nde aç"
            >
              <FolderOpen data-icon="inline-start" />
              Klasörü aç
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-10 px-4"
              onClick={fetchVideos}
              disabled={isLoading || isDeletingAll}
            >
              <RefreshCw data-icon="inline-start" className={cn(isLoading && 'animate-spin')} />
              Yenile
            </Button>

            {/* Platforma Özel veya Tümünü Silme Aksiyon Menüsü */}
            {realVideos.length > 0 && (
              <div className="relative inline-block">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 px-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive shadow-sm transition-colors flex items-center gap-1.5"
                  onClick={() => setShowDeleteMenu((prev) => !prev)}
                  disabled={isDeletingAll || isLoading}
                  title="Silme seçenekleri"
                >
                  <Trash2 data-icon="inline-start" className={cn(isDeletingAll && 'animate-spin size-4')} />
                  <span>
                    {isDeletingAll
                      ? 'Siliniyor...'
                      : filter === 'all'
                      ? `Tümünü Sil (${realVideos.length})`
                      : filter === 'tiktok'
                      ? `Sadece TikTok'u Sil (${platformCounts.tiktok || 0})`
                      : filter === 'instagram'
                      ? `Sadece Instagram'ı Sil (${platformCounts.instagram || 0})`
                      : filter === 'x'
                      ? `Sadece X'i Sil (${platformCounts.x || 0})`
                      : `Sadece YouTube'u Sil (${platformCounts.youtube || 0})`}
                  </span>
                  <ChevronDown className="size-3.5 opacity-70 ml-0.5" />
                </Button>

                {/* Silme Seçenekleri Dropdown Menüsü */}
                {showDeleteMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowDeleteMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-[#121217] p-2 shadow-2xl z-50 flex flex-col gap-1 backdrop-blur-xl animate-fade-in">
                      <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40 mb-1">
                        Silme Seçenekleri
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteMenu(false)
                          handleDeleteAllVideos()
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 text-xs rounded-lg text-destructive hover:bg-destructive/15 font-semibold transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <Trash2 className="size-3.5" />
                          Tümünü Sil
                        </span>
                        <span className="font-mono text-[11px] bg-destructive/20 px-2 py-0.5 rounded font-bold">
                          {realVideos.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteMenu(false)
                          handleDeletePlatform('tiktok', 'TikTok')
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 text-xs rounded-lg text-foreground hover:bg-white/10 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-[#00f2fe]" />
                          Sadece TikTok'u Sil
                        </span>
                        <span className="font-mono text-[11px] text-[#00f2fe] bg-card px-2 py-0.5 rounded border border-border font-bold">
                          {platformCounts.tiktok || 0}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteMenu(false)
                          handleDeletePlatform('instagram', 'Instagram')
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 text-xs rounded-lg text-foreground hover:bg-white/10 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-[#e1306c]" />
                          Sadece Instagram'ı Sil
                        </span>
                        <span className="font-mono text-[11px] text-[#e1306c] bg-card px-2 py-0.5 rounded border border-border font-bold">
                          {platformCounts.instagram || 0}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteMenu(false)
                          handleDeletePlatform('twitter', 'X / Twitter')
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 text-xs rounded-lg text-foreground hover:bg-white/10 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-[#1d9bf0]" />
                          Sadece X / Twitter'ı Sil
                        </span>
                        <span className="font-mono text-[11px] text-[#1d9bf0] bg-card px-2 py-0.5 rounded border border-border font-bold">
                          {platformCounts.x || 0}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteMenu(false)
                          handleDeletePlatform('youtube', 'YouTube')
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 text-xs rounded-lg text-foreground hover:bg-white/10 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-[#ff0000]" />
                          Sadece YouTube'u Sil
                        </span>
                        <span className="font-mono text-[11px] text-[#ff0000] bg-card px-2 py-0.5 rounded border border-border font-bold">
                          {platformCounts.youtube || 0}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <label htmlFor="archive-search" className="sr-only">
            Arşivde ara
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <TextInput
            id="archive-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Dosya adı veya kullanıcı ara"
            className="pl-11"
          />
        </div>

        {/* Filtre Sekmeleri & Her Platform İçin Canlı Video Sayıları */}
        <div className="inline-flex w-fit rounded-xl border border-border bg-card/60 p-1 flex-wrap">
          {filters.map((f) => {
            const count = platformCounts[f.id] ?? 0
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'h-9 rounded-lg px-3 text-xs font-medium transition-colors flex items-center gap-1.5',
                  filter === f.id
                    ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span>{f.label}</span>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold leading-none',
                    filter === f.id ? 'bg-black/35 text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="size-8 animate-spin text-primary mb-3" />
          <p className="text-sm">İndirilen videolar yükleniyor...</p>
        </div>
      ) : realVideos.length === 0 ? (
        <EmptyState
          icon={<Video className="size-6 text-primary" />}
          title="Henüz indirilmiş video yok"
          description="URL İndirici, Keşfet Modu veya X / Twitter üzerinden video indirdiğinde burada listelenecektir."
        >
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={() => fetch('/api/open-folder')}>
              <FolderOpen data-icon="inline-start" />
              Klasörü Aç
            </Button>
            <Button variant="outline" onClick={fetchVideos}>
              <RefreshCw data-icon="inline-start" />
              Yeniden Tara
            </Button>
          </div>
        </EmptyState>
      ) : videos.length === 0 ? (
        <EmptyState icon={<Search />} title="Sonuç bulunamadı" description="Aramanı ya da platform filtreni değiştirmeyi dene." />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {videos.map((v) => (
            <div key={v.id} onClick={() => setActivePlayVideo(v)} className="cursor-pointer">
              <VideoCard
                video={v}
                isFavorite={favorites.has(v.id) || (v.path ? favorites.has(v.path) : false)}
                onToggleFavorite={() => onToggleFavorite(v.path || v.id)}
                onDelete={() => handleDeleteVideo(v)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Video Oynatıcı Modal (Sesi Açık %100 - createPortal ile doğrudan viewport/ekranın tam ortasında) */}
      {mounted && activePlayVideo && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md animate-fade-in"
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
          onClick={() => setActivePlayVideo(null)}
        >
          <div
            className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-[#0d0d11] shadow-2xl"
            style={{
              maxHeight: '90vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5 bg-[#121217] shrink-0">
              <div className="flex flex-col min-w-0 pr-4">
                <span className="truncate text-sm font-semibold text-foreground">
                  {activePlayVideo.name}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {activePlayVideo.author} {activePlayVideo.size ? `· ${activePlayVideo.size}` : ''} {currentModalIndex !== -1 ? `(${currentModalIndex + 1} / ${videos.length})` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onOpenPlayer && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePlayVideo(null)
                      onOpenPlayer()
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    title="Tam ekran TikTok/Reels oynatıcıya geç"
                  >
                    <Play className="size-3.5 fill-current" />
                    <span className="hidden sm:inline">Tam Ekran Oynatıcı</span>
                  </button>
                )}
                <a
                  href={activePlayVideo.path || `/downloads/${activePlayVideo.platform}/${activePlayVideo.name}`}
                  download={activePlayVideo.name}
                  className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  title="Bilgisayara İndir"
                >
                  <FolderOpen className="size-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setActivePlayVideo(null)}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Video Container with Explicit Height */}
            <div
              className="relative flex items-center justify-center bg-black overflow-hidden select-none"
              style={{
                width: '100%',
                height: '70vh',
                minHeight: '380px',
                maxHeight: '75vh',
                position: 'relative',
              }}
            >
              <video
                key={activePlayVideo.path}
                src={`${activePlayVideo.path}?v=${encodeURIComponent(activePlayVideo.name)}`}
                controls
                autoPlay
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  margin: 'auto',
                }}
                ref={(el) => {
                  if (el) {
                    el.muted = false
                    el.volume = 1.0
                    el.play().catch(() => {})
                  }
                }}
              />

              {/* Prev / Next Modal Buttons */}
              {videos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleModalPrev()
                    }}
                    title="Önceki Video (Sol Ok)"
                    className="absolute left-3 top-1/2 -translate-y-1/2 flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md shadow-lg transition-transform hover:scale-110 active:scale-95 z-20 hover:bg-black/80"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleModalNext()
                    }}
                    title="Sonraki Video (Sağ Ok)"
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md shadow-lg transition-transform hover:scale-110 active:scale-95 z-20 hover:bg-black/80"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
