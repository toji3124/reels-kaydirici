'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  FolderOpen,
  Heart,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ArchiveVideo, Platform } from '@/lib/data'
import { PlatformBadge } from '../primitives'

const filters: { id: Platform | 'all'; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'x', label: 'X / Twitter' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
]

function formatTime(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function VideoPlayerView({
  favorites,
  onToggleFavorite,
  initialVideoPath,
}: {
  favorites: Set<string>
  onToggleFavorite: (id: string) => void
  initialVideoPath?: string | null
}) {
  const [videos, setVideos] = useState<ArchiveVideo[]>([])
  const [filter, setFilter] = useState<Platform | 'all'>('all')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('contain')
  const [isLoading, setIsLoading] = useState(true)
  const [showCenterIcon, setShowCenterIcon] = useState<'play' | 'pause' | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const iconTimer = useRef<NodeJS.Timeout | null>(null)

  const fetchVideos = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/files')
      const data = await res.json()
      if (Array.isArray(data.files) && data.files.length > 0) {
        const mapped: ArchiveVideo[] = data.files.map((f: any, i: number) => ({
          id: `file_${i}_${f.name}`,
          name: f.name,
          platform: (f.platform === 'twitter' ? 'x' : f.platform) as Platform || 'tiktok',
          author: f.uploader || 'Genel',
          size: f.size ? (f.size / (1024 * 1024)).toFixed(1) + ' MB' : '',
          duration: '',
          date: f.date ? new Date(f.date).toLocaleDateString('tr-TR') : '',
          thumb: f.thumbnail || `/api/thumbnail/${f.platform}/${f.name}`,
          path: f.path || `/downloads/${f.platform}/${f.name}`,
        }))
        setVideos(mapped)

        if (initialVideoPath) {
          const foundIdx = mapped.findIndex((v) => v.path === initialVideoPath)
          if (foundIdx !== -1) setCurrentIndex(foundIdx)
        }
      } else {
        setVideos([])
      }
    } catch {
      setVideos([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchVideos()
  }, [])

  const filteredVideos = useMemo(() => {
    return videos.filter(
      (v) => filter === 'all' || v.platform === filter || (filter === 'x' && (v.platform as string) === 'twitter'),
    )
  }, [videos, filter])

  const currentVideo = filteredVideos[currentIndex] || null

  // Ensure index stays valid on filter change
  useEffect(() => {
    if (currentIndex >= filteredVideos.length) {
      setCurrentIndex(Math.max(0, filteredVideos.length - 1))
    }
  }, [filteredVideos.length, currentIndex])

  const handleNext = useCallback(() => {
    if (filteredVideos.length === 0) return
    setCurrentIndex((prev) => (prev + 1) % filteredVideos.length)
  }, [filteredVideos.length])

  const handlePrev = useCallback(() => {
    if (filteredVideos.length === 0) return
    setCurrentIndex((prev) => (prev - 1 + filteredVideos.length) % filteredVideos.length)
  }, [filteredVideos.length])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
      setIsPlaying(true)
      triggerCenterIcon('play')
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
      triggerCenterIcon('pause')
    }
  }

  const triggerCenterIcon = (type: 'play' | 'pause') => {
    if (iconTimer.current) clearTimeout(iconTimer.current)
    setShowCenterIcon(type)
    iconTimer.current = setTimeout(() => setShowCenterIcon(null), 500)
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    const nextMute = !isMuted
    videoRef.current.muted = nextMute
    videoRef.current.volume = nextMute ? 0 : 1.0
    setIsMuted(nextMute)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'm') {
        e.preventDefault()
        toggleMute()
      } else if (e.key === 'f') {
        e.preventDefault()
        setObjectFit((prev) => (prev === 'contain' ? 'cover' : 'contain'))
      } else if (e.key === 'ArrowLeft' && videoRef.current) {
        e.preventDefault()
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
      } else if (e.key === 'ArrowRight' && videoRef.current) {
        e.preventDefault()
        videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 5)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrev, isMuted])

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-5rem)] max-w-7xl mx-auto">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card/70 p-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFilter(f.id)
                  setCurrentIndex(0)
                }}
                className={cn(
                  'h-8 rounded-lg px-3 text-xs font-medium transition-colors',
                  filter === f.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground font-mono pl-2">
            {filteredVideos.length > 0 ? `${currentIndex + 1} / ${filteredVideos.length}` : '0 video'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetch('/api/open-folder')}
            title="İndirilenler klasörünü aç"
            className="h-8 text-xs"
          >
            <FolderOpen data-icon="inline-start" className="size-3.5" />
            Klasör
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchVideos}
            disabled={isLoading}
            className="h-8 text-xs"
          >
            <RefreshCw data-icon="inline-start" className={cn('size-3.5', isLoading && 'animate-spin')} />
            Yenile
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <RefreshCw className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Oynatıcı hazırlanıyor...</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-card/40 p-8 text-center">
          <Play className="size-12 text-muted-foreground/40 mb-3" />
          <h2 className="text-lg font-semibold">Oynatılacak video bulunamadı</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Arşivde henüz video yok veya seçilen platformda kayıt bulunmuyor. URL İndirici veya X/Twitter üzerinden video indirebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* Main Player Area */}
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-black shadow-2xl">
            {/* Video Viewport */}
            <div
              className="relative flex flex-1 items-center justify-center overflow-hidden cursor-pointer select-none"
              onClick={togglePlay}
            >
              {currentVideo && (
                <video
                  ref={(el) => {
                    videoRef.current = el
                    if (el) {
                      el.muted = isMuted
                      el.volume = isMuted ? 0 : 1.0
                    }
                  }}
                  key={currentVideo.path}
                  src={`${currentVideo.path}?v=${encodeURIComponent(currentVideo.name)}`}
                  autoPlay
                  playsInline
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime)
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration)
                      videoRef.current.muted = isMuted
                      videoRef.current.volume = isMuted ? 0 : 1.0
                      videoRef.current.play().catch(() => {})
                      setIsPlaying(true)
                    }
                  }}
                  onEnded={handleNext}
                  className="h-full w-full"
                  style={{
                    objectFit: objectFit,
                    maxHeight: '100%',
                    maxWidth: '100%',
                  }}
                />
              )}

              {/* Center Play/Pause Flash Indicator */}
              {showCenterIcon && (
                <div className="pointer-events-none absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md animate-fade-in">
                  {showCenterIcon === 'play' ? (
                    <Play className="ml-1 size-10 fill-current" />
                  ) : (
                    <Pause className="size-10 fill-current" />
                  )}
                </div>
              )}

              {/* Top Gradient Badge Overlay */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent">
                {currentVideo && (
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={currentVideo.platform} className="bg-black/80 backdrop-blur-md" />
                    <span className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-xs text-white/90 backdrop-blur-md">
                      {currentVideo.author}
                    </span>
                  </div>
                )}
                <div className="pointer-events-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setObjectFit((prev) => (prev === 'contain' ? 'cover' : 'contain'))
                    }}
                    title={objectFit === 'contain' ? 'Ekrana Doldur' : 'Tamamını Sığdır'}
                    className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md hover:bg-white/20"
                  >
                    {objectFit === 'contain' ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleMute()
                    }}
                    title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full border backdrop-blur-md transition-colors',
                      isMuted
                        ? 'border-destructive bg-destructive/30 text-destructive'
                        : 'border-white/20 bg-black/60 text-white hover:bg-white/20',
                    )}
                  >
                    {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Side Floating Action Buttons */}
              <div className="absolute right-4 bottom-24 flex flex-col items-center gap-3 z-20">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePrev()
                  }}
                  title="Önceki Video (Yukarı Ok)"
                  className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white backdrop-blur-md shadow-lg transition-transform hover:scale-110 active:scale-95"
                >
                  <ChevronUp className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleNext()
                  }}
                  title="Sonraki Video (Aşağı Ok)"
                  className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white backdrop-blur-md shadow-lg transition-transform hover:scale-110 active:scale-95"
                >
                  <ChevronDown className="size-5" />
                </button>
                {currentVideo && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite(currentVideo.path || currentVideo.id)
                      }}
                      title="Favorile"
                      className={cn(
                        'flex size-11 items-center justify-center rounded-full border backdrop-blur-md shadow-lg transition-transform hover:scale-110 active:scale-95',
                        favorites.has(currentVideo.path || currentVideo.id)
                          ? 'border-primary bg-primary text-white shadow-[0_0_15px_var(--primary)]'
                          : 'border-white/20 bg-black/70 text-white hover:text-primary',
                      )}
                    >
                      <Heart
                        className={cn(
                          'size-5',
                          favorites.has(currentVideo.path || currentVideo.id) && 'fill-current',
                        )}
                      />
                    </button>
                    <a
                      href={currentVideo.path}
                      download={currentVideo.name}
                      onClick={(e) => e.stopPropagation()}
                      title="Bilgisayara İndir"
                      className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white backdrop-blur-md shadow-lg transition-transform hover:scale-110 active:scale-95 hover:text-success"
                    >
                      <Download className="size-5" />
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Bottom Scrubber & Metadata Bar */}
            <div className="flex flex-col border-t border-border/40 bg-[#0d0d11] p-3 gap-2">
              {/* Progress Scrubber */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="text-foreground hover:text-primary transition-colors"
                >
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <div
                  className="relative flex-1 h-2 bg-white/10 rounded-full cursor-pointer overflow-hidden group"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const clickX = e.clientX - rect.left
                    const pct = Math.max(0, Math.min(1, clickX / rect.width))
                    if (videoRef.current && duration > 0) {
                      videoRef.current.currentTime = pct * duration
                    }
                  }}
                >
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Video Title & Author */}
              {currentVideo && (
                <div className="flex items-center justify-between gap-4 text-xs">
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium text-foreground" title={currentVideo.name}>
                      {currentVideo.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {currentVideo.author} {currentVideo.size ? `· ${currentVideo.size}` : ''} {currentVideo.date ? `· ${currentVideo.date}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                      ↑↓ Geçiş | Boşluk: Oynat | M: Ses
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Side Playlist Strip (Desktop) */}
          <div className="hidden lg:flex flex-col w-72 shrink-0 rounded-2xl border border-border bg-card/60 p-3 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <span className="text-xs font-semibold text-foreground">Oynatma Listesi</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {filteredVideos.length} Video
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto pt-2 scrollbar-thin">
              {filteredVideos.map((v, idx) => {
                const isSelected = idx === currentIndex
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border p-2 text-left transition-all duration-200',
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border/40 hover:border-border hover:bg-card/80',
                    )}
                  >
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-black">
                      <img
                        src={v.thumb}
                        alt={v.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Play className="size-4 text-primary fill-current" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col min-w-0">
                      <span className="truncate text-xs font-medium text-foreground">
                        {v.name}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground font-mono">
                        {v.author} {v.size ? `· ${v.size}` : ''}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
