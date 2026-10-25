import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  StyleSheet, Text, View, Dimensions, 
  TouchableOpacity, TextInput, ActivityIndicator, 
  Alert, StatusBar, Pressable, LogBox, Image, ScrollView, Modal, AppState 
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import Slider from '@react-native-community/slider';
import PagerView from 'react-native-pager-view';
import { LinearGradient } from 'expo-linear-gradient';

// Güvenli import: Expo Go'da native modüller olmayabilir
let activateKeepAwakeAsync = async () => {};
let deactivateKeepAwake = () => {};
let Notifications = null;

try {
  const keepAwake = require('expo-keep-awake');
  activateKeepAwakeAsync = keepAwake.activateKeepAwakeAsync;
  deactivateKeepAwake = keepAwake.deactivateKeepAwake;
} catch (e) {}

try {
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  Notifications = null;
}

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

LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  '[expo-notifications] Push notifications',
  'Push notifications (remote notifications) are unavailable in Expo Go',
  'Push notifications are unavailable in Expo Go',
]);

// Expo Go SDK 53+ Android uzaktan bildirim uyarısını konsoldan gizle
if (typeof console !== 'undefined' && console.warn) {
  const _warn = console.warn;
  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('expo-notifications') || args[0].includes('Push notifications'))
    ) {
      return;
    }
    _warn(...args);
  };
}

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
      <View style={[styles.videoContainer, { backgroundColor: '#09090b', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#e11d48" size="large" />
      </View>
    );
  }

  return <ActiveVideoSlide {...props} />;
}

function ActiveVideoSlide({
  item,
  index,
  activeIndex,
  serverIp,
  onDelete,
  onDownloadSingle,
  uiVisible,
  setUiVisible,
  isSwiping,
  isFavorite,
  onToggleFavorite,
  fitMode = 'contain',
  onToggleFit,
}) {
  const isActive = index === activeIndex;
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isSpeedUp, setIsSpeedUp] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showCenterIcon, setShowCenterIcon] = useState(null); // 'play' | 'pause'
  const centerIconTimer = useRef(null);
  const userPausedRef = useRef(false);
  const isHoldingFreezeRef = useRef(false);
  const isSpeedingUpRef = useRef(false);
  const wasPlayingBeforeFreezeRef = useRef(true);
  const touchX = useRef(0);

  const videoViewRef = useRef(null);

  const cleanIp = serverIp.trim();
  let serverVideoUri = '';
  if (cleanIp.startsWith('http')) {
    serverVideoUri = `${cleanIp}${item.path}`;
  } else {
    serverVideoUri = `http://${cleanIp}:3000${item.path}`;
  }
  const videoUri = item.isLocal ? item.uri : serverVideoUri;

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.muted = false;
  });

  // Native oynatıcı durumunu dinle (Tek gerçek kaynak)
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('playingChange', (payload) => {
      setIsPaused(!payload.isPlaying);
    });
    setIsPaused(!player.playing);
    return () => {
      try {
        sub.remove();
      } catch (e) {}
    };
  }, [player]);

  // Slayt aktif/pasif olduğunda veya kaydırılırken oynatma kontrolü
  useEffect(() => {
    if (!player) return;
    if (isActive && !isSwiping) {
      if (!userPausedRef.current) {
        try { player.play(); } catch (e) {}
      }
    } else {
      try { player.pause(); } catch (e) {}
    }
  }, [isActive, isSwiping, player]);

  // Slayttan çıkılınca durumu sıfırla (kaydırınca simgenin ekranda asılı kalmasını önler)
  useEffect(() => {
    if (!isActive) {
      userPausedRef.current = false;
      isHoldingFreezeRef.current = false;
      isSpeedingUpRef.current = false;
      setIsSpeedUp(false);
      setShowCenterIcon(null);
      if (centerIconTimer.current) clearTimeout(centerIconTimer.current);
    }
  }, [isActive]);

  useEffect(() => {
    let interval;
    if (isActive && player) {
      interval = setInterval(() => {
        setProgress(player.currentTime || 0);
        if (player.duration) setDuration(player.duration);
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isActive, player]);

  const triggerCenterIcon = (type) => {
    if (centerIconTimer.current) clearTimeout(centerIconTimer.current);
    setShowCenterIcon(type);
    centerIconTimer.current = setTimeout(() => setShowCenterIcon(null), 500);
  };

  const handlePressIn = (e) => {
    touchX.current = e.nativeEvent.pageX;
  };

  // Basılı tutma:
  // - Ekranın SAĞ tarafına basılı tutulursa (> width * 0.65) -> 2x Hız!
  // - Ortasına veya soluna basılı tutulursa -> DONDUR (Donar / Pause)!
  const handleLongPress = () => {
    if (!player) return;
    if (touchX.current > width * 0.65) {
      isSpeedingUpRef.current = true;
      try {
        player.playbackRate = 2.0;
        setIsSpeedUp(true);
      } catch (e) {}
    } else {
      isHoldingFreezeRef.current = true;
      wasPlayingBeforeFreezeRef.current = player.playing;
      if (player.playing) {
        try { player.pause(); } catch (e) {}
      }
    }
  };

  // Basılı tutma bırakıldığında:
  const handlePressOut = () => {
    // 2x hız bırakıldıysa normal hıza geri dön
    if (isSpeedingUpRef.current) {
      isSpeedingUpRef.current = false;
      setIsSpeedUp(false);
      if (player) {
        try { player.playbackRate = playbackSpeed; } catch (e) {}
      }
    }
    // Donma (freeze) bırakıldıysa oynatmaya devam et
    if (isHoldingFreezeRef.current) {
      isHoldingFreezeRef.current = false;
      if (wasPlayingBeforeFreezeRef.current && player) {
        try { player.play(); } catch (e) {}
      }
    }
  };

  // Normal tıklama (basıp bırakma): Oynat / Durdur (Don / Devam Et)
  const handlePress = () => {
    if (isHoldingFreezeRef.current || isSpeedingUpRef.current) return;
    if (!player) return;
    if (player.playing) {
      userPausedRef.current = true;
      try { player.pause(); } catch (e) {}
      triggerCenterIcon('pause');
    } else {
      userPausedRef.current = false;
      try { player.play(); } catch (e) {}
      triggerCenterIcon('play');
    }
  };

  const toggleMute = () => {
    if (player) {
      player.muted = !player.muted;
      setIsMuted(player.muted);
    }
  };

  const toggleFullscreen = () => {
    if (videoViewRef.current) videoViewRef.current.enterFullscreen();
  };

  const cycleSpeed = () => {
    if (!player) return;
    const speeds = [1.0, 1.25, 1.5, 2.0];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const next = speeds[nextIdx];
    player.playbackRate = next;
    setPlaybackSpeed(next);
  };

  const skipSeconds = (sec) => {
    if (!player) return;
    const newTime = Math.max(0, Math.min(duration || 0, (player.currentTime || 0) + sec));
    player.currentTime = newTime;
    setProgress(newTime);
  };

  const handleSeek = (value) => {
    if (player) {
      player.currentTime = value;
      setProgress(value);
    }
  };

  const platform = item.platform || (item.name.includes('tiktok') ? 'tiktok' : item.name.includes('twitter') ? 'x' : 'instagram');
  const sizeMb = item.size ? `${(item.size / (1024 * 1024)).toFixed(1)} MB` : '';

  return (
    <View style={styles.videoContainer}>
      <VideoView
        ref={videoViewRef}
        player={player}
        style={styles.video}
        contentFit={fitMode}
        nativeControls={false}
      />

      {/* Dokunma & Hızlı Kontrol Katmanı */}
      <Pressable
        style={[StyleSheet.absoluteFill, { zIndex: 5 }]}
        onPressIn={handlePressIn}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressOut={handlePressOut}
        delayLongPress={220}
      >
        {uiVisible && (
          <LinearGradient
            colors={['rgba(9, 9, 11, 0.75)', 'transparent', 'transparent', 'rgba(9, 9, 11, 0.95)']}
            style={styles.gradientOverlay}
            pointerEvents="none"
          />
        )}

        {/* Yalnızca Tıklandığında Anlık (500ms) Beliren Play/Pause Rozeti (Ekranda veya Kaydırmada Asla Asılı Kalmaz!) */}
        {showCenterIcon && (
          <View style={styles.centerFlashBadge} pointerEvents="none">
            <Text style={styles.centerFlashIcon}>
              {showCenterIcon === 'pause' ? '⏸' : '▶'}
            </Text>
          </View>
        )}

        {/* 2x Hız Göstergesi (Yalnızca Sağ Tarafa Basılı Tutulunca Görünür) */}
        {isSpeedUp && (
          <View style={styles.speedUpOverlay} pointerEvents="none">
            <Text style={styles.speedUpText}>⚡ 2x Hız</Text>
          </View>
        )}
      </Pressable>

      {uiVisible && (
        <>
          {/* Web Tarzı Sağ Eylem Çubuğu (Glassmorphism Column) */}
          <View style={styles.sideActions} pointerEvents="box-none">
            {/* 1. Ses Butonu (Mute/Unmute) */}
            <TouchableOpacity style={styles.sideBtn} onPress={toggleMute} activeOpacity={0.8}>
              <View style={[styles.iconCircle, isMuted && styles.iconCircleActive]}>
                <Text style={[styles.actionBtnLabel, isMuted && { color: '#fff' }]}>
                  {isMuted ? 'MUTE' : 'SES'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* 2. Format / Sığdırma (Fit Contain vs Cover) */}
            <TouchableOpacity style={styles.sideBtn} onPress={onToggleFit} activeOpacity={0.8}>
              <View style={[styles.iconCircle, fitMode === 'cover' && styles.iconCircleActive]}>
                <Text style={styles.actionBtnLabel}>
                  {fitMode === 'cover' ? 'TAM' : 'SIĞ'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* 3. Favori Kalp Butonu */}
            <TouchableOpacity
              style={styles.sideBtn}
              onPress={() => onToggleFavorite && onToggleFavorite(item)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconCircle, isFavorite && styles.iconCircleHeart]}>
                <Text style={{ fontSize: 18 }}>{isFavorite ? '❤️' : '🤍'}</Text>
              </View>
            </TouchableOpacity>

            {/* 4. Oynatma Hızı */}
            <TouchableOpacity style={styles.sideBtn} onPress={cycleSpeed} activeOpacity={0.8}>
              <View style={[styles.iconCircle, playbackSpeed !== 1.0 && styles.iconCircleActive]}>
                <Text style={styles.actionBtnLabel}>{playbackSpeed}x</Text>
              </View>
            </TouchableOpacity>

            {/* 5. Tam Ekran */}
            <TouchableOpacity style={styles.sideBtn} onPress={toggleFullscreen} activeOpacity={0.8}>
              <View style={styles.iconCircle}>
                <Text style={styles.actionBtnLabel}>⛶</Text>
              </View>
            </TouchableOpacity>

            {/* 6. Yerel Sil veya İndir */}
            {item.isLocal ? (
              <TouchableOpacity style={styles.sideBtn} onPress={() => onDelete(item)} activeOpacity={0.8}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(225, 29, 72, 0.45)', borderColor: '#e11d48' }]}>
                  <Text style={[styles.actionBtnLabel, { color: '#fff' }]}>SİL</Text>
                </View>
              </TouchableOpacity>
            ) : onDownloadSingle ? (
              <TouchableOpacity style={styles.sideBtn} onPress={() => onDownloadSingle(item)} activeOpacity={0.8}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(225, 29, 72, 0.25)', borderColor: 'rgba(225,29,72,0.6)' }]}>
                  <Text style={[styles.actionBtnLabel, { color: '#e11d48' }]}>İNDİR</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Alt Bilgi & Rozetler */}
          <View style={styles.videoInfo} pointerEvents="none">
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <View style={[styles.badge, styles.badgePlatform]}>
                <Text style={styles.badgePlatformText}>
                  {platform === 'tiktok' ? 'TIKTOK' : platform === 'x' ? 'X / TWITTER' : platform === 'youtube' ? 'YOUTUBE' : 'INSTAGRAM'}
                </Text>
              </View>
              <View style={[styles.badge, item.isLocal ? styles.badgeLocal : styles.badgeServer]}>
                <Text style={styles.badgeText}>{item.isLocal ? 'Offline' : 'Sunucu'}</Text>
              </View>
              {item.uploader && item.uploader !== 'Genel' && (
                <View style={[styles.badge, styles.badgeUploader]}>
                  <Text style={styles.badgeUploaderText}>@{item.uploader}</Text>
                </View>
              )}
              {sizeMb ? (
                <View style={[styles.badge, styles.badgeUploader]}>
                  <Text style={styles.badgeUploaderText}>{sizeMb}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.videoName} numberOfLines={2} ellipsizeMode="tail">
              {getCleanTitle(item.name)}
            </Text>
          </View>

          {/* Web Tarzı Alt Scrubber & Hızlı Sarma Kontrolleri */}
          <View style={styles.scrubberContainer}>
            <TouchableOpacity
              style={styles.skipBtnSmall}
              onPress={() => skipSeconds(-5)}
              activeOpacity={0.7}
            >
              <Text style={styles.skipBtnText}>-5s</Text>
            </TouchableOpacity>

            <Text style={styles.timeText}>{formatTime(progress)}</Text>

            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration > 0 ? duration : 1}
              value={progress}
              onValueChange={handleSeek}
              onSlidingComplete={handleSeek}
              minimumTrackTintColor="#e11d48"
              maximumTrackTintColor="rgba(255,255,255,0.22)"
              thumbTintColor="#e11d48"
            />

            <Text style={styles.timeText}>{formatTime(duration)}</Text>

            <TouchableOpacity
              style={styles.skipBtnSmall}
              onPress={() => skipSeconds(5)}
              activeOpacity={0.7}
            >
              <Text style={styles.skipBtnText}>+5s</Text>
            </TouchableOpacity>
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

  // Native oynatıcı durumunu dinle
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('playingChange', (p) => {
      setIsPaused(!p.isPlaying);
    });
    setIsPaused(!player.playing);
    return () => {
      try { sub.remove(); } catch (e) {}
    };
  }, [player]);

  useEffect(() => {
    if (player && selectedVideo) {
      try { player.play(); } catch (e) {}
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
    if (player.playing) {
      try { player.pause(); } catch (e) {}
    } else {
      try { player.play(); } catch (e) {}
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
  
  // Mod: 'menu' (Ana Menü), 'all' (Tüm Videolar), 'tiktok', 'x' (X / Twitter), 'instagram', 'youtube', 'favorites'
  const [currentMode, setCurrentMode] = useState('menu');
  const [favorites, setFavorites] = useState([]);
  const [fitMode, setFitMode] = useState('contain'); // 'contain' | 'cover'
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [uiVisible, setUiVisible] = useState(true);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showJumpPrompt, setShowJumpPrompt] = useState(false);
  const [jumpIndex, setJumpIndex] = useState('');
  const [savedFolderUri, setSavedFolderUri] = useState(null);
  const [lastWatched, setLastWatched] = useState({ instagram: 0, tiktok: 0, youtube: 0, x: 0, all: 0 });
  const [selectedProfile, setSelectedProfile] = useState('all');
  
  const pagerRef = useRef(null);

  useEffect(() => {
    loadLocalVideos();
  }, []);

  // Favorileri yükle
  useEffect(() => {
    AsyncStorage.getItem('video_pro_favorites_v1').then(stored => {
      try {
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setFavorites(parsed.map(item => typeof item === 'string' ? item : (item.id || item.url || item.path || '')));
          }
        }
      } catch (e) {}
    });
  }, []);

  const toggleFavorite = async (video) => {
    const key = video.uri || video.path || video.name;
    let next;
    if (favorites.includes(key)) {
      next = favorites.filter(k => k !== key);
    } else {
      next = [...favorites, key];
    }
    setFavorites(next);
    try {
      await AsyncStorage.setItem('video_pro_favorites_v1', JSON.stringify(next));
    } catch (e) {}
  };

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
      AsyncStorage.getItem('lastWatched_youtube'),
      AsyncStorage.getItem('lastWatched_x'),
      AsyncStorage.getItem('lastWatched_all')
    ]).then(([ig, tt, yt, x, all]) => {
      setLastWatched({
        instagram: ig ? parseInt(ig, 10) : 0,
        tiktok: tt ? parseInt(tt, 10) : 0,
        youtube: yt ? parseInt(yt, 10) : 0,
        x: x ? parseInt(x, 10) : 0,
        all: all ? parseInt(all, 10) : 0,
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

  // Klasör seçme fonksiyonu (hem ilk seçim hem değiştirme için)
  const pickDownloadFolder = async () => {
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) return null;
      const folderUri = permissions.directoryUri;
      setSavedFolderUri(folderUri);
      await AsyncStorage.setItem('downloadFolderUri', folderUri);
      Alert.alert('Klasör Seçildi', 'İndirme klasörü başarıyla ayarlandı.');
      return folderUri;
    } catch (e) {
      Alert.alert('Hata', 'Klasör seçilirken bir hata oluştu.');
      return null;
    }
  };

  // Klasörün geçerli olup olmadığını kontrol et
  const validateFolder = async (folderUri) => {
    if (!folderUri) return false;
    try {
      // SAF URI'nin geçerli olduğunu test et
      await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
      return true;
    } catch (e) {
      return false;
    }
  };

  // İndirme tamamlandığında tek seferlik bildirim (isteğe bağlı ve sessiz)
  const showDownloadCompleteNotification = async (count, skipped) => {
    if (!Notifications) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✅ İndirme Tamamlandı',
          body: `${count} yeni video indirildi${skipped > 0 ? `, ${skipped} zaten vardı` : ''}`,
          data: { type: 'download_complete' },
        },
        trigger: null,
      });
    } catch (e) {}
  };

  const downloadAll = async () => {
    if (serverVideos.length === 0) {
      Alert.alert('Bilgi', 'Sunucuda indirilecek video bulunamadı.');
      return;
    }

    // Klasör URI'sini al veya sor
    let folderUri = savedFolderUri || await AsyncStorage.getItem('downloadFolderUri');
    
    // Klasör geçerli mi kontrol et
    if (folderUri) {
      const isValid = await validateFolder(folderUri);
      if (!isValid) {
        Alert.alert(
          'Klasör Hatası',
          'Önceki indirme klasörü artık geçerli değil. Lütfen yeni bir klasör seçin.',
        );
        folderUri = null;
        setSavedFolderUri(null);
        await AsyncStorage.removeItem('downloadFolderUri');
      }
    }
    
    if (!folderUri) {
      folderUri = await pickDownloadFolder();
      if (!folderUri) return;
    }

    // Arka plan desteği: Ekranı uyanık tut
    try {
      await activateKeepAwakeAsync('download');
    } catch (e) {}

    // Platform klasörlerini döngüye girmeden önce bir defada hazırla (Hız optimizasyonu)
    for (const plat of ['instagram', 'tiktok', 'youtube', 'twitter', 'x']) {
      try {
        const platDir = FileSystem.documentDirectory + `reels/${plat}/`;
        const dirInfo = await FileSystem.getInfoAsync(platDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(platDir, { intermediates: true });
        }
      } catch (e) {}
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
          // Önce dahili depolamaya indir
          const downloadRes = await FileSystem.downloadAsync(downloadUrl, fileUri);
          
          // Sonra SAF ile harici klasöre kopyala
          try {
            const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: FileSystem.EncodingType.Base64 });
            const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(folderUri, file.name, 'video/mp4');
            await FileSystem.writeAsStringAsync(newFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
          } catch (safError) {
            console.log('SAF kopyalama hatası (dahili yine de kaydedildi):', safError.message);
          }
          
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

    // İndirme bitti: ekranı serbest bırak, tamamlandı bildirimi göster
    try {
      deactivateKeepAwake('download');
    } catch (e) {}

    setDownloading(false);
    setDlProgress('');
    if (!dlCancelRef.current) {
      setDlCurrentFile(`Tamamlandı! ${count} indirildi, ${skipped} zaten vardı.`);
      await showDownloadCompleteNotification(count, skipped);
    } else {
      setDlCurrentFile(`İptal edildi. ${count} indirildi.`);
    }
    loadLocalVideos();
  };

  // Harici SAF Klasöründeki Videoları Temizleme Fonksiyonu
  const executeSafClean = async (folderUri) => {
    try {
      let safDeleted = 0;
      let safFiles = [];
      try {
        safFiles = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
      } catch (readErr) {
        console.log('SAF okuma hatası:', readErr);
      }

      if (safFiles && safFiles.length > 0) {
        for (const fileUri of safFiles) {
          try {
            const dec = decodeURIComponent(fileUri).toLowerCase();
            // Video uzantıları veya platform isimleri içeren dosyalar
            if (dec.endsWith('.mp4') || dec.includes('.mp4') || dec.includes('video') || dec.includes('reels') || dec.includes('tiktok') || dec.includes('twitter') || dec.includes('instagram')) {
              try {
                // SAF dosyaları StorageAccessFramework.deleteAsync ile silinir!
                await FileSystem.StorageAccessFramework.deleteAsync(fileUri);
                safDeleted++;
              } catch (delErr1) {
                try {
                  await FileSystem.deleteAsync(fileUri, { idempotent: true });
                  safDeleted++;
                } catch (delErr2) {}
              }
            }
          } catch (e) {
            console.log('Dosya silinemedi:', fileUri, e);
          }
        }
      }

      setLocalVideos([]);
      setLastWatched({ instagram: 0, tiktok: 0, youtube: 0, x: 0, all: 0 });
      Alert.alert(
        'Temizlendi!',
        `Tüm reels videoları başarıyla silindi.${safDeleted > 0 ? `\n\n• ${safDeleted} video seçili harici klasörden silindi.` : ''}\n• Uygulama içi tüm önbellek boşaltıldı.`
      );
      loadLocalVideos();
    } catch (err) {
      Alert.alert('Bilgi', 'Uygulama içi depolama temizlendi: ' + err.message);
    }
  };

  const deleteAllOffline = async () => {
    Alert.alert(
      'Tüm Videoları Sil',
      'İndirilen tüm reels videoları hem cihazın klasöründen hem de uygulamadan tamamen silinecektir. Devam edilsin mi?',
      [
        { text: 'İptal', style: 'cancel' },
        { 
          text: 'Evet, Tümünü Sil', 
          style: 'destructive', 
          onPress: async () => {
            try {
              // 1) Dahili uygulama klasörlerini temizle
              const internalDirs = [
                FileSystem.documentDirectory + 'reels/instagram/',
                FileSystem.documentDirectory + 'reels/tiktok/',
                FileSystem.documentDirectory + 'reels/youtube/',
                FileSystem.documentDirectory + 'reels/twitter/',
                FileSystem.documentDirectory + 'reels/x/',
                FileSystem.documentDirectory + 'reels/',
              ];

              for (const dir of internalDirs) {
                try {
                  const info = await FileSystem.getInfoAsync(dir);
                  if (info && info.exists) {
                    await FileSystem.deleteAsync(dir, { idempotent: true });
                  }
                } catch (e) {}
              }

              // Yeniden boş klasörleri oluştur
              for (const dir of [
                FileSystem.documentDirectory + 'reels/instagram/',
                FileSystem.documentDirectory + 'reels/tiktok/',
                FileSystem.documentDirectory + 'reels/youtube/',
                FileSystem.documentDirectory + 'reels/twitter/',
              ]) {
                try {
                  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
                } catch (e) {}
              }

              // 2) Harici SAF klasörünü kontrol et
              let folderUri = savedFolderUri || await AsyncStorage.getItem('downloadFolderUri');

              if (!folderUri) {
                Alert.alert(
                  'Klasör Doğrulama',
                  'Cihazınızdaki indirme klasörünü seçerek oradaki tüm videoları da silmek ister misiniz?',
                  [
                    { 
                      text: 'Yalnızca Dahiliyi Sil', 
                      style: 'cancel', 
                      onPress: () => {
                        setLocalVideos([]);
                        Alert.alert('Tamamlandı', 'Uygulama içi tüm videolar temizlendi.');
                        loadLocalVideos();
                      }
                    },
                    {
                      text: 'Klasörü Seç & Sil',
                      onPress: async () => {
                        const picked = await pickDownloadFolder();
                        if (picked) {
                          await executeSafClean(picked);
                        }
                      }
                    }
                  ]
                );
                return;
              }

              await executeSafClean(folderUri);

            } catch (err) {
              Alert.alert('Hata', 'Silme sırasında bir hata oluştu: ' + err.message);
            }
          }
        }
      ]
    );
  };

  const deleteVideo = async (item) => {
    Alert.alert('Video Silinsin mi?', item.name, [
      { text: 'İptal', style: 'cancel' },
      { 
        text: 'Sil', 
        style: 'destructive', 
        onPress: async () => {
          try {
            // 1. item.uri sil (SAF ise StorageAccessFramework.deleteAsync)
            if (item.uri) {
              if (item.uri.startsWith('content://')) {
                try {
                  await FileSystem.StorageAccessFramework.deleteAsync(item.uri);
                } catch (e) {
                  await FileSystem.deleteAsync(item.uri, { idempotent: true });
                }
              } else {
                await FileSystem.deleteAsync(item.uri, { idempotent: true });
              }
            }

            // 2. Harici klasörde de varsa onu da temizle
            const folderUri = savedFolderUri || await AsyncStorage.getItem('downloadFolderUri');
            if (folderUri) {
              try {
                const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(folderUri);
                for (const fUri of files) {
                  if (decodeURIComponent(fUri).includes(item.name)) {
                    await FileSystem.StorageAccessFramework.deleteAsync(fUri);
                  }
                }
              } catch (e) {}
            }

            setLocalVideos(prev => prev.filter(v => v.uri !== item.uri && v.name !== item.name));
            setActiveIndex(prev => Math.max(0, prev - 1));
          } catch(e) {
            Alert.alert('Hata', 'Video silinemedi: ' + e.message);
          }
        }
      }
    ]);
  };

  // Tekil video indirme (VideoSlide yan menüsünden)
  const downloadSingleVideo = async (file) => {
    try {
      let folderUri = savedFolderUri || await AsyncStorage.getItem('downloadFolderUri');
      const isTikTok = file.platform === 'tiktok' || file.name.includes('tiktok');
      const isTwitter = file.platform === 'x' || file.platform === 'twitter' || file.name.includes('twitter');
      const isYoutube = file.platform === 'youtube' || file.name.includes('youtube');
      const targetPlatform = isTikTok ? 'tiktok' : (isTwitter ? 'twitter' : (isYoutube ? 'youtube' : 'instagram'));
      const dir = FileSystem.documentDirectory + `reels/${targetPlatform}/`;
      const fileUri = dir + file.name;

      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      const cleanIp = serverIp.trim();
      let downloadUrl = cleanIp.startsWith('http') ? `${cleanIp}${file.path}` : `http://${cleanIp}:3000${file.path}`;
      const downloadRes = await FileSystem.downloadAsync(downloadUrl, fileUri);

      if (folderUri) {
        try {
          const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: FileSystem.EncodingType.Base64 });
          const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(folderUri, file.name, 'video/mp4');
          await FileSystem.writeAsStringAsync(newFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
        } catch (e) {}
      }
      Alert.alert('İndirildi!', `"${getCleanTitle(file.name)}" cihazına kaydedildi.`);
      loadLocalVideos();
    } catch (err) {
      Alert.alert('İndirme Hatası', err.message);
    }
  };

  // Platform bazlı listeler
  const getListForPlatform = (plat) => {
    if (plat === 'favorites') {
      const source = serverVideos.length > 0 ? serverVideos : localVideos;
      return source.filter(v => favorites.includes(v.uri || v.path || v.name));
    }
    if (plat === 'all') {
      return serverVideos.length > 0 ? serverVideos : localVideos;
    }
    const local = localVideos.filter(v => {
      if (plat === 'x') return v.platform === 'x' || v.platform === 'twitter' || v.name.includes('twitter');
      return v.platform === plat;
    });
    if (local.length > 0) return local;

    return serverVideos.filter(v => {
      if (plat === 'instagram') return v.platform === 'instagram' || v.name.includes('instagram') || v.name.includes('reels');
      if (plat === 'tiktok') return v.platform === 'tiktok' || v.name.includes('tiktok');
      if (plat === 'x') return v.platform === 'x' || v.platform === 'twitter' || v.name.includes('twitter');
      if (plat === 'youtube') return v.platform === 'youtube' || v.name.includes('youtube');
      return false;
    });
  };

  const allList = useMemo(() => getListForPlatform('all'), [localVideos, serverVideos]);
  const igList = useMemo(() => getListForPlatform('instagram'), [localVideos, serverVideos]);
  const ttList = useMemo(() => getListForPlatform('tiktok'), [localVideos, serverVideos]);
  const xList = useMemo(() => getListForPlatform('x'), [localVideos, serverVideos]);
  const ytList = useMemo(() => getListForPlatform('youtube'), [localVideos, serverVideos]);
  const favList = useMemo(() => getListForPlatform('favorites'), [localVideos, serverVideos, favorites]);

  const currentList = useMemo(() => {
    if (currentMode === 'all') return allList;
    if (currentMode === 'instagram') return igList;
    if (currentMode === 'tiktok') return ttList;
    if (currentMode === 'x') return xList;
    if (currentMode === 'youtube') return ytList;
    if (currentMode === 'favorites') return favList;
    return [];
  }, [currentMode, allList, igList, ttList, xList, ytList, favList]);

  // ============================================
  // EKRAN 1: ANA GİRİŞ / MOD SEÇİM DASHBOARD'U
  // ============================================
  if (currentMode === 'menu') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={['#09090b', '#121217', '#09090b']} style={styles.menuContainer}>
          
          {/* Header (Web Sitesi İle Uyumlu Siyah & Kırmızı) */}
          <View style={styles.menuHeader}>
            <Image source={require('./assets/logo.jpg')} style={styles.menuLogo} />
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.menuTitle}>Reels İndirici</Text>
                <View style={styles.headerProBadge}>
                  <Text style={styles.headerProText}>PRO</Text>
                </View>
              </View>
              <Text style={styles.menuSubtitle}>Video & Akış Merkezi</Text>
            </View>
          </View>

          {/* IP Bağlantı Çubuğu (Kırmızı/Antrasit Glass) */}
          <View style={styles.ipBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ipLabel}>SUNUCU IP ADRESİ</Text>
              <TextInput
                style={styles.ipInput}
                value={serverIp}
                onChangeText={setServerIp}
                keyboardType="decimal-pad"
                placeholder="192.168.1.X"
                placeholderTextColor="#71717a"
              />
            </View>
            <TouchableOpacity 
              style={styles.ipScanBtn} 
              onPress={scanForServer}
              disabled={isScanning}
            >
              {isScanning ? (
                <ActivityIndicator color="#e11d48" size="small" />
              ) : (
                <Text style={styles.ipScanText}>TARA</Text>
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
                <Text style={styles.ipConnectText}>{isConnected ? '✓ BAĞLI' : 'BAĞLAN'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionHeaderTitle}>İzlemek İstediğin Akışı Seç</Text>

          {/* MOD KARTLARI (Siyah & Kırmızı Modern Kartlar) */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 35 }}>
            
            {/* KART 0: TÜM VİDEOLAR / ARŞİV */}
            <TouchableOpacity 
              style={[styles.modeCard, { borderColor: 'rgba(225, 29, 72, 0.5)' }]} 
              onPress={() => {
                setCurrentMode('all');
                const last = lastWatched.all || 0;
                setActiveIndex(last < allList.length ? last : 0);
              }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['rgba(225, 29, 72, 0.25)', 'rgba(18, 18, 23, 0.85)']} style={StyleSheet.absoluteFill} />
              <View style={styles.modeCardContent}>
                <View style={[styles.modeIconCircle, { backgroundColor: '#e11d48' }]}>
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: 'bold' }}>ALL</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeCardTitle}>Tüm Videolar (Arşiv)</Text>
                  <Text style={styles.modeCardDesc}>TikTok, Twitter, Instagram hepsi bir arada</Text>
                  <Text style={[styles.modeCardBadge, { color: '#e11d48', backgroundColor: 'rgba(225,29,72,0.18)' }]}>
                    {allList.length} Video
                  </Text>
                </View>
                <Text style={styles.modeArrow}>{'>'}</Text>
              </View>
            </TouchableOpacity>

            {/* KART 1: TIKTOK */}
            <TouchableOpacity 
              style={[styles.modeCard, { borderColor: 'rgba(255, 255, 255, 0.15)' }]} 
              onPress={() => {
                setCurrentMode('tiktok');
                const last = lastWatched.tiktok || 0;
                setActiveIndex(last < ttList.length ? last : 0);
              }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['rgba(225, 29, 72, 0.15)', 'rgba(18, 18, 23, 0.85)']} style={StyleSheet.absoluteFill} />
              <View style={styles.modeCardContent}>
                <View style={[styles.modeIconCircle, { backgroundColor: '#181820', borderWidth: 1, borderColor: '#e11d48' }]}>
                  <Text style={{ fontSize: 13, color: '#e11d48', fontWeight: '900' }}>TT</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeCardTitle}>TikTok Keşfet</Text>
                  <Text style={styles.modeCardDesc}>Otomatik toplanan dikey videolar</Text>
                  <Text style={[styles.modeCardBadge, { color: '#e11d48', backgroundColor: 'rgba(225,29,72,0.15)' }]}>
                    {ttList.length} Video
                  </Text>
                </View>
                <Text style={styles.modeArrow}>{'>'}</Text>
              </View>
            </TouchableOpacity>

            {/* KART 2: X / TWITTER */}
            <TouchableOpacity 
              style={[styles.modeCard, { borderColor: 'rgba(255, 255, 255, 0.15)' }]} 
              onPress={() => {
                setCurrentMode('x');
                const last = lastWatched.x || 0;
                setActiveIndex(last < xList.length ? last : 0);
              }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['rgba(255, 255, 255, 0.06)', 'rgba(18, 18, 23, 0.85)']} style={StyleSheet.absoluteFill} />
              <View style={styles.modeCardContent}>
                <View style={[styles.modeIconCircle, { backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }]}>
                  <Text style={{ fontSize: 14, color: '#fff', fontWeight: '900' }}>𝕏</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeCardTitle}>X / Twitter Akışı</Text>
                  <Text style={styles.modeCardDesc}>Kullanıcı profilleri ve taranan videolar</Text>
                  <Text style={[styles.modeCardBadge, { color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                    {xList.length} Video
                  </Text>
                </View>
                <Text style={styles.modeArrow}>{'>'}</Text>
              </View>
            </TouchableOpacity>

            {/* KART 3: INSTAGRAM REELS */}
            <TouchableOpacity 
              style={[styles.modeCard, { borderColor: 'rgba(225, 48, 108, 0.4)' }]} 
              onPress={() => {
                setCurrentMode('instagram');
                const last = lastWatched.instagram || 0;
                setActiveIndex(last < igList.length ? last : 0);
              }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['rgba(225, 48, 108, 0.2)', 'rgba(18, 18, 23, 0.85)']} style={StyleSheet.absoluteFill} />
              <View style={styles.modeCardContent}>
                <View style={[styles.modeIconCircle, { backgroundColor: '#c13584' }]}>
                  <Text style={{ fontSize: 13, color: '#fff', fontWeight: 'bold' }}>IG</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeCardTitle}>Instagram Reels</Text>
                  <Text style={styles.modeCardDesc}>Dikey tam ekran akış</Text>
                  <Text style={[styles.modeCardBadge, { color: '#e1306c', backgroundColor: 'rgba(225,48,108,0.15)' }]}>
                    {igList.length} Video
                  </Text>
                </View>
                <Text style={styles.modeArrow}>{'>'}</Text>
              </View>
            </TouchableOpacity>

            {/* KART 4: YOUTUBE STÜDYO (16:9 GENİŞ EKRAN) */}
            <TouchableOpacity 
              style={[styles.modeCard, { borderColor: 'rgba(239, 68, 68, 0.5)' }]} 
              onPress={() => setCurrentMode('youtube')}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['rgba(239, 68, 68, 0.2)', 'rgba(18, 18, 23, 0.85)']} style={StyleSheet.absoluteFill} />
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

            {/* KART 5: FAVORİLER */}
            {favList.length > 0 && (
              <TouchableOpacity 
                style={[styles.modeCard, { borderColor: 'rgba(225, 29, 72, 0.5)' }]} 
                onPress={() => {
                  setCurrentMode('favorites');
                  setActiveIndex(0);
                }}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['rgba(225, 29, 72, 0.25)', 'rgba(18, 18, 23, 0.85)']} style={StyleSheet.absoluteFill} />
                <View style={styles.modeCardContent}>
                  <View style={[styles.modeIconCircle, { backgroundColor: '#e11d48' }]}>
                    <Text style={{ fontSize: 16 }}>❤️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modeCardTitle}>Favorilerim</Text>
                    <Text style={styles.modeCardDesc}>Kalp eklenen özel videolar</Text>
                    <Text style={[styles.modeCardBadge, { color: '#e11d48', backgroundColor: 'rgba(225,29,72,0.18)' }]}>
                      {favList.length} Video
                    </Text>
                  </View>
                  <Text style={styles.modeArrow}>{'>'}</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Hızlı İndir Butonu (Canlı Kırmızı Web Teması) */}
            {isConnected && (
              <TouchableOpacity 
                style={styles.quickDownloadBtn} 
                onPress={downloading ? () => setShowDlModal(true) : downloadAll}
                activeOpacity={0.85}
              >
                {downloading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.quickDownloadText}>{dlProgress || 'İndiriliyor...'}</Text>
                  </View>
                ) : (
                  <Text style={styles.quickDownloadText}>Tüm Videoları Cihaza İndir ({serverVideos.length})</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Klasör Seçme / Değiştirme Butonu */}
            <TouchableOpacity 
              style={styles.folderSelectBtn} 
              onPress={pickDownloadFolder}
            >
              <Text style={styles.folderSelectText}>
                📁 {savedFolderUri ? 'İndirme Klasörünü Değiştir' : 'İndirme Klasörü Seç'}
              </Text>
              {savedFolderUri && (
                <Text style={styles.folderPathText} numberOfLines={1}>
                  {decodeURIComponent(savedFolderUri).split('/').pop() || 'Seçili'}
                </Text>
              )}
            </TouchableOpacity>

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

                {/* İlerleme Çubuğu (Kırmızı) */}
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
                    <ActivityIndicator size="small" color="#e11d48" style={{ marginRight: 8 }} />
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
                  <View style={[styles.dlStatBadge, { backgroundColor: 'rgba(225,29,72,0.15)' }]}>
                    <Text style={[styles.dlStatText, { color: '#e11d48' }]}>
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
                          item.platform === 'tiktok' ? { backgroundColor: 'rgba(225,29,72,0.2)' } :
                          { backgroundColor: 'rgba(225,48,108,0.2)' }
                        ]}>
                          <Text style={[
                            styles.dlPlatformTagText,
                            item.platform === 'youtube' ? { color: '#ef4444' } :
                            item.platform === 'tiktok' ? { color: '#e11d48' } :
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
  // EKRAN 3: DİKEY REELS & PLAYER (WEB SİTESİ TARZI ÜST BAR & HUD)
  // ============================================
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* WEB SİTESİ GİBİ ÜST HUD BAR */}
      {uiVisible && (
        <View style={styles.minimalHeader}>
          {/* Sol: Geri / Menü Butonu */}
          <TouchableOpacity onPress={() => setCurrentMode('menu')} style={styles.hudBackBtn} activeOpacity={0.7}>
            <Text style={styles.hudBackText}>← Menü</Text>
          </TouchableOpacity>

          {/* Orta: Web Sitesi Tarzı Platform Filtre Çubuğu (Yatay Kaydırılabilir) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hudTabsScroll}
            style={styles.hudTabsContainer}
          >
            {[
              { id: 'all', label: 'TÜMÜ' },
              { id: 'tiktok', label: 'TIKTOK' },
              { id: 'x', label: '𝕏 TWITTER' },
              { id: 'instagram', label: 'INSTAGRAM' },
              ...(favList.length > 0 ? [{ id: 'favorites', label: '❤️ FAVORİ' }] : []),
            ].map((tab) => {
              const isSelected = currentMode === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.hudTabBtn, isSelected && styles.hudTabBtnActive]}
                  onPress={() => {
                    setCurrentMode(tab.id);
                    setActiveIndex(0);
                    pagerRef.current?.setPageWithoutAnimation(0);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.hudTabBtnText, isSelected && styles.hudTabBtnTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Sağ Eylemler: Fit Toggle & Sayaç */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={[styles.hudFitBtn, fitMode === 'cover' && styles.hudFitBtnActive]}
              onPress={() => setFitMode(prev => prev === 'contain' ? 'cover' : 'contain')}
              activeOpacity={0.7}
            >
              <Text style={styles.hudFitText}>{fitMode === 'cover' ? 'TAM' : 'SIĞ'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.hudCounterBtn} onPress={() => setShowJumpPrompt(true)}>
              <Text style={styles.hudCounterText}>{activeIndex + 1}/{currentList.length}</Text>
            </TouchableOpacity>
          </View>
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
            <View key={(item.uri || item.path || item.name) + index} style={{ flex: 1 }}>
              <VideoSlide 
                item={item} 
                index={index} 
                activeIndex={activeIndex} 
                serverIp={serverIp} 
                onDelete={deleteVideo}
                onDownloadSingle={downloadSingleVideo}
                uiVisible={uiVisible}
                setUiVisible={setUiVisible}
                isSwiping={isSwiping}
                isFavorite={favorites.includes(item.uri || item.path || item.name)}
                onToggleFavorite={toggleFavorite}
                fitMode={fitMode}
                onToggleFit={() => setFitMode(prev => prev === 'contain' ? 'cover' : 'contain')}
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
  container: { flex: 1, backgroundColor: '#09090b' },

  // ANA MENÜ DASHBOARD STİLLERİ (Web Sitesi Siyah & Kırmızı Teması)
  menuContainer: { flex: 1, paddingTop: 55, paddingHorizontal: 20 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  menuLogo: { width: 50, height: 50, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.4)' },
  menuTitle: { color: '#ffffff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  menuSubtitle: { color: '#a1a1aa', fontSize: 13, marginTop: 1 },
  headerProBadge: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  headerProText: { color: '#ffffff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  // IP Bağlantı Çubuğu (Glassmorphism Koyu Kırmızı Vurgu)
  ipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 23, 0.85)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
  },
  ipLabel: { color: '#a1a1aa', fontSize: 10, marginBottom: 2, fontWeight: '700', letterSpacing: 0.5 },
  ipInput: { color: '#ffffff', fontSize: 15, fontWeight: 'bold', padding: 0 },
  ipScanBtn: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.35)',
    marginRight: 8,
  },
  ipScanText: { color: '#e11d48', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  ipConnectBtn: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  ipConnectText: { color: '#ffffff', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },

  sectionHeaderTitle: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },

  // MOD KARTLARI (Siyah & Kırmızı Web Teması)
  modeCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 90,
    backgroundColor: '#121217',
  },
  modeCardContent: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  modeIconCircle: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modeCardTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  modeCardDesc: { color: '#a1a1aa', fontSize: 12, marginTop: 2 },
  modeCardBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 8,
  },
  modeArrow: { color: '#52525b', fontSize: 24, fontWeight: '300', marginLeft: 6 },

  quickDownloadBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  quickDownloadText: { color: '#ffffff', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
  folderSelectBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  folderSelectText: { color: '#e4e4e7', fontWeight: 'bold', fontSize: 13 },
  folderPathText: { color: '#71717a', fontSize: 11, marginTop: 4 },
  deleteOfflineBtn: { alignItems: 'center', padding: 14, marginTop: 6 },

  // MİNİMAL REELS HUD (WEB SİTESİ TARZI ÜST BAR)
  minimalHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingTop: 50,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(9, 9, 11, 0.75)',
  },
  hudBackBtn: {
    backgroundColor: 'rgba(18, 18, 23, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  hudBackText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },

  hudTabsContainer: { flex: 1, marginHorizontal: 8 },
  hudTabsScroll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  hudTabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  hudTabBtnActive: {
    backgroundColor: '#e11d48',
    borderColor: '#e11d48',
  },
  hudTabBtnText: { color: '#a1a1aa', fontWeight: '700', fontSize: 11 },
  hudTabBtnTextActive: { color: '#ffffff', fontWeight: '900' },

  hudFitBtn: {
    backgroundColor: 'rgba(18, 18, 23, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  hudFitBtnActive: {
    backgroundColor: 'rgba(225, 29, 72, 0.3)',
    borderColor: '#e11d48',
  },
  hudFitText: { color: '#ffffff', fontWeight: 'bold', fontSize: 11 },

  hudCounterBtn: {
    backgroundColor: 'rgba(18, 18, 23, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  hudCounterText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },

  // VIDEO VE KONTROLLER
  videoContainer: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  video: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gradientOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },

  // Web Sitesi Gibi Merkez Flash İkon
  centerFlashBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -40,
    marginLeft: -40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(9, 9, 11, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(225, 29, 72, 0.5)',
  },
  centerFlashIcon: { color: '#ffffff', fontSize: 32, fontWeight: 'bold' },

  speedUpOverlay: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(9, 9, 11, 0.85)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.4)',
  },
  speedUpText: { color: '#e11d48', fontWeight: '900', fontSize: 14 },

  // Sağ Yan Eylemler (Web Tarzı Glassmorphism Sütun)
  sideActions: { position: 'absolute', right: 14, bottom: 155, zIndex: 35, gap: 12 },
  sideBtn: { alignItems: 'center' },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(18, 18, 23, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  iconCircleActive: {
    backgroundColor: '#e11d48',
    borderColor: '#e11d48',
  },
  iconCircleHeart: {
    backgroundColor: 'rgba(225, 29, 72, 0.25)',
    borderColor: '#e11d48',
  },
  actionBtnLabel: { color: '#ffffff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  // Alt Bilgi & Rozetler
  videoInfo: { position: 'absolute', bottom: 85, left: 16, right: 80, zIndex: 25 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7 },
  badgePlatform: { backgroundColor: 'rgba(225, 29, 72, 0.2)', borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.4)' },
  badgePlatformText: { color: '#e11d48', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  badgeLocal: { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.4)' },
  badgeServer: { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)' },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  badgeUploader: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  badgeUploaderText: { color: '#a1a1aa', fontSize: 10, fontWeight: '600' },
  videoName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  // Web Tarzı Alt Scrubber & 5s Butonları
  scrubberContainer: {
    position: 'absolute',
    bottom: 35,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 30,
    backgroundColor: 'rgba(9, 9, 11, 0.65)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  playPauseScrubberBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(225, 29, 72, 0.25)',
    borderWidth: 1,
    borderColor: '#e11d48',
    marginRight: 4,
  },
  playPauseScrubberIcon: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  skipBtnSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  skipBtnText: { color: '#e4e4e7', fontSize: 10, fontWeight: '900' },
  slider: { flex: 1, marginHorizontal: 6, height: 35 },
  timeText: { color: '#e4e4e7', fontSize: 10, fontWeight: 'bold', minWidth: 36, textAlign: 'center' },

  // YOUTUBE HUB STİLLERİ (Web Sitesi Siyah & Kırmızı)
  ytHubContainer: { flex: 1, backgroundColor: '#09090b', paddingTop: 50 },
  ytHeaderBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14 },
  ytBackBtn: { backgroundColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ytBackBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  ytHeaderTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  ytCountBadge: { backgroundColor: '#e11d48', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  ytCountText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold' },

  ytPlayerSection: { backgroundColor: '#000', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)' },
  ytVideoWrapper: { width: '100%', height: width * (9 / 16), backgroundColor: '#000', position: 'relative' },
  ytVideoView: { width: '100%', height: '100%' },
  ytVideoTouchArea: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  ytBigPlayBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(9, 9, 11, 0.75)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#e11d48' },
  ytBigPlayIcon: { color: '#ffffff', fontSize: 26, fontWeight: 'bold' },
  ytFloatingFullscreenBtn: { position: 'absolute', bottom: 8, right: 8, zIndex: 10, backgroundColor: 'rgba(9, 9, 11, 0.8)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)' },
  ytFloatingFullscreenText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold' },

  // Kontrol Deck
  ytControlsDeck: { backgroundColor: '#121217', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.08)' },
  ytTimelineDeckRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  ytTimeDeckText: { color: '#a1a1aa', fontSize: 11, fontWeight: 'bold', minWidth: 38, textAlign: 'center' },
  ytSliderDeck: { flex: 1, height: 32 },
  ytButtonsDeckRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' },
  ytDeckBtn: { backgroundColor: 'rgba(255, 255, 255, 0.06)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  ytDeckBtnText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  ytDeckPlayBtn: { backgroundColor: '#e11d48', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, elevation: 3 },
  ytDeckPlayText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  ytDeckSpeedBtn: { backgroundColor: 'rgba(225, 29, 72, 0.15)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.3)' },
  ytDeckSpeedText: { color: '#e11d48', fontSize: 11, fontWeight: 'bold' },
  ytDeckFullscreenBtn: { backgroundColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  ytDeckFullscreenText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold' },

  ytPlayerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#121217' },
  ytActiveTitle: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  ytActiveSub: { color: '#71717a', fontSize: 11, marginTop: 3 },
  ytNoSelection: { width: '100%', height: 160, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121217' },

  ytScrollView: { flex: 1 },
  ytScrollContent: { padding: 14, gap: 10, paddingBottom: 40 },
  ytCard: { flexDirection: 'row', backgroundColor: '#121217', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden', padding: 8, gap: 10 },
  ytCardActive: { borderColor: '#e11d48', backgroundColor: 'rgba(225, 29, 72, 0.1)' },
  ytThumbnailBox: { width: 110, height: 68, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#181820' },
  ytPlayIconBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(225, 29, 72, 0.9)', justifyContent: 'center', alignItems: 'center', paddingLeft: 2 },
  ytBadgeDuration: { position: 'absolute', bottom: 3, right: 3, backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  ytCardDetails: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  ytCardTitle: { color: '#f4f4f5', fontSize: 12, fontWeight: '600', lineHeight: 16 },
  ytCardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  ytCardSize: { color: '#71717a', fontSize: 10 },
  ytNowPlayingBadge: { backgroundColor: '#e11d48', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ytNowPlayingText: { color: '#ffffff', fontSize: 9, fontWeight: 'bold' },

  // MODAL & JUMP
  jumpOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9, 9, 11, 0.85)', zIndex: 100, justifyContent: 'center', alignItems: 'center' },
  jumpBox: { backgroundColor: '#121217', padding: 22, borderRadius: 20, width: '82%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.3)' },
  jumpTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
  jumpInput: { backgroundColor: 'rgba(255, 255, 255, 0.06)', color: '#ffffff', width: '100%', padding: 12, borderRadius: 12, textAlign: 'center', fontSize: 18, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  jumpButtons: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', gap: 10 },
  jumpBtnCancel: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)', padding: 12, borderRadius: 12, alignItems: 'center' },
  jumpBtnGo: { flex: 1, backgroundColor: '#e11d48', padding: 12, borderRadius: 12, alignItems: 'center' },
  jumpBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  connectBtn: { backgroundColor: '#e11d48', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  connectBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },

  // İNDİRME MODALI STİLLERİ
  dlModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  dlModalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#121217',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.25)',
    elevation: 12,
  },
  dlModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dlModalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dlModalSubtitle: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
  },
  dlCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dlCloseBtnText: {
    color: '#ffffff',
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  dlProgressBarFill: {
    height: '100%',
    backgroundColor: '#e11d48',
    borderRadius: 4,
  },
  dlPercentText: {
    color: '#e11d48',
    fontSize: 13,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'right',
  },
  dlCurrentFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dlCurrentFileName: {
    flex: 1,
    color: '#ffffff',
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
    color: '#71717a',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dlFilesList: {
    maxHeight: 180,
    marginBottom: 14,
  },
  dlEmptyListText: {
    color: '#71717a',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  dlFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
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
    color: '#e4e4e7',
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
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.4)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dlCancelBtnText: {
    color: '#e11d48',
    fontSize: 13,
    fontWeight: 'bold',
  },
  dlMinimizeBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dlMinimizeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  dlFinishBtn: {
    flex: 1,
    backgroundColor: '#e11d48',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dlFinishBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
