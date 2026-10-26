'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  AtSign,
  Search,
  UserRound,
  Download,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Play,
  X,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  ArrowRight,
  RefreshCw,
  Film,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, Panel, SelectField, TextInput, EmptyState } from '../primitives'
import { cn } from '@/lib/utils'

type ProfileVideo = {
  id: string
  url: string
  title: string
  thumbnail: string | null
  author: string
  platform: 'instagram' | 'tiktok' | 'youtube' | 'twitter' | string
  duration?: number
  view_count?: number
}

const quickChips = [
  { label: '@yazisizhali0', platform: 'Instagram', url: 'https://www.instagram.com/yazisizhali0/' },
  { label: '@khaby.lame', platform: 'TikTok', url: 'https://www.tiktok.com/@khaby.lame' },
  { label: '@MrBeast', platform: 'YouTube', url: 'https://www.youtube.com/@MrBeast/shorts' },
  { label: '@natgeo', platform: 'Instagram', url: 'https://www.instagram.com/natgeo/' },
]

export function ProfileCrawlerView({ onNavigateToPool }: { onNavigateToPool?: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [profile, setProfile] = useState('')
  const [limit, setLimit] = useState('50')
  const [isLoading, setIsLoading] = useState(false)
  const [videos, setVideos] = useState<ProfileVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Çoklu seçim state'i
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [downloadingMap, setDownloadingMap] = useState<Record<string, boolean>>({})
  const [isBatchDownloading, setIsBatchDownloading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Modal oynatıcı ve gerçek video akışı
  const [modalVideo, setModalVideo] = useState<ProfileVideo | null>(null)
  const [modalMedia, setModalMedia] = useState<{
    type: 'video' | 'youtube' | 'loading' | 'error'
    streamUrl?: string
    embedUrl?: string
  } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!modalVideo) {
      setModalMedia(null)
      return
    }

    let active = true
    setModalMedia({ type: 'loading' })

    const fetchMedia = async () => {
      try {
        const res = await fetch(`/api/video-play-info?url=${encodeURIComponent(modalVideo.url)}`)
        const data = await res.json()
        if (!active) return

        if (data.success) {
          if (data.type === 'youtube') {
            setModalMedia({ type: 'youtube', embedUrl: data.embedUrl })
          } else {
            setModalMedia({
              type: 'video',
              streamUrl: data.streamUrl || `/api/video-stream?url=${encodeURIComponent(modalVideo.url)}`,
            })
          }
        } else {
          setModalMedia({
            type: 'video',
            streamUrl: `/api/video-stream?url=${encodeURIComponent(modalVideo.url)}`,
          })
        }
      } catch {
        if (!active) return
        setModalMedia({
          type: 'video',
          streamUrl: `/api/video-stream?url=${encodeURIComponent(modalVideo.url)}`,
        })
      }
    }

    fetchMedia()
    return () => {
      active = false
    }
  }, [modalVideo])

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

  // Videoları profil kaynağından çek
  const handleScrape = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl || profile).trim()
    if (!targetUrl) return

    if (overrideUrl) {
      setProfile(overrideUrl)
    }

    setIsLoading(true)
    setError(null)
    setVideos([])
    setSelectedIds(new Set())

    try {
      const res = await fetch('/api/profile/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          limit: limit === 'all' ? 500 : parseInt(limit, 10),
        }),
      })

      // JSON parsing kontrolü
      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch (jsonErr) {
        throw new Error('Sunucudan geçersiz yanıt alındı. Lütfen profil adresini kontrol edin.')
      }

      if (data.success && Array.isArray(data.videos)) {
        setVideos(data.videos)
        if (data.videos.length === 0) {
          setError('Bu profilde video veya Reels içeriği bulunamadı.')
        } else {
          setActionStatus(`${data.videos.length} video başarıyla listelendi. İstediğin videoları seçebilirsin.`)
          setTimeout(() => setActionStatus(null), 4000)
        }
      } else {
        setError(data.error || 'Profil taranamadı. Lütfen geçerli bir profil linki girin.')
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası oluştu.')
    } finally {
      setIsLoading(false)
    }
  }

  // Arama filtresi
  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos
    const q = searchQuery.toLowerCase()
    return videos.filter((v) => {
      const titleMatch = (v.title || '').toLowerCase().includes(q)
      const authorMatch = (v.author || '').toLowerCase().includes(q)
      const urlMatch = (v.url || '').toLowerCase().includes(q)
      return titleMatch || authorMatch || urlMatch
    })
  }, [videos, searchQuery])

  // Seçim işlemleri
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === filteredVideos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredVideos.map((v) => v.id)))
    }
  }

  // Tekil video indirme
  const handleDownloadSingle = async (video: ProfileVideo) => {
    setDownloadingMap((prev) => ({ ...prev, [video.id]: true }))
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: video.url, uploader: video.author }),
      })
      const data = await res.json()
      if (data.success) {
        setActionStatus(`"${video.title.slice(0, 30)}..." indirildi!`)
        setTimeout(() => setActionStatus(null), 3000)
      } else {
        alert('İndirme hatası: ' + (data.error || 'Bilinmeyen hata'))
      }
    } catch (err: any) {
      alert('Hata: ' + err.message)
    } finally {
      setDownloadingMap((prev) => ({ ...prev, [video.id]: false }))
    }
  }

  // Seçilenleri toplu indirme
  const handleDownloadSelected = async () => {
    const selectedVideos = videos.filter((v) => selectedIds.has(v.id))
    if (selectedVideos.length === 0) return

    setIsBatchDownloading(true)
    try {
      const res = await fetch('/api/profile/download-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: selectedVideos.map((v) => v.url) }),
      })
      const data = await res.json()
      if (data.success) {
        setActionStatus(`🚀 Seçilen ${selectedVideos.length} video indirme kuyruğuna alındı!`)
        setSelectedIds(new Set())
        setTimeout(() => setActionStatus(null), 5000)
      } else {
        alert('Hata: ' + (data.error || 'İndirme başlatılamadı'))
      }
    } catch (err: any) {
      alert('Hata: ' + err.message)
    } finally {
      setIsBatchDownloading(false)
    }
  }

  // Seçilenleri link havuzuna ekle
  const handleAddSelectedToPool = async () => {
    const selectedVideos = videos.filter((v) => selectedIds.has(v.id))
    if (selectedVideos.length === 0) return

    const links = selectedVideos.map((v) => ({
      url: v.url,
      title: v.title || `${v.author} Videosu`,
      platform: v.platform,
    }))

    try {
      await fetch('/api/save-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links }),
      })
      setActionStatus(`✅ ${links.length} video link havuzuna eklendi!`)
      setSelectedIds(new Set())
      setTimeout(() => setActionStatus(null), 4000)
    } catch (err: any) {
      alert('Havuza ekleme hatası: ' + err.message)
    }
  }

  // Link kopyalama
  const handleCopy = async (video: ProfileVideo) => {
    try {
      await navigator.clipboard.writeText(video.url)
      setCopiedId(video.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  // Platform renk göstergeleri
  const getPlatformBadge = (plat: string) => {
    switch (plat?.toLowerCase()) {
      case 'instagram':
        return { label: 'Instagram Reels', bg: 'bg-[#e1306c]/15 text-[#e1306c] border-[#e1306c]/30' }
      case 'tiktok':
        return { label: 'TikTok', bg: 'bg-[#00f2fe]/15 text-[#00f2fe] border-[#00f2fe]/30' }
      case 'youtube':
        return { label: 'YouTube Shorts', bg: 'bg-[#ff0000]/15 text-[#ff4444] border-[#ff0000]/30' }
      default:
        return { label: plat || 'Video', bg: 'bg-primary/15 text-primary border-primary/30' }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="02 — İndir"
        title="Profil Tarayıcı"
        description="Instagram, TikTok veya YouTube profilindeki tüm videoları tıpkı Twitter'daki gibi listeleyip görselleriyle incele, dilediklerini seçip topluca indir."
      />

      {/* Profil Arama Paneli */}
      <Panel
        icon={<UserRound className="size-4" />}
        title="Profil videolarını çıkar & seç"
        description="Instagram profili, TikTok hesabı veya YouTube kanal linki girebilirsin."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            handleScrape()
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <label htmlFor="profile" className="sr-only">
                Profil
              </label>
              <AtSign className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <TextInput
                id="profile"
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="instagram.com/yazisizhali0, @khaby.lame veya kanal linki"
                className="pl-11 h-11 text-sm font-medium"
              />
            </div>
            <SelectField
              aria-label="Video sayısı"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="md:w-44 h-11"
            >
              <option value="20">Son 20 video</option>
              <option value="50">Son 50 video</option>
              <option value="100">Son 100 video</option>
              <option value="200">Son 200 video</option>
              <option value="all">Tüm videolar</option>
            </SelectField>
            <Button
              type="submit"
              size="lg"
              disabled={isLoading}
              className="h-11 px-6 shadow-[0_10px_30px_-10px_var(--primary)] font-semibold shrink-0"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="size-4 animate-spin" data-icon="inline-start" />
                  Taranıyor...
                </>
              ) : (
                <>
                  <Search className="size-4" data-icon="inline-start" />
                  Videoları Getir
                </>
              )}
            </Button>
          </div>

          {/* Hızlı Örnek Aramalar */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-muted-foreground font-medium">Hızlı Dene:</span>
            {quickChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleScrape(chip.url)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1 text-xs text-foreground font-medium hover:border-primary/50 hover:bg-primary/10 transition-colors"
              >
                <span>{chip.label}</span>
                <span className="text-[10px] text-muted-foreground font-normal">({chip.platform})</span>
              </button>
            ))}
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive flex items-center justify-between">
            <span>{error}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-destructive/40 text-destructive"
              onClick={() => handleScrape()}
            >
              Tekrar Dene
            </Button>
          </div>
        )}

        {actionStatus && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-400 font-medium flex items-center justify-between">
            <span>{actionStatus}</span>
            {onNavigateToPool && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onNavigateToPool}>
                Link Havuzunu Gör
              </Button>
            )}
          </div>
        )}
      </Panel>

      {/* VİDEOLAR LİSTESİ & SEÇİM AKSİYONLARI */}
      {videos.length > 0 && (
        <Panel>
          {/* Üst Arama & Toplu İşlem Çubuğu */}
          <div className="flex flex-col gap-4 border-b border-border/60 pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Filtreleme Arama Kutusu */}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <TextInput
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Başlık, açıklama veya etiketlerde ara..."
                  className="pl-10 h-10 text-sm"
                />
              </div>

              {/* İstatistik Sayacı */}
              <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                <span className="rounded-lg bg-card px-3 py-2 border border-border">
                  Toplam: <strong className="text-foreground">{videos.length}</strong>
                </span>
                <span
                  className={cn(
                    'rounded-lg px-3 py-2 border font-bold transition-colors',
                    selectedIds.size > 0
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'bg-card text-muted-foreground border-border'
                  )}
                >
                  Seçilen: <strong>{selectedIds.size}</strong>
                </span>
              </div>
            </div>

            {/* Seçim Butonları & Toplu Aksiyonlar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAll}
                  className="h-8 text-xs font-medium gap-1.5"
                >
                  {selectedIds.size === filteredVideos.length && filteredVideos.length > 0 ? (
                    <>
                      <CheckSquare className="size-3.5 text-primary" />
                      Seçimi Temizle
                    </>
                  ) : (
                    <>
                      <Square className="size-3.5" />
                      Tümünü Seç ({filteredVideos.length})
                    </>
                  )}
                </Button>

                {selectedIds.size > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size} video işaretlendi
                  </span>
                )}
              </div>

              {/* Toplu İşlem Butonları */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.size === 0}
                  onClick={handleAddSelectedToPool}
                  className="h-8 text-xs font-medium gap-1.5 border-primary/30 text-foreground hover:bg-primary/10"
                >
                  <Bookmark className="size-3.5 text-primary" />
                  Seçilenleri Havuza Ekle ({selectedIds.size})
                </Button>

                <Button
                  size="sm"
                  disabled={selectedIds.size === 0 || isBatchDownloading}
                  onClick={handleDownloadSelected}
                  className="h-8 text-xs font-semibold gap-1.5 shadow-sm"
                >
                  <Download className={cn('size-3.5', isBatchDownloading && 'animate-bounce')} />
                  {isBatchDownloading ? 'Kuyruğa Alınıyor...' : `Seçilenleri İndir (${selectedIds.size})`}
                </Button>
              </div>
            </div>
          </div>

          {/* VİDEO KARTLARI IZGARASI (GRID - AYNI TWITTER GİBİ) */}
          {filteredVideos.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={<Film className="size-5" />}
                title="Aramanızla eşleşen video bulunamadı"
                description="Farklı bir arama terimi deneyebilir veya arama filtresini temizleyebilirsiniz."
              />
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {filteredVideos.map((video) => {
                const isSelected = selectedIds.has(video.id)
                const isDownloading = downloadingMap[video.id]
                const badge = getPlatformBadge(video.platform)
                // Proxy resim linki (Instagram/TikTok referrer engellerini aşmak için)
                const thumbSrc = video.thumbnail
                  ? `/api/proxy-image?url=${encodeURIComponent(video.thumbnail)}`
                  : '/placeholder.jpg'

                return (
                  <div
                    key={video.id}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-2xl border bg-card/60 transition-all duration-200',
                      isSelected
                        ? 'border-primary ring-2 ring-primary/30 shadow-md bg-primary/[0.04]'
                        : 'border-border/70 hover:border-foreground/30 hover:shadow-lg'
                    )}
                  >
                    {/* Üst Seçim Checkbox & Platform Rozeti */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSelect(video.id)
                        }}
                        className={cn(
                          'pointer-events-auto flex size-7 items-center justify-center rounded-lg border backdrop-blur-md transition-all shadow-sm',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-black/60 text-white/80 border-white/20 hover:border-white/60 hover:bg-black/80'
                        )}
                        title={isSelected ? 'Seçimi Kaldır' : 'Videoyu Seç'}
                      >
                        {isSelected ? <Check className="size-4 stroke-[3]" /> : <Square className="size-3.5 opacity-60" />}
                      </button>

                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[10px] font-bold border uppercase tracking-wider backdrop-blur-md shadow-sm',
                          badge.bg
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {/* Kapak Resmi (Thumbnail) & Play Butonu */}
                    <div
                      className="relative aspect-[9/14] w-full overflow-hidden bg-black/80 cursor-pointer"
                      onClick={() => setModalVideo(video)}
                    >
                      <img
                        src={thumbSrc}
                        alt={video.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          // Fallback doğrudan ham URL
                          if (video.thumbnail && (e.currentTarget.src !== video.thumbnail)) {
                            e.currentTarget.src = video.thumbnail
                          }
                        }}
                      />

                      {/* Karartma Gradyanı */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                      {/* Play Butonu Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-xl transform group-hover:scale-110 transition-transform">
                          <Play className="size-5 fill-current ml-0.5" />
                        </div>
                      </div>

                      {/* Yazar Bilgisi Alt Etiket */}
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs text-white/90 pointer-events-none">
                        <span className="font-semibold truncate drop-shadow-md">
                          @{video.author || 'profil'}
                        </span>
                      </div>
                    </div>

                    {/* Kart İçeriği & Başlık */}
                    <div className="flex flex-1 flex-col p-3.5 gap-2.5">
                      <p
                        className="text-xs font-medium text-foreground line-clamp-2 leading-relaxed"
                        title={video.title}
                      >
                        {video.title || 'Başlıksız Video'}
                      </p>

                      {/* Alt Aksiyon Butonları */}
                      <div className="mt-auto flex items-center justify-between gap-1.5 border-t border-border/40 pt-2.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadSingle(video)}
                          disabled={isDownloading}
                          className="h-8 flex-1 text-xs font-semibold gap-1.5 border-border hover:border-primary/50 hover:text-primary transition-colors"
                          title="Hemen İndir"
                        >
                          <Download className={cn('size-3.5', isDownloading && 'animate-spin')} />
                          {isDownloading ? 'İniyor' : 'İndir'}
                        </Button>

                        <button
                          type="button"
                          onClick={() => handleCopy(video)}
                          className="flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-card hover:text-foreground hover:border-foreground/40 transition-colors"
                          title="Linki Kopyala"
                        >
                          {copiedId === video.id ? (
                            <Check className="size-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>

                        <a
                          href={video.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-card hover:text-primary hover:border-primary/40 transition-colors"
                          title="Orijinal Gönderiyi Aç"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      )}

      {/* MODAL VİDEO ÖNİZLEME OYNATICI (Twitter tarzı tam ekran modal) */}
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
            className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-[#0f1015] shadow-2xl animate-fade-in"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Başlık */}
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 bg-[#14151b]">
              <div className="flex items-center gap-2 truncate pr-4">
                <span className="font-semibold text-sm text-foreground truncate">
                  {modalVideo.title || `${modalVideo.author} Videosu`}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  (@{modalVideo.author})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalVideo(null)}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Medya Alanı - GERÇEK VİDEO OYNATICI */}
            <div className="relative flex items-center justify-center bg-black min-h-[380px] max-h-[75vh] overflow-hidden">
              {modalMedia?.type === 'loading' && (
                <div className="relative w-full h-[65vh] flex flex-col items-center justify-center">
                  {modalVideo.thumbnail && (
                    <img
                      src={`/api/proxy-image?url=${encodeURIComponent(modalVideo.thumbnail)}`}
                      alt={modalVideo.title}
                      className="absolute inset-0 w-full h-full object-cover blur-sm opacity-40"
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="size-10 animate-spin rounded-full border-3 border-primary border-t-transparent shadow-lg" />
                    <span className="text-xs font-semibold text-white/90 bg-black/60 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                      Video akışı yükleniyor...
                    </span>
                  </div>
                </div>
              )}

              {modalMedia?.type === 'youtube' && modalMedia.embedUrl && (
                <iframe
                  src={modalMedia.embedUrl}
                  title={modalVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-[65vh] max-h-[75vh] border-0"
                />
              )}

              {modalMedia?.type === 'video' && modalMedia.streamUrl && (
                <video
                  src={modalMedia.streamUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[75vh] w-full object-contain"
                  onError={(e) => {
                    const target = e.currentTarget
                    const fallbackUrl = `/api/video-stream?url=${encodeURIComponent(modalVideo.url)}`
                    if (target.src !== fallbackUrl) {
                      target.src = fallbackUrl
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
              )}

              {modalMedia?.type === 'error' && (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <Film className="size-10 mb-2 opacity-40" />
                  <p className="text-sm">Video akışı doğrudan başlatılamadı.</p>
                  <a
                    href={modalVideo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 text-xs text-primary hover:underline font-semibold"
                  >
                    Orijinal Sayfada Aç
                  </a>
                </div>
              )}
            </div>

            {/* Modal Alt Aksiyonlar */}
            <div className="flex items-center justify-between border-t border-border/40 px-4 py-3 bg-[#14151b]">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(modalVideo)}
                  className="h-8 text-xs gap-1.5"
                >
                  {copiedId === modalVideo.id ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  {copiedId === modalVideo.id ? 'Kopyalandı' : 'Linki Kopyala'}
                </Button>

                <a
                  href={modalVideo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline px-2"
                >
                  Orijinal Sayfa <ExternalLink className="size-3" />
                </a>
              </div>

              <Button
                size="sm"
                onClick={() => handleDownloadSingle(modalVideo)}
                disabled={downloadingMap[modalVideo.id]}
                className="h-8 text-xs font-semibold gap-1.5"
              >
                <Download className="size-3.5" />
                {downloadingMap[modalVideo.id] ? 'İndiriliyor...' : 'Hemen İndir'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
