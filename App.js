import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  StyleSheet, Text, View, Dimensions, 
  TouchableOpacity, TextInput, ActivityIndicator, 
  Alert, StatusBar, Pressable, LogBox, Image, ScrollView, Modal 
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import Slider from '@react-native-community/slider';
import PagerView from 'react-native-pager-view';
import { LinearGradient } from 'expo-linear-gradient';

// Güvenli Depolama (Expo Go & Native Uyumlu FileSystem Storage)
const SafeStorage = {
  _cache: {},
  _loaded: false,
  async _init() {
    if (this._loaded) return;
    try {
      const fileUri = (FileSystem.documentDirectory || '') + 'app_settings.json';
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info && info.exists) {
        const text = await FileSystem.readAsStringAsync(fileUri);
        this._cache = JSON.parse(text || '{}');
      }
    } catch(e) {}
    this._loaded = true;
  },
  async getItem(key) {
    await this._init();
    return this._cache[key] !== undefined ? this._cache[key] : null;
  },
  async setItem(key, value) {
    await this._init();
    this._cache[key] = String(value);
    try {
      const fileUri = (FileSystem.documentDirectory || '') + 'app_settings.json';
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(this._cache));
    } catch(e) {}
  },
  async removeItem(key) {
    await this._init();
    delete this._cache[key];
    try {
      const fileUri = (FileSystem.documentDirectory || '') + 'app_settings.json';
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(this._cache));
    } catch(e) {}
  }
};
const AsyncStorage = SafeStorage;

LogBox.ignoreLogs(['Cannot connect to Expo CLI']);

const { width, height } = Dimensions.get('window');

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function getCleanTitle(filename) {
  if (!filename) return '';
  return filename
    .replace(/^([a-zA-Z0-9]+)_[^_]+_\d+_/, '')
    .replace(/^([a-zA-Z0-9]+)_\d+_/, '')
    .replace(/\.mp4$/i, '')
    .trim() || filename.replace(/\.mp4$/i, '');
}

// ============================================
// REELS / TIKTOK SLIDE
// ============================================
function VideoSlide(props) {
  const isAdjacent = Math.abs(props.index - props.activeIndex) <= 1;

  if (!isAdjacent) {
    return (
      <View style={[styles.videoContainer, { backgroundColor: '#090a0f', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#00f2ea" />
      </View>
    );
  }

  return <ActiveVideoSlide {...props} />;
}

function ActiveVideoSlide({ item, index, activeIndex, serverIp, onDelete, uiVisible, setUiVisible, isSwiping }) {
  const isActive = index === activeIndex;
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSpeedUp, setIsSpeedUp] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isLongPressPauseRef = useRef(false);
  
  const touchX = useRef(0);
  const longPressTimer = useRef(null);
  const videoViewRef = useRef(null);
  
  const cleanIp = serverIp.trim();
  let serverVideoUri = '';
  if (cleanIp.startsWith('http')) {
    serverVideoUri = `${cleanIp}${item.path}`;
  } else {
    serverVideoUri = `http://${cleanIp}:3000${item.path}`;
  }
  const videoUri = item.isLocal ? item.uri : serverVideoUri;
  
  const player = useVideoPlayer(videoUri, p => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (!isActive) {
      setIsPaused(false);
      setIsSpeedUp(false);
      isLongPressPauseRef.current = false;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive && player && !isSwiping) {
      if (!isPaused) {
        player.play();
      } else {
        player.pause();
      }
    } else if (player) {
      player.pause();
    }
  }, [isActive, player, isPaused, isSwiping]);

  useEffect(() => {
    let interval;
    if (isActive && player) {
      interval = setInterval(() => {
        setProgress(player.currentTime);
        if (player.duration) setDuration(player.duration);
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isActive, player]);

  const toggleMute = () => {
    if (player) {
      player.muted = !player.muted;
      setIsMuted(player.muted);
    }
  };

  const toggleFullscreen = () => {
    if (videoViewRef.current) videoViewRef.current.enterFullscreen();
  };

  const handlePressIn = (e) => {
    touchX.current = e.nativeEvent.pageX;
  };

  const handleLongPress = () => {
    if (!player) return;
    if (touchX.current > width * 0.75 || touchX.current < width * 0.25) {
      if (!isPaused) {
        player.playbackRate = 2.0;
        setIsSpeedUp(true);
      }
    } else {
      setIsPaused(true);
      isLongPressPauseRef.current = true;
      setUiVisible(false);
    }
  };

  const handlePressOut = () => {
    if (player) {
      player.playbackRate = 1.0;
      setIsSpeedUp(false);
    }
    if (isLongPressPauseRef.current) {
      setIsPaused(false);
      isLongPressPauseRef.current = false;
      setUiVisible(true);
    }
  };

  const handlePress = () => {
    setIsPaused(prev => !prev);
    setUiVisible(prev => !prev);
  };

  const handleSeek = (value) => {
    if (player) {
      player.currentTime = value;
      setProgress(value);
    }
  };

  const showSlideUi = uiVisible && !isLongPressPauseRef.current;

  return (
    <View style={styles.videoContainer}>
      <VideoView
        ref={videoViewRef}
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />
      
      <Pressable 
        style={[StyleSheet.absoluteFill, { zIndex: 5 }]}
        onPressIn={handlePressIn}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressOut={handlePressOut}
        delayLongPress={200}
      >
        {showSlideUi && (
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.9)']}
            style={styles.gradientOverlay}
            pointerEvents="none"
          />
        )}

        {isPaused && !isLongPressPauseRef.current && (
          <View style={styles.pauseIconContainer} pointerEvents="none">
            <Text style={styles.pauseIconText}>DURAKLATILDI</Text>
          </View>
        )}

        {isSpeedUp && (
          <View style={styles.speedUpOverlay} pointerEvents="none">
            <Text style={styles.speedUpText}>2x Hız</Text>
          </View>
        )}
      </Pressable>

      {showSlideUi && (
        <>
          {/* Kompakt Yan Menü */}
          <View style={styles.sideActions} pointerEvents="box-none">
            <TouchableOpacity style={styles.sideBtn} onPress={toggleMute}>
              <View style={[styles.iconCircle, isMuted && { backgroundColor: 'rgba(239, 68, 68, 0.5)', borderColor: 'rgba(239, 68, 68, 0.4)' }]}>
                <Text style={styles.actionBtnLabel}>{isMuted ? 'X' : 'SES'}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sideBtn} onPress={toggleFullscreen}>
              <View style={styles.iconCircle}>
                <Text style={styles.actionBtnLabel}>TAM</Text>
              </View>
            </TouchableOpacity>
            
            {item.isLocal && (
              <TouchableOpacity style={styles.sideBtn} onPress={() => onDelete(item)}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.6)' }]}>
                  <Text style={styles.actionBtnLabel}>SİL</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Alt Bilgi */}
          <View style={styles.videoInfo} pointerEvents="none">
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <View style={[styles.badge, item.isLocal ? styles.badgeLocal : styles.badgeServer]}>
                <Text style={styles.badgeText}>{item.isLocal ? 'Offline' : 'Sunucu'}</Text>
              </View>
              {item.uploader && item.uploader !== 'Genel' && (
                <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Text style={styles.badgeText}>@{item.uploader}</Text>
                </View>
              )}
            </View>
            <Text style={styles.videoName} numberOfLines={1} ellipsizeMode="tail">{getCleanTitle(item.name)}</Text>
          </View>

          {/* Zarif Alt Scrubber */}
          <View style={styles.scrubberContainer}>
            <Text style={styles.timeText}>{formatTime(progress)}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration > 0 ? duration : 1}
              value={progress}
              onValueChange={handleSeek}
              onSlidingComplete={handleSeek}
              minimumTrackTintColor="#00f2ea"
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor="#fff"
            />
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

// ============================================
// YOUTUBE HUB (GELİŞMİŞ YOUTUBE OYNATICI & GALERİ)
// ============================================
function YouTubeHub({ list, serverIp, onBack, onDelete }) {
  const [selectedVideo, setSelectedVideo] = useState(list.length > 0 ? list[0] : null);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimeout = useRef(null);
  const videoViewRef = useRef(null);

  useEffect(() => {
    if (list.length > 0 && !selectedVideo) {
      setSelectedVideo(list[0]);
    }
  }, [list]);

  const cleanIp = serverIp.trim();
  let serverVideoUri = '';
  if (selectedVideo) {
    if (cleanIp.startsWith('http')) {
      serverVideoUri = `${cleanIp}${selectedVideo.path}`;
    } else {
      serverVideoUri = `http://${cleanIp}:3000${selectedVideo.path}`;
    }
  }
  const videoUri = selectedVideo ? (selectedVideo.isLocal ? selectedVideo.uri : serverVideoUri) : '';

  const player = useVideoPlayer(videoUri, p => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    if (player && selectedVideo) {
      player.play();
      setIsPaused(false);
      resetControlsTimer();
    }
  }, [selectedVideo, player]);

  // Canlı süre ve ilerleme güncellemesi
  useEffect(() => {
    let interval;
    if (player && selectedVideo) {
      interval = setInterval(() => {
        setProgress(player.currentTime || 0);
        if (player.duration) setDuration(player.duration);
      }, 300);
    }
    return () => clearInterval(interval);
  }, [player, selectedVideo]);

  const resetControlsTimer = () => {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setControlsVisible(true);
    controlsTimeout.current = setTimeout(() => {
      setControlsVisible(false);
    }, 4000);
  };

  const togglePlayPause = () => {
    if (!player) return;
    if (isPaused) {
      player.play();
      setIsPaused(false);
    } else {
      player.pause();
      setIsPaused(true);
    }
    resetControlsTimer();
  };

  const skipSeconds = (sec) => {
    if (!player) return;
    const newTime = Math.max(0, Math.min(duration || 0, (player.currentTime || 0) + sec));
    player.currentTime = newTime;
    setProgress(newTime);
    resetControlsTimer();
  };

  const handleSeek = (val) => {
    if (!player) return;
    player.currentTime = val;
    setProgress(val);
    resetControlsTimer();
  };

  const cycleSpeed = () => {
    if (!player) return;
    const speeds = [1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const next = speeds[nextIdx];
    player.playbackRate = next;
    setPlaybackSpeed(next);
    resetControlsTimer();
  };

  const toggleFullscreen = () => {
    if (videoViewRef.current) videoViewRef.current.enterFullscreen();
  };

  return (
    <View style={styles.ytHubContainer}>
      {/* Üst Bar: Geri Dön Butonu ve Başlık */}
      <View style={styles.ytHeaderBar}>
        <TouchableOpacity onPress={onBack} style={styles.ytBackBtn}>
          <Text style={styles.ytBackBtnText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.ytHeaderTitle}>YouTube Oynatıcı</Text>
        <View style={styles.ytCountBadge}>
          <Text style={styles.ytCountText}>{list.length}</Text>
        </View>
      </View>

      {/* 16:9 YouTube Video Oynatıcı */}
      {selectedVideo ? (
        <View style={styles.ytPlayerSection}>
          {/* Video Container (16:9) */}
          <View style={styles.ytVideoWrapper}>
            <VideoView
              ref={videoViewRef}
              player={player}
              style={styles.ytVideoView}
              contentFit="contain"
              nativeControls={false}
              allowsFullscreen={true}
            />

            {/* Video Ekranı Tıklama Alanı (Oynat / Durdur) */}
            <Pressable style={styles.ytVideoTouchArea} onPress={togglePlayPause}>
              {isPaused && (
                <View style={styles.ytBigPlayBadge} pointerEvents="none">
                  <Text style={styles.ytBigPlayIcon}>▶</Text>
                </View>
              )}
            </Pressable>

            {/* Doğrudan Video Üzeri Sağ Üst Tam Ekran Butonu */}
            <TouchableOpacity 
              style={styles.ytFloatingFullscreenBtn} 
              onPress={toggleFullscreen}
              activeOpacity={0.8}
            >
              <Text style={styles.ytFloatingFullscreenText}>⛶ Tam Ekran</Text>
            </TouchableOpacity>
          </View>

          {/* DEDİKASYON KONTROL PANELİ (Videonun Altında - Asla Arkada Kalmaz!) */}
          <View style={styles.ytControlsDeck}>
            {/* 1. Satır: Zaman Çubuğu (Scrubber Bar) */}
            <View style={styles.ytTimelineDeckRow}>
              <Text style={styles.ytTimeDeckText}>{formatTime(progress)}</Text>
              <Slider
                style={styles.ytSliderDeck}
                minimumValue={0}
                maximumValue={duration > 0 ? duration : 1}
                value={progress}
                onValueChange={handleSeek}
                minimumTrackTintColor="#ef4444"
                maximumTrackTintColor="rgba(255,255,255,0.25)"
                thumbTintColor="#ef4444"
              />
              <Text style={styles.ytTimeDeckText}>{formatTime(duration)}</Text>
            </View>

            {/* 2. Satır: Tuşlar: -10s, OYNAT/DURDUR, +10s, Hız, Tam Ekran */}
            <View style={styles.ytButtonsDeckRow}>
              <TouchableOpacity style={styles.ytDeckBtn} onPress={() => skipSeconds(-10)}>
                <Text style={styles.ytDeckBtnText}>⏪ -10s</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.ytDeckPlayBtn} onPress={togglePlayPause}>
                <Text style={styles.ytDeckPlayText}>{isPaused ? '▶ OYNAT' : '⏸ DURDUR'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.ytDeckBtn} onPress={() => skipSeconds(10)}>
                <Text style={styles.ytDeckBtnText}>+10s ⏩</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.ytDeckSpeedBtn} onPress={cycleSpeed}>
                <Text style={styles.ytDeckSpeedText}>⚡ {playbackSpeed}x</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.ytDeckFullscreenBtn} onPress={toggleFullscreen}>
                <Text style={styles.ytDeckFullscreenText}>⛶ Tam Ekran</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Video Başlığı & Meta Bilgisi */}
          <View style={styles.ytPlayerMeta}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ytActiveTitle} numberOfLines={2}>
                {getCleanTitle(selectedVideo.name)}
              </Text>
              <Text style={styles.ytActiveSub}>
                {selectedVideo.uploader && selectedVideo.uploader !== 'Genel' ? `@${selectedVideo.uploader} • ` : ''}
                {selectedVideo.isLocal ? 'Offline (Cihazda)' : 'Sunucu'}
                {selectedVideo.size ? ` • ${(selectedVideo.size / (1024*1024)).toFixed(1)} MB` : ''}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.ytNoSelection}>
          <Text style={{ color: '#888', fontSize: 14 }}>Aşağıdan izlemek için bir video seçin</Text>
        </View>
      )}

      {/* Video Kartları Galerisi (Gerçek Kapak Resimleri ile) */}
      <ScrollView style={styles.ytScrollView} contentContainerStyle={styles.ytScrollContent}>
        {list.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ color: '#666', fontSize: 14 }}>İndirilmiş YouTube videosu bulunamadı.</Text>
          </View>
        ) : (
          list.map((item, idx) => {
            const isPlaying = selectedVideo && selectedVideo.name === item.name;
            const sizeMb = item.size ? `${(item.size / (1024 * 1024)).toFixed(1)} MB` : '';
            const thumbPath = item.thumbnail || `/api/thumbnail/${item.platform || 'youtube'}/${item.name}`;
            const thumbUri = cleanIp.startsWith('http') ? `${cleanIp}${thumbPath}` : `http://${cleanIp}:3000${thumbPath}`;

            return (
              <TouchableOpacity
                key={item.name + idx}
                style={[styles.ytCard, isPlaying && styles.ytCardActive]}
                onPress={() => setSelectedVideo(item)}
                activeOpacity={0.8}
              >
                {/* 16:9 Gerçek Thumbnail Önizleme Kutusu */}
                <View style={styles.ytThumbnailBox}>
                  <Image 
                    source={{ uri: thumbUri }} 
                    style={StyleSheet.absoluteFill} 
                    resizeMode="cover" 
                  />
                  <View style={styles.ytPlayIconBadge}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>▶</Text>
                  </View>
                  <View style={styles.ytBadgeDuration}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>HD</Text>
                  </View>
                </View>

                {/* Video Başlığı & Detaylar */}
                <View style={styles.ytCardDetails}>
                  <Text style={[styles.ytCardTitle, isPlaying && { color: '#ef4444' }]} numberOfLines={2}>
                    {getCleanTitle(item.name)}
                  </Text>
                  <View style={styles.ytCardMetaRow}>
                    <Text style={styles.ytCardSize}>{item.uploader ? `@${item.uploader} • ` : ''}{sizeMb || 'Video'}</Text>
                    {isPlaying && (
                      <View style={styles.ytNowPlayingBadge}>
                        <Text style={styles.ytNowPlayingText}>Oynatılıyor</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ============================================
// MAIN APP COMPONENT
// ============================================
export default function App() {
  const [serverIp, setServerIp] = useState('192.168.1.4');
  const [isConnected, setIsConnected] = useState(false);
  const [serverVideos, setServerVideos] = useState([]);
  const [localVideos, setLocalVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState('');
  const [showDlModal, setShowDlModal] = useState(false);
  const [dlCurrentFile, setDlCurrentFile] = useState('');
  const [dlCurrentIdx, setDlCurrentIdx] = useState(0);
  const [dlTotalFiles, setDlTotalFiles] = useState(0);
  const [dlDoneFiles, setDlDoneFiles] = useState([]);
  const [dlSkippedFiles, setDlSkippedFiles] = useState(0);
  const dlCancelRef = useRef(false);
  
  // Mod: 'menu' (Ana Menü), 'instagram' (Reels), 'tiktok' (TikTok), 'youtube' (YouTube Stüdyo)
  const [currentMode, setCurrentMode] = useState('menu');
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [uiVisible, setUiVisible] = useState(true);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showJumpPrompt, setShowJumpPrompt] = useState(false);
  const [jumpIndex, setJumpIndex] = useState('');
  const [savedFolderUri, setSavedFolderUri] = useState(null);
  const [lastWatched, setLastWatched] = useState({ instagram: 0, tiktok: 0, youtube: 0 });
  const [selectedProfile, setSelectedProfile] = useState('all');
  
  const pagerRef = useRef(null);

  useEffect(() => {
    loadLocalVideos();
  }, []);

  // Kaydedilmiş klasör ve son pozisyonları yükle
  useEffect(() => {
    AsyncStorage.getItem('downloadFolderUri').then(uri => {
      if (uri) setSavedFolderUri(uri);
    });
    AsyncStorage.getItem('serverIp').then(ip => {
      if (ip) setServerIp(ip);
    });
    Promise.all([
      AsyncStorage.getItem('lastWatched_instagram'),
      AsyncStorage.getItem('lastWatched_tiktok'),
      AsyncStorage.getItem('lastWatched_youtube')
    ]).then(([ig, tt, yt]) => {
      setLastWatched({
        instagram: ig ? parseInt(ig, 10) : 0,
        tiktok: tt ? parseInt(tt, 10) : 0,
        youtube: yt ? parseInt(yt, 10) : 0
      });
    });
  }, []);

  const loadLocalVideos = async () => {
    try {
      const igDir = FileSystem.documentDirectory + 'reels/instagram/';
      const ttDir = FileSystem.documentDirectory + 'reels/tiktok/';
      const ytDir = FileSystem.documentDirectory + 'reels/youtube/';
      
      for (const dir of [igDir, ttDir, ytDir]) {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      let allLocal = [];
      const readDir = async (dir, plat) => {
        try {
          const files = await FileSystem.readDirectoryAsync(dir);
          return files.filter(f => f.endsWith('.mp4')).map(f => {
            const parts = f.replace('.mp4', '').split('_');
            const uploader = (parts.length >= 3 && parts[1] !== 'genel') ? parts[1] : 'Genel';
            return { uri: dir + f, name: f, isLocal: true, uploader, platform: plat };
          });
        } catch(e) { return []; }
      };

      const igVids = await readDir(igDir, 'instagram');
      const ttVids = await readDir(ttDir, 'tiktok');
      const ytVids = await readDir(ytDir, 'youtube');
      setLocalVideos([...igVids, ...ttVids, ...ytVids]);
    } catch (err) {
      console.log('Yerel video yükleme hatası:', err);
    }
  };

  const connectToServer = async () => {
    setLoading(true);
    try {
      const cleanIp = serverIp.trim();
      let fetchUrl = cleanIp.startsWith('http') ? `${cleanIp}/api/files` : `http://${cleanIp}:3000/api/files`;
      
      const res = await fetch(fetchUrl);
      const data = await res.json();
      if (data.files) {
        setServerVideos(data.files);
        setIsConnected(true);
        await AsyncStorage.setItem('serverIp', cleanIp);
        Alert.alert('Bağlandı!', `${data.files.length} video hazır.`);
      }
    } catch (err) {
      Alert.alert('Bağlantı Hatası', `Sunucuya ulaşılamadı. IP: ${serverIp.trim()}\nHata: ${err.message}`);
    }
    setLoading(false);
  };

  const scanForServer = async () => {
    setIsScanning(true);
    const subnets = ['192.168.1', '192.168.0', '192.168.2', '10.0.0'];
    const timeout = 1500;
    let found = false;

    for (const subnet of subnets) {
      if (found) break;
      const batch = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        batch.push(
          fetch(`http://${ip}:3000/api/files`, { signal: controller.signal })
            .then(async (res) => {
              clearTimeout(timer);
              const data = await res.json();
              if (data.files && !found) {
                found = true;
                setServerIp(ip);
                setServerVideos(data.files);
                setIsConnected(true);
                await AsyncStorage.setItem('serverIp', ip);
                Alert.alert('Sunucu Bulundu!', `${ip} adresinde ${data.files.length} video.`);
              }
            })
            .catch(() => { clearTimeout(timer); })
        );
      }
      await Promise.all(batch);
    }

    if (!found) {
      Alert.alert('Bulunamadı', 'Ağda sunucu tespit edilemedi. IP adresini elle girin.');
    }
    setIsScanning(false);
  };

  const downloadAll = async () => {
    if (serverVideos.length === 0) {
      Alert.alert('Bilgi', 'Sunucuda indirilecek video bulunamadı.');
      return;
    }

    let folderUri = savedFolderUri || await AsyncStorage.getItem('downloadFolderUri');
    if (!folderUri) {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) return;
      folderUri = permissions.directoryUri;
      setSavedFolderUri(folderUri);
      await AsyncStorage.setItem('downloadFolderUri', folderUri);
    }

    // Modal'ı aç ve başlangıç state'lerini ayarla
    dlCancelRef.current = false;
    setDownloading(true);
    setShowDlModal(true);
    setDlTotalFiles(serverVideos.length);
    setDlDoneFiles([]);
    setDlSkippedFiles(0);
    let count = 0;
    let skipped = 0;

    for (let i = 0; i < serverVideos.length; i++) {
      if (dlCancelRef.current) break;

      const file = serverVideos[i];
      const isTikTok = file.platform === 'tiktok' || file.name.includes('tiktok');
      const isYoutube = file.platform === 'youtube' || file.name.includes('youtube');
      const targetPlatform = isTikTok ? 'tiktok' : (isYoutube ? 'youtube' : 'instagram');
      const dir = FileSystem.documentDirectory + `reels/${targetPlatform}/`;
      const fileUri = dir + file.name;

      setDlCurrentIdx(i + 1);
      setDlCurrentFile(getCleanTitle(file.name));
      setDlProgress(`${i + 1}/${serverVideos.length} indiriliyor...`);

      const exists = await FileSystem.getInfoAsync(fileUri);
      if (!exists.exists) {
        try {
          const cleanIp = serverIp.trim();
          let downloadUrl = cleanIp.startsWith('http') ? `${cleanIp}${file.path}` : `http://${cleanIp}:3000${file.path}`;
          const downloadRes = await FileSystem.downloadAsync(downloadUrl, fileUri);
          const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: FileSystem.EncodingType.Base64 });
          const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(folderUri, file.name, 'video/mp4');
          await FileSystem.writeAsStringAsync(newFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
          count++;
          setDlDoneFiles(prev => [...prev, { name: getCleanTitle(file.name), platform: targetPlatform, status: 'ok' }]);
        } catch (e) {
          setDlDoneFiles(prev => [...prev, { name: getCleanTitle(file.name), platform: targetPlatform, status: 'error' }]);
        }
      } else {
        skipped++;
        setDlSkippedFiles(prev => prev + 1);
        setDlDoneFiles(prev => [...prev, { name: getCleanTitle(file.name), platform: targetPlatform, status: 'skipped' }]);
      }
    }

    setDownloading(false);
    setDlProgress('');
    if (!dlCancelRef.current) {
      setDlCurrentFile(`Tamamlandı! ${count} indirildi, ${skipped} zaten vardı.`);
    } else {
      setDlCurrentFile(`İptal edildi. ${count} indirildi.`);
    }
    loadLocalVideos();
  };

  const deleteAllOffline = async () => {
    Alert.alert(
      'Tüm Offline Videoları Sil',
      'İndirilen tüm videolar cihazdan silinecek. Emin misin?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Evet, Sil', style: 'destructive', onPress: async () => {
            try {
              const igDir = FileSystem.documentDirectory + 'reels/instagram/';
              const ttDir = FileSystem.documentDirectory + 'reels/tiktok/';
              const ytDir = FileSystem.documentDirectory + 'reels/youtube/';
              for (const dir of [igDir, ttDir, ytDir]) {
                const info = await FileSystem.getInfoAsync(dir);
                if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
              }
              setLocalVideos([]);
              setLastWatched({ instagram: 0, tiktok: 0, youtube: 0 });
              Alert.alert('Başarılı', 'Tüm offline videolar temizlendi.');
            } catch (err) {}
          }
        }
      ]
    );
  };

  const deleteVideo = async (item) => {
    Alert.alert('Video Silinsin mi?', item.name, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
          try {
            await FileSystem.deleteAsync(item.uri, { idempotent: true });
            setLocalVideos(prev => prev.filter(v => v.uri !== item.uri));
            setActiveIndex(prev => Math.max(0, prev - 1));
          } catch(e) {}
        }
      }
    ]);
  };

  // Platform bazlı listeler
  const getListForPlatform = (plat) => {
    const local = localVideos.filter(v => v.platform === plat);
    if (local.length > 0) return local;
    return serverVideos.filter(v => {
      if (plat === 'instagram') return v.platform === 'instagram' || v.name.includes('instagram') || v.name.includes('reels');
      if (plat === 'tiktok') return v.platform === 'tiktok' || v.name.includes('tiktok');
      if (plat === 'youtube') return v.platform === 'youtube' || v.name.includes('youtube');
      return false;
    });
  };

  const igList = useMemo(() => getListForPlatform('instagram'), [localVideos, serverVideos]);
  const ttList = useMemo(() => getListForPlatform('tiktok'), [localVideos, serverVideos]);
  const ytList = useMemo(() => getListForPlatform('youtube'), [localVideos, serverVideos]);

  const currentList = useMemo(() => {
    if (currentMode === 'instagram') return igList;
    if (currentMode === 'tiktok') return ttList;
    if (currentMode === 'youtube') return ytList;
    return [];
  }, [currentMode, igList, ttList, ytList]);

  // ============================================
  // EKRAN 1: ANA GİRİŞ / MOD SEÇİM DASHBOARD'U
  // ============================================
  if (currentMode === 'menu') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={['#0f1019', '#07070a']} style={styles.menuContainer}>
          
          {/* Header */}
          <View style={styles.menuHeader}>
            <Image source={require('./assets/logo.jpg')} style={styles.menuLogo} />
            <View>
              <Text style={styles.menuTitle}>Reels Studio</Text>
              <Text style={styles.menuSubtitle}>Video & Akış Merkezi</Text>
            </View>
          </View>

          {/* IP Bağlantı Çubuğu */}
          <View style={styles.ipBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ipLabel}>Sunucu IP</Text>
              <TextInput
                style={styles.ipInput}
                value={serverIp}
                onChangeText={setServerIp}
                keyboardType="decimal-pad"
                placeholder="192.168.1.X"
                placeholderTextColor="#666"
              />
            </View>
            <TouchableOpacity 
              style={styles.ipScanBtn} 
              onPress={scanForServer}
              disabled={isScanning}
            >
              {isScanning ? (
                <ActivityIndicator color="#00f2ea" size="small" />
              ) : (
                <Text style={styles.ipScanText}>Tara</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.ipConnectBtn, isConnected && { backgroundColor: '#10b981' }]} 
              onPress={connectToServer}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.ipConnectText}>{isConnected ? 'Bağlı' : 'Bağlan'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionHeaderTitle}>İzlemek İstediğin Modu Seç</Text>

          {/* 3 BÜYÜK MOD KARTI */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
            
            {/* KART 1: INSTAGRAM REELS */}
            <TouchableOpacity 
              style={[styles.modeCard, { borderColor: 'rgba(225, 48, 108, 0.4)' }]} 
              onPress={() => {
                setCurrentMode('instagram');
                const last = lastWatched.instagram || 0;
                setActiveIndex(last < igList.length ? last : 0);
              }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['rgba(225, 48, 108, 0.2)', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} />
              <View style={styles.modeCardContent}>
                <View style={[styles.modeIconCircle, { backgroundColor: '#E1306C' }]}>
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: 'bold' }}>IG</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeCardTitle}>Instagram Reels</Text>
                  <Text style={styles.modeCardDesc}>Dikey tam ekran akış</Text>
                  <Text style={styles.modeCardBadge}>{igList.length} Video</Text>
                </View>
                <Text style={styles.modeArrow}>{'>'}</Text>
              </View>
            </TouchableOpacity>

            {/* KART 2: TIKTOK */}
            <TouchableOpacity 
              style={[styles.modeCard, { borderColor: 'rgba(0, 242, 234, 0.4)' }]} 
              onPress={() => {
                setCurrentMode('tiktok');
                const last = lastWatched.tiktok || 0;
                setActiveIndex(last < ttList.length ? last : 0);
              }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['rgba(0, 242, 234, 0.15)', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} />
              <View style={styles.modeCardContent}>
                <View style={[styles.modeIconCircle, { backgroundColor: '#00f2ea' }]}>
                  <Text style={{ fontSize: 13, color: '#000', fontWeight: 'bold' }}>TT</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeCardTitle}>TikTok Keşfet</Text>
                  <Text style={styles.modeCardDesc}>Otomatik toplanan videolar</Text>
                  <Text style={[styles.modeCardBadge, { color: '#00f2ea', backgroundColor: 'rgba(0,242,234,0.15)' }]}>
                    {ttList.length} Video
                  </Text>
                </View>
                <Text style={styles.modeArrow}>{'>'}</Text>
              </View>
            </TouchableOpacity>

            {/* KART 3: YOUTUBE STÜDYO (AYRI GENİŞ EKRAN) */}
            <TouchableOpacity 
              style={[styles.modeCard, { borderColor: 'rgba(239, 68, 68, 0.5)' }]} 
              onPress={() => setCurrentMode('youtube')}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['rgba(239, 68, 68, 0.2)', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} />
              <View style={styles.modeCardContent}>
                <View style={[styles.modeIconCircle, { backgroundColor: '#ef4444' }]}>
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: 'bold' }}>YT</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeCardTitle}>YouTube Stüdyo</Text>
                  <Text style={styles.modeCardDesc}>Geniş ekran (16:9) galeri</Text>
                  <Text style={[styles.modeCardBadge, { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                    {ytList.length} Video
                  </Text>
                </View>
                <Text style={styles.modeArrow}>{'>'}</Text>
              </View>
            </TouchableOpacity>

            {/* İndirme & Ayar Butonları */}
            {isConnected && (
              <TouchableOpacity 
                style={styles.quickDownloadBtn} 
                onPress={downloading ? () => setShowDlModal(true) : downloadAll}
              >
                {downloading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#000" size="small" />
                    <Text style={styles.quickDownloadText}>{dlProgress || 'İndiriliyor...'}</Text>
                  </View>
                ) : (
                  <Text style={styles.quickDownloadText}>Tüm Videoları İndir ({serverVideos.length})</Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.deleteOfflineBtn} onPress={deleteAllOffline}>
              <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 13 }}>İndirilenleri Temizle</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* İNDİRME İLERLEMESİ MODALI */}
          <Modal
            visible={showDlModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {
              if (!downloading) setShowDlModal(false);
            }}
          >
            <View style={styles.dlModalOverlay}>
              <View style={styles.dlModalCard}>
                {/* Başlık & Kapatma */}
                <View style={styles.dlModalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 22 }}>📥</Text>
                    <View>
                      <Text style={styles.dlModalTitle}>Video İndirme Yöneticisi</Text>
                      <Text style={styles.dlModalSubtitle}>
                        {downloading 
                          ? `${dlCurrentIdx} / ${dlTotalFiles} işleniyor...` 
                          : 'İşlem Tamamlandı'}
                      </Text>
                    </View>
                  </View>
                  {!downloading && (
                    <TouchableOpacity onPress={() => setShowDlModal(false)} style={styles.dlCloseBtn}>
                      <Text style={styles.dlCloseBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* İlerleme Çubuğu */}
                <View style={styles.dlProgressContainer}>
                  <View style={styles.dlProgressBarBg}>
                    <View 
                      style={[
                        styles.dlProgressBarFill, 
                        { width: `${dlTotalFiles > 0 ? Math.min(100, Math.round((dlCurrentIdx / dlTotalFiles) * 100)) : 0}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.dlPercentText}>
                    %{dlTotalFiles > 0 ? Math.min(100, Math.round((dlCurrentIdx / dlTotalFiles) * 100)) : 0}
                  </Text>
                </View>

                {/* Aktif Dosya Bilgisi */}
                <View style={styles.dlCurrentFileBox}>
                  {downloading ? (
                    <ActivityIndicator size="small" color="#00f2ea" style={{ marginRight: 8 }} />
                  ) : (
                    <Text style={{ fontSize: 16, marginRight: 6 }}>✅</Text>
                  )}
                  <Text style={styles.dlCurrentFileName} numberOfLines={2}>
                    {dlCurrentFile || 'Hazırlanıyor...'}
                  </Text>
                </View>

                {/* İstatistik Rozetleri */}
                <View style={styles.dlStatsRow}>
                  <View style={[styles.dlStatBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                    <Text style={[styles.dlStatText, { color: '#10b981' }]}>
                      ✓ {dlDoneFiles.filter(f => f.status === 'ok').length} Yeni
                    </Text>
                  </View>
                  <View style={[styles.dlStatBadge, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                    <Text style={[styles.dlStatText, { color: '#f59e0b' }]}>
                      ⊘ {dlSkippedFiles} Zaten Var
                    </Text>
                  </View>
                  <View style={[styles.dlStatBadge, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                    <Text style={[styles.dlStatText, { color: '#ef4444' }]}>
                      ✗ {dlDoneFiles.filter(f => f.status === 'error').length} Hata
                    </Text>
                  </View>
                </View>

                {/* İndirilenler Listesi */}
                <Text style={styles.dlListTitle}>İşlem Detayları ({dlDoneFiles.length})</Text>
                <ScrollView style={styles.dlFilesList} contentContainerStyle={{ gap: 6 }}>
                  {dlDoneFiles.length === 0 ? (
                    <Text style={styles.dlEmptyListText}>İşlem başladığında indirilenler burada listelenecek...</Text>
                  ) : (
                    dlDoneFiles.slice().reverse().map((item, idx) => (
                      <View key={idx} style={styles.dlFileRow}>
                        <View style={[
                          styles.dlPlatformTag,
                          item.platform === 'youtube' ? { backgroundColor: 'rgba(239,68,68,0.2)' } :
                          item.platform === 'tiktok' ? { backgroundColor: 'rgba(0,242,234,0.2)' } :
                          { backgroundColor: 'rgba(225,48,108,0.2)' }
                        ]}>
                          <Text style={[
                            styles.dlPlatformTagText,
                            item.platform === 'youtube' ? { color: '#ef4444' } :
                            item.platform === 'tiktok' ? { color: '#00f2ea' } :
                            { color: '#e1306c' }
                          ]}>
                            {item.platform === 'youtube' ? 'YT' : item.platform === 'tiktok' ? 'TT' : 'IG'}
                          </Text>
                        </View>
                        <Text style={styles.dlRowFileName} numberOfLines={1}>{item.name}</Text>
                        <Text style={[
                          styles.dlRowStatus,
                          item.status === 'ok' ? { color: '#10b981' } :
                          item.status === 'skipped' ? { color: '#f59e0b' } :
                          { color: '#ef4444' }
                        ]}>
                          {item.status === 'ok' ? '✓ İndirildi' : item.status === 'skipped' ? '⊘ Mevcut' : '✗ Hata'}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* Alt Aksiyon Butonları */}
                <View style={styles.dlActionsRow}>
                  {downloading ? (
                    <>
                      <TouchableOpacity 
                        style={styles.dlCancelBtn} 
                        onPress={() => {
                          dlCancelRef.current = true;
                          setDlCurrentFile('İndirme durduruluyor...');
                        }}
                      >
                        <Text style={styles.dlCancelBtnText}>⏹ İndirmeyi Durdur</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.dlMinimizeBtn} 
                        onPress={() => setShowDlModal(false)}
                      >
                        <Text style={styles.dlMinimizeBtnText}>Gizle</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity 
                      style={styles.dlFinishBtn} 
                      onPress={() => setShowDlModal(false)}
                    >
                      <Text style={styles.dlFinishBtnText}>Tamamla & Kapat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </Modal>

        </LinearGradient>
      </View>
    );
  }

  // ============================================
  // EKRAN 2: YOUTUBE STÜDYO MODU
  // ============================================
  if (currentMode === 'youtube') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <YouTubeHub 
          list={ytList} 
          serverIp={serverIp} 
          onBack={() => setCurrentMode('menu')} 
          onDelete={deleteVideo} 
        />
      </View>
    );
  }

  // ============================================
  // EKRAN 3: DİKEY REELS & TIKTOK MODU (FERAH & TEMİZ HUD)
  // ============================================
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* TEMİZ & FERAH ÜST HUD */}
      {uiVisible && (
        <View style={styles.minimalHeader}>
          {/* Sol: Geri / Menü Butonu */}
          <TouchableOpacity onPress={() => setCurrentMode('menu')} style={styles.hudBackBtn}>
            <Text style={styles.hudBackText}>Menü</Text>
          </TouchableOpacity>

          {/* Orta: Platform Rozeti (tıkla değiştir) */}
          <TouchableOpacity 
            style={styles.hudPlatformBadge} 
            onPress={() => {
              const nextMode = currentMode === 'instagram' ? 'tiktok' : 'instagram';
              const nextList = nextMode === 'instagram' ? igList : ttList;
              if (nextList.length === 0) {
                Alert.alert('Bilgi', `${nextMode === 'instagram' ? 'Instagram' : 'TikTok'} videosu bulunamadı.`);
                return;
              }
              const last = lastWatched[nextMode] || 0;
              setActiveIndex(last < nextList.length ? last : 0);
              setCurrentMode(nextMode);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.hudPlatformText}>
              {currentMode === 'instagram' ? 'INSTAGRAM' : 'TIKTOK'}
            </Text>
          </TouchableOpacity>

          {/* Sağ: Sayaç Rozeti */}
          <TouchableOpacity style={styles.hudCounterBtn} onPress={() => setShowJumpPrompt(true)}>
            <Text style={styles.hudCounterText}>{activeIndex + 1} / {currentList.length}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dikey Kaydırıcı */}
      {currentList.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Bu bölümde video bulunamadı</Text>
          <TouchableOpacity onPress={() => setCurrentMode('menu')} style={[styles.connectBtn, { marginTop: 20 }]}>
            <Text style={styles.connectBtnText}>{'<'} Menüye Dön</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <PagerView 
          key={currentMode}
          ref={pagerRef}
          style={{ flex: 1 }} 
          initialPage={lastWatched[currentMode] || 0} 
          orientation="vertical"
          onPageScrollStateChanged={(e) => {
            setIsSwiping(e.nativeEvent.pageScrollState !== 'idle');
          }}
          onPageSelected={(e) => {
            const pos = e.nativeEvent.position;
            setActiveIndex(pos);
            setUiVisible(true);
            setLastWatched(prev => ({ ...prev, [currentMode]: pos }));
            AsyncStorage.setItem(`lastWatched_${currentMode}`, pos.toString());
          }}
        >
          {currentList.map((item, index) => (
            <View key={item.name + index} style={{ flex: 1 }}>
              <VideoSlide 
                item={item} 
                index={index} 
                activeIndex={activeIndex} 
                serverIp={serverIp} 
                onDelete={deleteVideo}
                uiVisible={uiVisible}
                setUiVisible={setUiVisible}
                isSwiping={isSwiping}
              />
            </View>
          ))}
        </PagerView>
      )}

      {/* Sayfa Atlama Modalı */}
      {showJumpPrompt && (
        <View style={styles.jumpOverlay}>
          <View style={styles.jumpBox}>
            <Text style={styles.jumpTitle}>Videoya Git (1 - {currentList.length})</Text>
            <TextInput
              style={styles.jumpInput}
              keyboardType="number-pad"
              autoFocus
              value={jumpIndex}
              onChangeText={setJumpIndex}
              placeholder="Örn: 25"
              placeholderTextColor="#888"
            />
            <View style={styles.jumpButtons}>
              <TouchableOpacity style={styles.jumpBtnCancel} onPress={() => setShowJumpPrompt(false)}>
                <Text style={styles.jumpBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.jumpBtnGo} 
                onPress={() => {
                  const idx = parseInt(jumpIndex, 10);
                  if (!isNaN(idx) && idx >= 1 && idx <= currentList.length) {
                    pagerRef.current?.setPageWithoutAnimation(idx - 1);
                    setActiveIndex(idx - 1);
                  }
                  setShowJumpPrompt(false);
                  setJumpIndex('');
                }}
              >
                <Text style={styles.jumpBtnText}>Git</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // ANA MENÜ DASHBOARD STİLLERİ
  menuContainer: { flex: 1, paddingTop: 55, paddingHorizontal: 20 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  menuLogo: { width: 50, height: 50, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  menuTitle: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  menuSubtitle: { color: '#888', fontSize: 13 },

  ipBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
  ipLabel: { color: '#888', fontSize: 11, marginBottom: 2, fontWeight: '600' },
  ipInput: { color: '#fff', fontSize: 16, fontWeight: 'bold', padding: 0 },
  ipScanBtn: { backgroundColor: 'rgba(0, 242, 234, 0.15)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0, 242, 234, 0.4)', marginRight: 8 },
  ipScanText: { color: '#00f2ea', fontWeight: 'bold', fontSize: 12 },
  ipConnectBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  ipConnectText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  sectionHeaderTitle: { color: '#aaa', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  // MOD KARTLARI
  modeCard: { borderRadius: 20, borderWidth: 1.5, overflow: 'hidden', minHeight: 95 },
  modeCardContent: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  modeIconCircle: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modeCardTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modeCardDesc: { color: '#999', fontSize: 12, marginTop: 2 },
  modeCardBadge: { alignSelf: 'flex-start', color: '#ff5e62', backgroundColor: 'rgba(255,94,98,0.15)', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 8 },
  modeArrow: { color: '#555', fontSize: 28, fontWeight: '300', marginLeft: 6 },

  quickDownloadBtn: { backgroundColor: '#00f2ea', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 10 },
  quickDownloadText: { color: '#000', fontWeight: '900', fontSize: 14 },
  deleteOfflineBtn: { alignItems: 'center', padding: 14, marginTop: 6 },

  // MİNİMAL REELS HUD (SIĞMA PROBLEMİ OLMAYAN)
  minimalHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, paddingTop: 50, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hudBackBtn: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  hudBackText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  hudPlatformBadge: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  hudPlatformText: { color: '#00f2ea', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  hudCounterBtn: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  hudCounterText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  // VIDEO VE KONTROLLER
  videoContainer: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  video: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gradientOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  pauseIconContainer: { position: 'absolute', top: '50%', left: '50%', marginTop: -25, marginLeft: -75, width: 150, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  pauseIconText: { color: '#fff', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },
  speedUpOverlay: { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  speedUpText: { color: '#00f2ea', fontWeight: 'bold', fontSize: 15 },

  sideActions: { position: 'absolute', right: 14, bottom: 155, zIndex: 35, gap: 14 },
  sideBtn: { alignItems: 'center' },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  actionBtnLabel: { color: '#fff', fontSize: 11, fontWeight: '800' },

  videoInfo: { position: 'absolute', bottom: 85, left: 16, right: 80, zIndex: 25 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeLocal: { backgroundColor: '#10b981' },
  badgeServer: { backgroundColor: '#3b82f6' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  videoName: { color: '#fff', fontSize: 14, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },

  scrubberContainer: { position: 'absolute', bottom: 35, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', zIndex: 30 },
  slider: { flex: 1, marginHorizontal: 8, height: 35 },
  timeText: { color: '#ddd', fontSize: 11, fontWeight: 'bold', width: 40, textAlign: 'center' },

  // YOUTUBE HUB STİLLERİ
  ytHubContainer: { flex: 1, backgroundColor: '#090a0f', paddingTop: 50 },
  ytHeaderBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14 },
  ytBackBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  ytBackBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  ytHeaderTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ytCountBadge: { backgroundColor: '#ef4444', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  ytCountText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  ytPlayerSection: { backgroundColor: '#000', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  ytVideoWrapper: { width: '100%', height: width * (9 / 16), backgroundColor: '#000', position: 'relative' },
  ytVideoView: { width: '100%', height: '100%' },
  ytVideoTouchArea: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  ytBigPlayBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  ytBigPlayIcon: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  ytFloatingFullscreenBtn: { position: 'absolute', bottom: 8, right: 8, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  ytFloatingFullscreenText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // Kontrol Deck (Videonun Altında - Asla Arkada Kalmaz)
  ytControlsDeck: { backgroundColor: '#12131c', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  ytTimelineDeckRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  ytTimeDeckText: { color: '#aaa', fontSize: 11, fontWeight: 'bold', minWidth: 38, textAlign: 'center' },
  ytSliderDeck: { flex: 1, height: 32 },
  ytButtonsDeckRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' },
  ytDeckBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ytDeckBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  ytDeckPlayBtn: { backgroundColor: '#ef4444', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, elevation: 3 },
  ytDeckPlayText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  ytDeckSpeedBtn: { backgroundColor: 'rgba(255,165,0,0.2)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,165,0,0.3)' },
  ytDeckSpeedText: { color: '#ffa500', fontSize: 11, fontWeight: 'bold' },
  ytDeckFullscreenBtn: { backgroundColor: 'rgba(59,130,246,0.2)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)' },
  ytDeckFullscreenText: { color: '#3b82f6', fontSize: 11, fontWeight: 'bold' },

  ytPlayerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#12131c' },
  ytActiveTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  ytActiveSub: { color: '#777', fontSize: 11, marginTop: 3 },
  ytNoSelection: { width: '100%', height: 160, justifyContent: 'center', alignItems: 'center', backgroundColor: '#12131c' },

  ytScrollView: { flex: 1 },
  ytScrollContent: { padding: 14, gap: 10, paddingBottom: 40 },
  ytCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', padding: 8, gap: 10 },
  ytCardActive: { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  ytThumbnailBox: { width: 110, height: 68, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#181822' },
  ytPlayIconBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(239, 68, 68, 0.9)', justifyContent: 'center', alignItems: 'center', paddingLeft: 2 },
  ytBadgeDuration: { position: 'absolute', bottom: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  ytCardDetails: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  ytCardTitle: { color: '#eee', fontSize: 12, fontWeight: '600', lineHeight: 16 },
  ytCardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  ytCardSize: { color: '#666', fontSize: 10 },
  ytNowPlayingBadge: { backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ytNowPlayingText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },

  // MODAL & JUMP
  jumpOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100, justifyContent: 'center', alignItems: 'center' },
  jumpBox: { backgroundColor: '#181924', padding: 22, borderRadius: 20, width: '80%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  jumpTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  jumpInput: { backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', width: '100%', padding: 12, borderRadius: 12, textAlign: 'center', fontSize: 18, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  jumpButtons: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', gap: 10 },
  jumpBtnCancel: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 12, alignItems: 'center' },
  jumpBtnGo: { flex: 1, backgroundColor: '#00f2ea', padding: 12, borderRadius: 12, alignItems: 'center' },
  jumpBtnText: { color: '#000', fontWeight: 'bold', fontSize: 14 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // İNDİRME MODALI STİLLERİ
  dlModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  dlModalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#161824',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    elevation: 12,
  },
  dlModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dlModalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dlModalSubtitle: {
    color: '#8b8e9f',
    fontSize: 12,
    marginTop: 2,
  },
  dlCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dlCloseBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dlProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  dlProgressBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  dlProgressBarFill: {
    height: '100%',
    backgroundColor: '#00f2ea',
    borderRadius: 4,
  },
  dlPercentText: {
    color: '#00f2ea',
    fontSize: 13,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'right',
  },
  dlCurrentFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dlCurrentFileName: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  dlStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 14,
  },
  dlStatBadge: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dlStatText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  dlListTitle: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dlFilesList: {
    maxHeight: 180,
    marginBottom: 14,
  },
  dlEmptyListText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  dlFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 8,
  },
  dlPlatformTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dlPlatformTagText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  dlRowFileName: {
    flex: 1,
    color: '#ddd',
    fontSize: 11,
  },
  dlRowStatus: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  dlActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dlCancelBtn: {
    flex: 2,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dlCancelBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: 'bold',
  },
  dlMinimizeBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dlMinimizeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  dlFinishBtn: {
    flex: 1,
    backgroundColor: '#00f2ea',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dlFinishBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
