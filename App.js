import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  StyleSheet, Text, View, Dimensions, 
  TouchableOpacity, TextInput, ActivityIndicator, 
  Alert, StatusBar, Pressable, LogBox 
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import Slider from '@react-native-community/slider';
import PagerView from 'react-native-pager-view';
import { LinearGradient } from 'expo-linear-gradient';

LogBox.ignoreLogs(['Cannot connect to Expo CLI']);

const { width, height } = Dimensions.get('window');

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function VideoSlide(props) {
  const isAdjacent = Math.abs(props.index - props.activeIndex) <= 1;

  if (!isAdjacent) {
    return (
      <View style={[styles.videoContainer, { backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#E1306C" />
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
  const [isLongPressPause, setIsLongPressPause] = useState(false);
  const [fitMode, setFitMode] = useState('contain'); // contain = sığdır, cover = kırp
  
  const touchX = useRef(0);
  const longPressTimer = useRef(null);
  const isLongPressRef = useRef(false);
  
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

  // Sayfa değiştiğinde pause/speed state'lerini sıfırla
  useEffect(() => {
    if (!isActive) {
      setIsPaused(false);
      setIsSpeedUp(false);
      setIsLongPressPause(false);
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      isLongPressRef.current = false;
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
    if (player) player.muted = !player.muted;
  };

  const toggleFit = () => {
    setFitMode(prev => prev === 'contain' ? 'cover' : 'contain');
  };

  // Manuel dokunma yönetimi (Pressable yerine)
  const onTouchStart = (e) => {
    touchX.current = e.nativeEvent.locationX;
    isLongPressRef.current = false;
    
    longPressTimer.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (!player) return;
      
      // Kenarlardan basılı tutma = 2x hız
      if (touchX.current > width * 0.75 || touchX.current < width * 0.25) {
        if (!isPaused) {
          player.playbackRate = 2.0;
          setIsSpeedUp(true);
        }
      } else {
        // Ortadan basılı tutma = dondur + UI gizle
        setIsPaused(true);
        setIsLongPressPause(true);
        setUiVisible(false);
      }
    }, 300);
  };

  const onTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (isLongPressRef.current) {
      // Basılı tutma bitti
      if (player) {
        player.playbackRate = 1.0;
        setIsSpeedUp(false);
      }
      if (isLongPressPause) {
        setIsPaused(false);
        setIsLongPressPause(false);
        setUiVisible(true);
      }
      isLongPressRef.current = false;
    } else {
      // Kısa tıklama = durdur/devam et + UI aç/kapa
      setIsPaused(prev => !prev);
      setUiVisible(prev => !prev);
    }
  };

  const onTouchMove = () => {
    // Parmak hareket ettiyse long press'i iptal et (kaydırma olabilir)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleSeek = (value) => {
    if (player) {
      player.currentTime = value;
      setProgress(value);
    }
  };

  const showSlideUi = uiVisible && !isLongPressPause;

  return (
    <View style={styles.videoContainer}>
      <View 
        style={styles.videoTouchable}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
      >
        <VideoView
          player={player}
          style={styles.video}
          contentFit={fitMode}
          nativeControls={false}
        />
        
        {showSlideUi && (
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent', 'transparent', 'rgba(0,0,0,0.9)']}
            style={styles.gradientOverlay}
            pointerEvents="none"
          />
        )}

        {isPaused && !isLongPressPause && (
          <View style={styles.pauseIconContainer} pointerEvents="none">
            <Text style={styles.pauseIcon}>⏸</Text>
          </View>
        )}

        {isSpeedUp && (
          <View style={styles.speedUpOverlay} pointerEvents="none">
            <Text style={styles.speedUpText}>⏩ 2x</Text>
          </View>
        )}
      </View>

      {showSlideUi && (
        <>
          {/* Sağ Menü */}
          <View style={styles.sideActions} pointerEvents="box-none">
            <TouchableOpacity style={styles.sideBtn} onPress={toggleMute}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>🔊</Text>
              </View>
              <Text style={styles.sideLabel}>Ses</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sideBtn} onPress={toggleFit}>
              <View style={[styles.iconCircle, { backgroundColor: fitMode === 'cover' ? 'rgba(59,130,246,0.7)' : 'rgba(255,255,255,0.2)' }]}>
                <Text style={styles.iconText}>{fitMode === 'contain' ? '⛶' : '🔲'}</Text>
              </View>
              <Text style={styles.sideLabel}>{fitMode === 'contain' ? 'Kırp' : 'Sığdır'}</Text>
            </TouchableOpacity>
            
            {item.isLocal && (
              <TouchableOpacity style={styles.sideBtn} onPress={() => onDelete(item)}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.7)' }]}>
                  <Text style={styles.iconText}>🗑️</Text>
                </View>
                <Text style={styles.sideLabel}>Sil</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Alt Bilgiler */}
          <View style={styles.videoInfo} pointerEvents="none">
            <View style={[styles.badge, item.isLocal ? styles.badgeLocal : styles.badgeServer]}>
              <Text style={styles.badgeText}>{item.isLocal ? '📱 Offline' : '☁️ Sunucu'}</Text>
            </View>
            <Text style={styles.videoName} numberOfLines={2}>{item.name}</Text>
          </View>

          {/* İlerleme Çubuğu */}
          <View style={styles.scrubberContainer}>
            <Text style={styles.timeText}>{formatTime(progress)}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration > 0 ? duration : 1}
              value={progress}
              onValueChange={handleSeek}
              onSlidingComplete={handleSeek}
              minimumTrackTintColor="#fff"
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#fff"
            />
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

export default function App() {
  const [serverIp, setServerIp] = useState('192.168.1.2');
  const [isConnected, setIsConnected] = useState(false);
  const [serverVideos, setServerVideos] = useState([]);
  const [localVideos, setLocalVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState('');
  const [platform, setPlatform] = useState('instagram');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showSetup, setShowSetup] = useState(true);
  const [uiVisible, setUiVisible] = useState(true);
  const [isSwiping, setIsSwiping] = useState(false);

  useEffect(() => {
    loadLocalVideos();
  }, [platform]);

  const loadLocalVideos = async () => {
    try {
      const igDir = FileSystem.documentDirectory + 'reels/instagram/';
      const ttDir = FileSystem.documentDirectory + 'reels/tiktok/';
      
      for (const dir of [igDir, ttDir]) {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      const dir = platform === 'instagram' ? igDir : ttDir;
      const files = await FileSystem.readDirectoryAsync(dir);
      const vids = files
        .filter(f => f.endsWith('.mp4'))
        .map(f => ({ uri: dir + f, name: f, isLocal: true }));
      
      setLocalVideos(vids);
      if (vids.length > 0) setShowSetup(false);
    } catch (err) {
      console.log('Yerel video hatası:', err);
    }
  };

  const connectToServer = async () => {
    setLoading(true);
    try {
      const cleanIp = serverIp.trim();
      let fetchUrl = '';
      if (cleanIp.startsWith('http')) {
        fetchUrl = `${cleanIp}/api/files`;
      } else {
        fetchUrl = `http://${cleanIp}:3000/api/files`;
      }
      const res = await fetch(fetchUrl);
      const data = await res.json();
      if (data.files) {
        setServerVideos(data.files);
        setIsConnected(true);
        setShowSetup(false);
        Alert.alert('Bağlandı!', `${data.files.length} video bulundu.`);
      }
    } catch (err) {
      Alert.alert('Bağlantı Hatası', `Sunucuya ulaşılamadı. IP: ${serverIp.trim()}\nHata: ${err.message}`);
    }
    setLoading(false);
  };

  const downloadAll = async () => {
    const platformVideos = serverVideos.filter(v => 
      platform === 'instagram' 
        ? (v.name.includes('reels') || v.name.includes('instagram'))
        : (v.name.includes('tiktok'))
    );

    if (platformVideos.length === 0) return;

    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return;

    setDownloading(true);
    const dir = FileSystem.documentDirectory + `reels/${platform}/`;
    let count = 0;

    for (let i = 0; i < platformVideos.length; i++) {
      const file = platformVideos[i];
      const fileUri = dir + file.name;
      setDlProgress(`${i + 1}/${platformVideos.length} indiriliyor...`);

      const exists = await FileSystem.getInfoAsync(fileUri);
      if (!exists.exists) {
        try {
          const cleanIp = serverIp.trim();
          let downloadUrl = '';
          if (cleanIp.startsWith('http')) {
            downloadUrl = `${cleanIp}${file.path}`;
          } else {
            downloadUrl = `http://${cleanIp}:3000${file.path}`;
          }
          const downloadRes = await FileSystem.downloadAsync(downloadUrl, fileUri);
          const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: FileSystem.EncodingType.Base64 });
          const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, file.name, 'video/mp4');
          await FileSystem.writeAsStringAsync(newFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
          count++;
        } catch (e) {
          console.log('İndirme hatası:', e);
        }
      }
    }

    setDownloading(false);
    setDlProgress('');
    Alert.alert('Tamamlandı!', `${count} video indirildi!`);
    loadLocalVideos();
  };

  const deleteAllOffline = async () => {
    Alert.alert(
      'Tümünü Sil',
      'İndirilen TÜM videolar uygulamadan silinecek. Emin misin?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Evet, Sil', style: 'destructive', onPress: async () => {
            try {
              const igDir = FileSystem.documentDirectory + 'reels/instagram/';
              const ttDir = FileSystem.documentDirectory + 'reels/tiktok/';
              
              const igFiles = await FileSystem.readDirectoryAsync(igDir);
              for (const f of igFiles) await FileSystem.deleteAsync(igDir + f);
              
              const ttFiles = await FileSystem.readDirectoryAsync(ttDir);
              for (const f of ttFiles) await FileSystem.deleteAsync(ttDir + f);
              
              Alert.alert('Başarılı', 'Tüm offline videolar silindi!');
              loadLocalVideos();
            } catch (err) {
              console.log(err);
            }
          }
        }
      ]
    );
  };

  const deleteVideo = async (item) => {
    Alert.alert(
      'Emin misin?',
      'Bu video uygulamadan kalıcı olarak silinecek.',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: async () => {
            try {
              await FileSystem.deleteAsync(item.uri);
              loadLocalVideos();
            } catch (err) {
              console.log('Silme hatası:', err);
            }
          }
        }
      ]
    );
  };

  const currentList = localVideos.length > 0 ? localVideos : 
    serverVideos.filter(v => 
      platform === 'instagram' 
        ? (v.name.includes('reels') || v.name.includes('instagram'))
        : (v.name.includes('tiktok'))
    );

  if (showSetup) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={['#1a1a2e', '#050508']} style={styles.setupContainer}>
          <Text style={styles.setupEmoji}>📱</Text>
          <Text style={styles.setupTitle}>Reels Player</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Bilgisayar IP Adresi</Text>
            <TextInput
              style={styles.input}
              value={serverIp}
              onChangeText={setServerIp}
              keyboardType="decimal-pad"
              placeholder="192.168.1.X"
              placeholderTextColor="#555"
            />
          </View>

          <TouchableOpacity style={styles.connectBtn} onPress={connectToServer} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.connectBtnText}>🔗 Bağlan</Text>}
          </TouchableOpacity>

          {localVideos.length > 0 && (
            <TouchableOpacity style={styles.offlineBtn} onPress={() => setShowSetup(false)}>
              <Text style={styles.offlineBtnText}>🚀 Offline Videoları İzle</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.deleteBtn} onPress={deleteAllOffline}>
            <Text style={styles.deleteBtnText}>🗑️ Tüm Offline Videoları Temizle</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Header UI - Sadece dokununca görünür/kaybolur */}
      {uiVisible && (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowSetup(true)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>⚙️</Text>
          </TouchableOpacity>
          <View style={styles.tabRow}>
            <TouchableOpacity 
              style={[styles.tab, platform === 'instagram' && styles.tabActiveIg]}
              onPress={() => { setPlatform('instagram'); setActiveIndex(0); }}
            >
              <Text style={styles.tabText}>📸 Insta</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tab, platform === 'tiktok' && styles.tabActiveTt]}
              onPress={() => { setPlatform('tiktok'); setActiveIndex(0); }}
            >
              <Text style={styles.tabText}>🎵 TikTok</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.counter}>{currentList.length}</Text>
        </View>
      )}

      {currentList.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Henüz video yok</Text>
        </View>
      ) : (
        <PagerView 
          style={{ flex: 1 }} 
          initialPage={0} 
          orientation="vertical"
          onPageScrollStateChanged={(e) => {
            if (e.nativeEvent.pageScrollState !== 'idle') {
              setIsSwiping(true);
            } else {
              setIsSwiping(false);
            }
          }}
          onPageSelected={(e) => {
            setActiveIndex(e.nativeEvent.position);
            setUiVisible(true); // Yeni videoya geçince UI'yi göster
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

      {/* Alt Bar - İndirme (Sadece UI açıkken ve bağlıyken görünür) */}
      {isConnected && uiVisible && (
        <View style={styles.bottomBar}>
          {downloading ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.progressText}>{dlProgress}</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.downloadBtn} onPress={downloadAll}>
              <Text style={styles.downloadBtnText}>📥 Tümünü Cihaza İndir</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  setupContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  setupEmoji: { fontSize: 60, marginBottom: 10 },
  setupTitle: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 40 },
  inputGroup: { width: '100%', marginBottom: 20 },
  inputLabel: { color: '#aaa', fontSize: 13, marginBottom: 8, marginLeft: 4, fontWeight: '600' },
  input: { width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', padding: 18, borderRadius: 16, fontSize: 18, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  connectBtn: { width: '100%', backgroundColor: '#3b82f6', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  connectBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  offlineBtn: { width: '100%', backgroundColor: '#10b981', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 16 },
  offlineBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  deleteBtn: { width: '100%', padding: 16, marginTop: 40, alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 16 },
  deleteBtnText: { color: '#ef4444', fontSize: 15, fontWeight: 'bold' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 15, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' },
  backBtnText: { fontSize: 20 },
  tabRow: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(0,0,0,0.4)', padding: 4, borderRadius: 24 },
  tab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  tabActiveIg: { backgroundColor: '#E1306C' },
  tabActiveTt: { backgroundColor: '#00f2ea' },
  tabText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  counter: { color: '#fff', fontSize: 15, fontWeight: 'bold', minWidth: 40, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },

  videoContainer: { flex: 1, backgroundColor: '#000' },
  videoTouchable: { flex: 1 },
  video: { width: '100%', height: '100%' },
  gradientOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  
  pauseIconContainer: { position: 'absolute', top: '50%', left: '50%', marginTop: -40, marginLeft: -40, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  pauseIcon: { fontSize: 40, color: '#fff' },
  
  speedUpOverlay: { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25 },
  speedUpText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  sideActions: { position: 'absolute', right: 16, bottom: 160 },
  sideBtn: { alignItems: 'center', gap: 6, marginBottom: 20 },
  iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 24 },
  sideLabel: { color: '#fff', fontSize: 12, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  
  videoInfo: { position: 'absolute', bottom: 100, left: 16, right: 80 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  badgeLocal: { backgroundColor: '#10b981' },
  badgeServer: { backgroundColor: '#3b82f6' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  videoName: { color: '#fff', fontSize: 15, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  
  scrubberContainer: { position: 'absolute', bottom: 65, left: 16, right: 16, flexDirection: 'row', alignItems: 'center' },
  slider: { flex: 1, marginHorizontal: 10, height: 40 },
  timeText: { color: '#fff', fontSize: 13, fontWeight: 'bold', width: 45, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: '#fff', fontSize: 20 },
  
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 24, backgroundColor: 'rgba(0,0,0,0.85)' },
  downloadBtn: { backgroundColor: '#fff', padding: 16, borderRadius: 16, alignItems: 'center' },
  downloadBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  progressText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});
