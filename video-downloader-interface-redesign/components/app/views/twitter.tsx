'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  Download,
  Heart,
  Info,
  Play,
  RefreshCw,
  Search,
  Volume2,
  X,
  Copy,
  Check,
  Film
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, FieldLabel, PageHeader, Panel, SelectField, TextInput, XLogo } from '../primitives'

type TwitterVideo = {
  id: string
  url: string
  originalUrl: string
  title: string
  content?: string
  description?: string
  thumbnail: string
  duration?: number
  timestamp?: number | null
  view_count?: number
  like_count?: number
  author?: string
  username?: string
}

function normalizeSearchText(text: string): string {
  if (!text) return ''
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

export function TwitterView({
  favorites,
  onToggleFavorite,
  onOpenCookies,
}: {
  favorites?: Set<string>
  onToggleFavorite?: (video: any) => void
  onOpenCookies?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [username, setUsername] = useState('')
  const [limit, setLimit] = useState('all')
  const [directUrl, setDirectUrl] = useState('')
  const [isDirectDownloading, setIsDirectDownloading] = useState(false)
  const [directStatus, setDirectStatus] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [videos, setVideos] = useState<TwitterVideo[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination / Infinite scroll
  const [visibleCount, setVisibleCount] = useState(24)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Modal player state
  const [modalVideo, setModalVideo] = useState<{
    url: string
    proxyUrl: string
    title: string
  } | null>(null)

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

  // Downloading items map
  const [downloadingMap, setDownloadingMap] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Fetch videos for user
  const handleFetchVideos = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const cleanUser = username.trim().replace(/^@/, '').replace(/^https?:\/\/(x|twitter)\.com\//, '')
    if (!cleanUser) return

    setIsLoading(true)
    setError(null)
    setVisibleCount(24)

    try {
      const res = await fetch(`/api/twitter/fetch-videos?username=${encodeURIComponent(cleanUser)}&limit=${limit}`)
      const data = await res.json()

      if (data.success && Array.isArray(data.videos)) {
        setVideos(data.videos)
        if (data.videos.length === 0) {
          setError('Bu hesapta video bulunamadı.')
        }
      } else {
        setError(data.error || 'Videolar alınamadı. Cookie dosyanızın geçerli olduğundan emin olun.')
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası oluştu.')
    } finally {
      setIsLoading(false)
    }
  }

  // Tarayıcı Farklı Kaydet Seçicisi (SS'deki gibi Windows Dosya Kaydetme Penceresini Açar)
  const saveWithBrowserPicker = async (suggestedName: string, downloadCall: () => Promise<any>) => {
    let fileHandle: any = null
    let usingFilePicker = false

    // 1. Tıklama anında kullanıcı etkileşimi (transient activation) henüz tazeyken hemen Windows penceresini aç
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{
            description: 'MP4 Video Dosyası',
            accept: { 'video/mp4': ['.mp4'] }
          }]
        })
        usingFilePicker = true
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Kullanıcı "İptal" butonuna bastı
          return { cancelled: true }
        }
        // İzin verilmediyse fallback çalışsın
      }
    }

    // 2. Sunucuya indirme isteğini gönder
    const data = await downloadCall()
    if (!data || !data.success) {
      throw new Error(data?.error || 'Video indirilemedi')
    }

    const actualFilename = data.filename || suggestedName
    const fileUrl = data.path

    // 3. Eğer kullanıcı showSaveFilePicker ile yer seçtiyse, videoyu doğrudan o seçtiği dosyaya yaz!
    if (usingFilePicker && fileHandle) {
      const writable = await fileHandle.createWritable()
      const res = await fetch(fileUrl)
      if (res.body) {
        await res.body.pipeTo(writable)
      } else {
        const blob = await res.blob()
        await writable.write(blob)
        await writable.close()
      }
      return { success: true, filename: actualFilename, savedDirectly: true }
    }

    // 4. Fallback: Standart indirme (Kullanıcı tarayıcısında "Farklı Kaydet" sorulması için)
    const a = document.createElement('a')
    a.href = fileUrl
    a.download = actualFilename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return { success: true, filename: actualFilename, savedDirectly: false }
  }

  // Handle direct download
  const handleDirectDownload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!directUrl.trim()) return

    const targetUrl = directUrl.trim()
    setIsDirectDownloading(true)
    setDirectStatus('Kaydedilecek konumu seçin...')

    try {
      const defaultFilename = `twitter_${Date.now()}.mp4`
      const res = await saveWithBrowserPicker(defaultFilename, async () => {
        setDirectStatus('Video hazırlanıyor...')
        const response = await fetch('/api/twitter/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        })
        return await response.json()
      })

      if (res.cancelled) {
        setDirectStatus(null)
      } else if (res.success) {
        setDirectStatus('Seçtiğiniz klasöre başarıyla kaydedildi!')
        setDirectUrl('')
      }
    } catch (err: any) {
      setDirectStatus(`Hata: ${err.message}`)
    } finally {
      setIsDirectDownloading(false)
      setTimeout(() => setDirectStatus(null), 5000)
    }
  }

  // Handle individual card download
  const handleDownloadCard = async (video: TwitterVideo) => {
    const videoUrl = video.originalUrl || video.url
    setDownloadingMap((prev) => ({ ...prev, [video.id]: true }))

    try {
      const safeAuthor = (video.author || 'twitter').replace(/[^a-zA-Z0-9_-]/g, '')
      const defaultFilename = `twitter_${safeAuthor}_${video.id || Date.now()}.mp4`

      const res = await saveWithBrowserPicker(defaultFilename, async () => {
        const response = await fetch('/api/twitter/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: videoUrl }),
        })
        return await response.json()
      })

      if (res.cancelled) {
        // İptal edildi
      } else if (res.success) {
        alert('Video seçtiğiniz konuma başarıyla kaydedildi!')
      }
    } catch (err: any) {
      alert('Hata: ' + err.message)
    } finally {
      setDownloadingMap((prev) => ({ ...prev, [video.id]: false }))
    }
  }

  // Copy link
  const handleCopyLink = async (video: TwitterVideo) => {
    try {
      await navigator.clipboard.writeText(video.originalUrl || video.url)
      setCopiedId(video.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  // Filter videos
  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos
    const q = normalizeSearchText(searchQuery.trim())
    return videos.filter((v) => {
      const titleMatch = normalizeSearchText(v.title || '').includes(q)
      const authorMatch = normalizeSearchText(v.author || '').includes(q)
      const descMatch = normalizeSearchText(v.description || '').includes(q)
      return titleMatch || authorMatch || descMatch
    })
  }, [videos, searchQuery])

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 24, filteredVideos.length))
        }
      },
      { rootMargin: '400px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [filteredVideos.length])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="06 — Kaynak"
        title="X / Twitter Görüntüleyici"
        description="Hesapların medya arşivine göz at, videoları ara ve doğrudan indir."
        actions={
          <Button
            variant="outline"
            size="lg"
            className="h-10 px-4"
            onClick={() => handleFetchVideos()}
            disabled={isLoading}
          >
            <RefreshCw className={isLoading ? 'animate-spin' : ''} data-icon="inline-start" />
            Yenile
          </Button>
        }
      />

      <div
        role="note"
        className="flex flex-col gap-2 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-start gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium">Oturum gerekli.</span>{' '}
            <span className="text-muted-foreground">X, kullanıcı medyasına erişim için giriş yapılmasını istiyor.</span>
          </span>
        </p>
        <button
          type="button"
          onClick={onOpenCookies}
          className="inline-flex items-center gap-1 pl-7 text-sm font-medium text-primary hover:underline sm:pl-0"
        >
          {"Cookie'leri ayarla"}
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel icon={<XLogo className="size-3.5" />} title="Hesap arşivi" description="Kullanıcı adı veya profil linki gir.">
          <form className="flex flex-col gap-3" onSubmit={handleFetchVideos}>
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="x-user">Kullanıcı adı</FieldLabel>
              <TextInput
                id="x-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@kullanici veya x.com/kullanici"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-2">
                <FieldLabel htmlFor="x-limit">Video limiti</FieldLabel>
                <SelectField
                  id="x-limit"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                >
                  <option value="50">Son 50</option>
                  <option value="200">Son 200</option>
                  <option value="all">Tümü (sınırsız)</option>
                </SelectField>
              </div>
              <Button type="submit" size="lg" className="h-11 px-5" disabled={isLoading}>
                {isLoading ? 'Yükleniyor...' : 'Videoları yükle'}
              </Button>
            </div>
          </form>
        </Panel>

        <Panel icon={<Download />} title="Doğrudan link" description="Tek bir gönderinin videosunu hemen indir.">
          <form className="flex flex-col gap-3" onSubmit={handleDirectDownload}>
            <div className="flex flex-col gap-2">
              <FieldLabel htmlFor="x-direct">Gönderi linki</FieldLabel>
              <TextInput
                id="x-direct"
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                placeholder="https://x.com/.../status/..."
                className="font-mono text-[13px]"
              />
            </div>
            <div className="flex items-center justify-between">
              {directStatus && (
                <span className="text-xs text-muted-foreground">{directStatus}</span>
              )}
              <Button
                type="submit"
                size="lg"
                variant="outline"
                disabled={isDirectDownloading}
                className="h-11 border-success/40 px-5 text-success hover:bg-success/10 hover:text-success sm:self-end"
              >
                <Download data-icon="inline-start" />
                {isDirectDownloading ? 'İndiriliyor...' : 'İndir'}
              </Button>
            </div>
          </form>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <label htmlFor="x-search" className="sr-only">
              Videolarda ara
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <TextInput
              id="x-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Metin, tweet içeriği veya kullanıcı ara"
              className="pl-11"
            />
          </div>
          {videos.length > 0 && (
            <span className="font-mono text-xs text-muted-foreground">
              {filteredVideos.length} / {videos.length} video
            </span>
          )}
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="size-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <p className="mt-4 text-sm font-medium">Videolar taranıyor ve kapaklar hazırlanıyor...</p>
            <span className="text-xs text-muted-foreground mt-1">Bu işlem arşiv büyüklüğüne göre birkaç saniye sürebilir.</span>
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              icon={<XLogo className="size-5" />}
              title={videos.length === 0 ? 'Videolara göz atmak için bir hesap gir' : 'Aramanızla eşleşen video bulunamadı'}
              description={videos.length === 0 ? 'Örnek: @yalcdb, @verge, @mkbhd' : 'Arama teriminizi değiştirmeyi deneyebilirsiniz.'}
            />
          </div>
        ) : (
          <div className="mt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {filteredVideos.slice(0, visibleCount).map((video) => {
                const videoUrl = video.originalUrl || video.url
                const proxyUrl = `/api/twitter/proxy?url=${encodeURIComponent(videoUrl)}`
                const isFav = favorites?.has(video.id) || favorites?.has(videoUrl)
                const isDownloading = downloadingMap[video.id]

                return (
                  <TwitterCardItem
                    key={video.id}
                    video={video}
                    videoUrl={videoUrl}
                    proxyUrl={proxyUrl}
                    isFav={Boolean(isFav)}
                    isDownloading={Boolean(isDownloading)}
                    isCopied={copiedId === video.id}
                    onOpenModal={() =>
                      setModalVideo({
                        url: videoUrl,
                        proxyUrl: proxyUrl,
                        title: video.title || 'Twitter Video',
                      })
                    }
                    onDownload={() => handleDownloadCard(video)}
                    onToggleFav={() => onToggleFavorite && onToggleFavorite(video)}
                    onCopy={() => handleCopyLink(video)}
                  />
                )
              })}
            </div>

            {visibleCount < filteredVideos.length && (
              <div ref={sentinelRef} className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                <span className="mr-2 size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Daha fazla video yükleniyor...
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Modal Video Player with Sound (createPortal ile tam ortada) */}
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
                onError={(e) => {
                  const target = e.currentTarget
                  if (target.src !== modalVideo.proxyUrl) {
                    target.src = modalVideo.proxyUrl
                    target.play().catch(() => {})
                  }
                }}
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

function TwitterCardItem({
  video,
  videoUrl,
  proxyUrl,
  isFav,
  isDownloading,
  isCopied,
  onOpenModal,
  onDownload,
  onToggleFav,
  onCopy,
}: {
  video: TwitterVideo
  videoUrl: string
  proxyUrl: string
  isFav: boolean
  isDownloading: boolean
  isCopied: boolean
  onOpenModal: () => void
  onDownload: () => void
  onToggleFav: () => void
  onCopy: () => void
}) {
  const [isPlayingInline, setIsPlayingInline] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const hoverTimer = useRef<NodeJS.Timeout | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => {
      setIsZoomed(true)
    }, 1200)
  }

  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setIsZoomed(false)
  }

  const handleThumbnailClick = () => {
    if (!isPlayingInline) {
      setIsPlayingInline(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.muted = false
          videoRef.current.volume = 1.0
          videoRef.current.play().catch(() => {})
        }
      }, 50)
    } else {
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.muted = false
          videoRef.current.volume = 1.0
          videoRef.current.play().catch(() => {})
        } else {
          videoRef.current.pause()
        }
      }
    }
  }

  return (
    <article
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 ${
        isZoomed ? 'scale-105 z-30 shadow-2xl border-primary/50' : 'hover:border-foreground/20'
      }`}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black/90 cursor-pointer" onClick={handleThumbnailClick}>
        {isPlayingInline ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            autoPlay
            className="h-full w-full object-contain"
            onError={(e) => {
              const target = e.currentTarget
              if (target.src !== proxyUrl) {
                target.src = proxyUrl
                target.play().catch(() => {})
              }
            }}
          />
        ) : (
          <>
            <img
              src={video.thumbnail || ''}
              alt={video.title}
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
          </>
        )}

        {/* Favorite overlay button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleFav()
          }}
          className={`absolute top-2.5 right-2.5 z-10 flex size-8 items-center justify-center rounded-full border backdrop-blur-md transition-all ${
            isFav
              ? 'border-red-500/60 bg-red-500/20 text-red-500'
              : 'border-white/20 bg-black/60 text-white hover:text-red-400'
          }`}
          title={isFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
        >
          <Heart className={`size-4 ${isFav ? 'fill-current' : ''}`} />
        </button>

        {/* Duration badge */}
        {video.duration ? (
          <div className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur">
            {Math.floor(video.duration / 60)}:{('0' + Math.floor(video.duration % 60)).slice(-2)}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col justify-between p-3.5 gap-3 bg-[#111217]">
        <div className="flex flex-col gap-1">
          <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-foreground/90" title={video.title}>
            {video.title || 'Twitter Video'}
          </h3>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
            <span className="truncate max-w-[120px] font-medium">@{video.username || video.author || 'X'}</span>
            {video.like_count ? <span>❤️ {Number(video.like_count).toLocaleString()}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs font-medium"
            onClick={onDownload}
            disabled={isDownloading}
          >
            <Download data-icon="inline-start" className="size-3.5" />
            {isDownloading ? '...' : 'İndir'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs"
            onClick={onOpenModal}
            title="Büyük Ekranda İzle"
          >
            <Film className="size-3.5" />
            İzle
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={onCopy}
            title="Linki Kopyala"
          >
            {isCopied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </div>
    </article>
  )
}
