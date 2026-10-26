'use client'

import { useState, useEffect } from 'react'
import {
  ChevronRight,
  Download,
  Menu,
  X,
  Cookie,
  Check,
  QrCode,
  Smartphone,
  ExternalLink,
  Copy,
  Folder,
  FolderOpen,
  HardDrive,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { initialPool, type PoolLink, type ViewId } from '@/lib/data'
import { Sidebar } from './sidebar'
import { UrlDownloaderView } from './views/url-downloader'
import { ProfileCrawlerView } from './views/profile-crawler'
import { ExploreView } from './views/explore'
import { LinkPoolView } from './views/link-pool'
import { ArchiveView } from './views/archive'
import { TwitterView } from './views/twitter'
import { FavoritesView } from './views/favorites'
import { VideoPlayerView } from './views/video-player'
import { Button } from '@/components/ui/button'

const FAVORITES_STORAGE_KEY = 'video_pro_favorites_v1'

const viewMeta: Record<ViewId, { group: string; label: string }> = {
  url: { group: 'İndir', label: 'URL İndirici' },
  profile: { group: 'İndir', label: 'Profil Tarayıcı' },
  explore: { group: 'İndir', label: 'Keşfet Modu' },
  twitter: { group: 'İndir', label: 'X / Twitter' },
  player: { group: 'Kütüphane', label: 'Video Oynatıcı' },
  archive: { group: 'Kütüphane', label: 'Arşiv' },
  favorites: { group: 'Kütüphane', label: 'Favoriler' },
  pool: { group: 'Kütüphane', label: 'Link Havuzu' },
}

export function AppShell() {
  const [view, setView] = useState<ViewId>('twitter')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pool, setPool] = useState<PoolLink[]>(initialPool)
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [isCookiesOpen, setIsCookiesOpen] = useState(false)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [isFolderOpen, setIsFolderOpen] = useState(false)
  const [downloadDir, setDownloadDir] = useState('')
  const [dirPresets, setDirPresets] = useState<Record<string, string>>({})
  const [isSelectingFolder, setIsSelectingFolder] = useState(false)
  const [customInputPath, setCustomInputPath] = useState('')
  const [folderSavedStatus, setFolderSavedStatus] = useState<string | null>(null)
  const [cookiesText, setCookiesText] = useState('')
  const [cookiesSaved, setCookiesSaved] = useState(false)
  const [networkUrl, setNetworkUrl] = useState('http://localhost:3000')
  const [networkIp, setNetworkIp] = useState('localhost')
  const [qrCopied, setQrCopied] = useState(false)

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setFavorites(new Set(parsed.map((item: any) => item.id || item.originalUrl || item.url)))
        }
      }
    } catch {}
  }, [])

  // Load saved links on mount for pool badge count
  useEffect(() => {
    fetch('/api/saved-links')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.links) ? data.links : [])
        if (list.length >= 0) {
          setPool(
            list.map((d: any, i: number) => ({
              id: d.id || `pool_${i}_${Date.now()}`,
              url: d.url,
              platform: (d.platform || 'tiktok') as any,
              addedAt: d.savedAt ? new Date(d.savedAt).toLocaleDateString('tr-TR') : '',
            }))
          )
        }
      })
      .catch(() => {})
  }, [])

  // Load network info for QR
  useEffect(() => {
    fetch('/api/network-info')
      .then((res) => res.json())
      .then((data) => {
        if (data.url) setNetworkUrl(data.url)
        if (data.ip) setNetworkIp(data.ip)
      })
      .catch(() => {})
  }, [])

  // Load download dir config
  useEffect(() => {
    fetch('/api/config/download-dir')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDownloadDir(data.currentDir)
          setCustomInputPath(data.currentDir)
          if (data.presets) setDirPresets(data.presets)
        }
      })
      .catch(() => {})
  }, [])

  const handleApplyDir = async (path: string) => {
    if (!path.trim()) return
    try {
      const res = await fetch('/api/config/download-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: path }),
      })
      const data = await res.json()
      if (data.success) {
        setDownloadDir(data.currentDir)
        setCustomInputPath(data.currentDir)
        setFolderSavedStatus('İndirme klasörü başarıyla güncellendi!')
        setTimeout(() => setFolderSavedStatus(null), 3000)
      }
    } catch {}
  }

  const handleBrowseFolder = async () => {
    setIsSelectingFolder(true)
    try {
      const res = await fetch('/api/select-folder', { method: 'POST' })
      const data = await res.json()
      if (data.success && data.currentDir) {
        setDownloadDir(data.currentDir)
        setCustomInputPath(data.currentDir)
        setFolderSavedStatus('Klasör seçildi ve kaydedildi!')
        setTimeout(() => setFolderSavedStatus(null), 3000)
      }
    } catch {}
    finally {
      setIsSelectingFolder(false)
    }
  }

  const handleSaveCookies = async () => {
    try {
      const res = await fetch('/api/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookiesText }),
      })
      const data = await res.json()
      if (data.success) {
        setCookiesSaved(true)
        setTimeout(() => {
          setCookiesSaved(false)
          setIsCookiesOpen(false)
        }, 1500)
      }
    } catch {}
  }

  const toggleFavorite = (videoOrId: any) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      let id = typeof videoOrId === 'string' ? videoOrId : videoOrId.id || videoOrId.url
      let videoUrl = typeof videoOrId === 'string' ? videoOrId : videoOrId.originalUrl || videoOrId.url

      try {
        const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
        let list = stored ? JSON.parse(stored) : []

        const existsIdx = list.findIndex(
          (x: any) => x.id === id || x.url === videoUrl || x.originalUrl === videoUrl
        )

        if (existsIdx >= 0) {
          list.splice(existsIdx, 1)
          next.delete(id)
          next.delete(videoUrl)
        } else {
          list.unshift(
            typeof videoOrId === 'string'
              ? { id, url: videoUrl, title: 'Favori Video', savedAt: Date.now() }
              : { ...videoOrId, savedAt: Date.now() }
          )
          next.add(id)
          next.add(videoUrl)
        }
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list))
      } catch {}

      return next
    })
  }

  const navigate = (id: ViewId) => {
    setView(id)
    setMobileOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopyNetworkUrl = async () => {
    try {
      await navigator.clipboard.writeText(networkUrl)
      setQrCopied(true)
      setTimeout(() => setQrCopied(false), 2000)
    } catch {}
  }

  const meta = viewMeta[view]

  return (
    <div className="app-glow flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 p-3 pr-0 lg:block">
        <div className="h-full animate-fade-in rounded-2xl border border-sidebar-border bg-sidebar/90 backdrop-blur-xl">
          <Sidebar
            active={view}
            onNavigate={navigate}
            poolCount={pool.length}
            favoriteCount={favorites.size}
            onOpenCookies={() => setIsCookiesOpen(true)}
            onOpenQr={() => setIsQrOpen(true)}
          />
        </div>
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        inert={!mobileOpen}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute top-5 right-4 z-10 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
          <span className="sr-only">Menüyü kapat</span>
        </button>
        <Sidebar
          active={view}
          onNavigate={navigate}
          poolCount={pool.length}
          favoriteCount={favorites.size}
          onOpenCookies={() => setIsCookiesOpen(true)}
          onOpenQr={() => setIsQrOpen(true)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Download className="size-4" strokeWidth={2.5} />
            </span>
            <span className="font-semibold tracking-tight text-foreground">Video Pro</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg border border-border"
          >
            <Menu className="size-4" />
            <span className="sr-only">Menüyü aç</span>
          </button>
        </div>

        <div className="sticky top-0 z-30 hidden px-3 pt-3 lg:block">
          <div className="flex h-12 items-center justify-between rounded-xl border border-border/60 bg-background/70 px-4 backdrop-blur-xl shadow-sm">
            <nav aria-label="Konum" className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">{meta.group}</span>
              <ChevronRight aria-hidden className="size-3.5 text-muted-foreground/50" />
              <span key={view} className="animate-fade-in font-medium text-foreground">
                {meta.label}
              </span>
            </nav>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => setIsFolderOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border/80 px-2.5 py-1 text-xs hover:bg-muted text-foreground transition-colors max-w-[210px]"
                title={`İndirme Klasörü: ${downloadDir}`}
              >
                <Folder className="size-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{downloadDir ? (downloadDir.split(/[/\\]/).filter(Boolean).pop() || downloadDir) : 'Klasör'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCookiesOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border/80 px-2.5 py-1 text-xs hover:bg-muted text-foreground transition-colors"
              >
                <Cookie className="size-3.5 text-primary" />
                <span>Cookies.txt</span>
              </button>
              <button
                type="button"
                onClick={() => setIsQrOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border/80 px-2.5 py-1 text-xs hover:bg-muted text-foreground transition-colors"
              >
                <Smartphone className="size-3.5 text-success" />
                <span>Telefondan Aç</span>
              </button>
              <span className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 font-medium text-foreground">
                <span aria-hidden className="pulse-dot size-1.5 rounded-full bg-success" />
                Sunucu Bağlı (:3000)
              </span>
            </div>
          </div>
        </div>

        <main
          key={view}
          className="mx-auto w-full max-w-6xl flex-1 animate-fade-up px-4 py-8 md:px-8 md:py-10"
        >
          {view === 'url' && <UrlDownloaderView />}
          {view === 'profile' && <ProfileCrawlerView />}
          {view === 'explore' && <ExploreView onNavigateToPool={() => navigate('pool')} />}
          {view === 'player' && (
            <VideoPlayerView favorites={favorites} onToggleFavorite={toggleFavorite} />
          )}
          {view === 'pool' && <LinkPoolView pool={pool} setPool={setPool} />}
          {view === 'archive' && (
            <ArchiveView
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onOpenPlayer={() => navigate('player')}
            />
          )}
          {view === 'twitter' && (
            <TwitterView
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onOpenCookies={() => setIsCookiesOpen(true)}
            />
          )}
          {view === 'favorites' && (
            <FavoritesView
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onClear={() => setFavorites(new Set())}
              onBrowse={() => navigate('archive')}
            />
          )}
        </main>
      </div>

      {/* Cookies Modal */}
      {isCookiesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setIsCookiesOpen(false)}
        >
          <div
            className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Cookie className="size-5 text-primary" />
                <h3 className="font-semibold text-foreground">cookies.txt Ayarları</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCookiesOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              X (Twitter) veya Instagram için tarayıcınızdan aldığınız Netscape formatındaki cookies.txt içeriğini buraya yapıştırın.
            </p>
            <textarea
              rows={8}
              value={cookiesText}
              onChange={(e) => setCookiesText(e.target.value)}
              placeholder="# Netscape HTTP Cookie File&#10;.twitter.com TRUE / TRUE ... auth_token=..."
              className="w-full resize-none rounded-xl border border-input bg-background/60 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:border-primary"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsCookiesOpen(false)}>
                İptal
              </Button>
              <Button size="sm" onClick={handleSaveCookies} disabled={!cookiesText.trim()}>
                {cookiesSaved ? (
                  <>
                    <Check data-icon="inline-start" className="size-3.5" />
                    Kaydedildi!
                  </>
                ) : (
                  'Kaydet'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* QR / Telefon Bağlantı Modalı */}
      {isQrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setIsQrOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex w-full items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="size-5 text-success" />
                <h3 className="font-semibold text-foreground">Telefondan Bağlan</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQrOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Telefonunuzla aynı Wi-Fi ağına bağlıyken kameranızla bu QR kodu tarayarak siteyi telefonunuzdan kullanabilirsiniz.
            </p>
            <div className="rounded-xl border border-border bg-white p-3 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(networkUrl)}`}
                alt="QR Kod"
                className="size-44"
              />
            </div>
            <div className="flex w-full items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-mono">
              <span className="truncate pr-2 font-medium">{networkUrl}</span>
              <button
                type="button"
                onClick={handleCopyNetworkUrl}
                className="text-primary hover:underline font-sans font-semibold shrink-0"
              >
                {qrCopied ? 'Kopyalandı!' : 'Kopyala'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* İndirme Klasörü Seçim Modalı */}
      {isFolderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setIsFolderOpen(false)}
        >
          <div
            className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-border bg-[#0f1015] p-6 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Başlık */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <Folder className="size-5 text-amber-400" />
                <div>
                  <h3 className="font-semibold text-foreground text-sm">İndirme Klasörü Konumu</h3>
                  <p className="text-[11px] text-muted-foreground">Videoların doğrudan nereye kaydedileceğini seçin.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFolderOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Mevcut Aktif Yol */}
            <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Aktif İndirme Klasörü</span>
                <button
                  type="button"
                  onClick={() => fetch('/api/open-folder')}
                  className="text-primary hover:underline flex items-center gap-1 font-semibold"
                >
                  <FolderOpen className="size-3" /> Windows'ta Aç
                </button>
              </div>
              <div className="font-mono text-xs text-amber-300 break-all select-all font-semibold bg-black/40 p-2 rounded-lg border border-border/40">
                {downloadDir || 'Yükleniyor...'}
              </div>
            </div>

            {/* Hızlı Hazır Konumlar */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Hızlı Konumlar
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {dirPresets.desktop && (
                  <button
                    type="button"
                    onClick={() => handleApplyDir(dirPresets.desktop)}
                    className="flex flex-col gap-1 p-2.5 rounded-xl border border-border/70 bg-card/50 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
                  >
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      🖥️ Masaüstü
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">Reels_Videolari</span>
                  </button>
                )}
                {dirPresets.downloads && (
                  <button
                    type="button"
                    onClick={() => handleApplyDir(dirPresets.downloads)}
                    className="flex flex-col gap-1 p-2.5 rounded-xl border border-border/70 bg-card/50 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
                  >
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      📥 İndirilenler
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">Reels_Videolari</span>
                  </button>
                )}
                {dirPresets.videos && (
                  <button
                    type="button"
                    onClick={() => handleApplyDir(dirPresets.videos)}
                    className="flex flex-col gap-1 p-2.5 rounded-xl border border-border/70 bg-card/50 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
                  >
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      🎬 Videolarım
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">Reels_Videolari</span>
                  </button>
                )}
                {dirPresets.default && (
                  <button
                    type="button"
                    onClick={() => handleApplyDir(dirPresets.default)}
                    className="flex flex-col gap-1 p-2.5 rounded-xl border border-border/70 bg-card/50 hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
                  >
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      ⚡ Varsayılan Klasör
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">reelsindirici\downloads</span>
                  </button>
                )}
              </div>
            </div>

            {/* Özel Yol veya Windows Klasör Seçici */}
            <div className="flex flex-col gap-2 pt-1 border-t border-border/60">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Özel Klasör Yolu
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInputPath}
                  onChange={(e) => setCustomInputPath(e.target.value)}
                  placeholder="D:\Videolarım veya C:\..."
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApplyDir(customInputPath)}
                  className="h-9 px-3 text-xs font-semibold"
                >
                  Uygula
                </Button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="default"
                  onClick={handleBrowseFolder}
                  disabled={isSelectingFolder}
                  className="w-full h-10 gap-2 font-semibold shadow-sm"
                >
                  <FolderOpen className="size-4" />
                  {isSelectingFolder ? 'Windows Penceresi Bekleniyor...' : 'Windows Klasör Seçici ile Gözat'}
                </Button>
              </div>
            </div>

            {folderSavedStatus && (
              <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-2.5 text-xs text-emerald-400 font-medium flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{folderSavedStatus}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
