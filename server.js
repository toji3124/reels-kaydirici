const express = require('express');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// İndirilen videolar için klasör
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const TIKTOK_DIR = path.join(DOWNLOADS_DIR, 'tiktok');
const INSTA_DIR = path.join(DOWNLOADS_DIR, 'instagram');
const YOUTUBE_DIR = path.join(DOWNLOADS_DIR, 'youtube');
const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(TIKTOK_DIR)) fs.mkdirSync(TIKTOK_DIR, { recursive: true });
if (!fs.existsSync(INSTA_DIR)) fs.mkdirSync(INSTA_DIR, { recursive: true });
if (!fs.existsSync(YOUTUBE_DIR)) fs.mkdirSync(YOUTUBE_DIR, { recursive: true });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOADS_DIR));

// CORS - Chrome eklentisinden gelen istekler için
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const getYtDlpCmd = () => {
    const localYtDlp = path.join(__dirname, 'yt-dlp');
    if (fs.existsSync(localYtDlp)) return localYtDlp;
    const localExe = path.join(__dirname, 'yt-dlp.exe');
    if (fs.existsSync(localExe)) return localExe;
    return 'yt-dlp';
};

const getCookiesArgs = () => {
    if (fs.existsSync(COOKIES_FILE)) {
        try {
            const head = fs.readFileSync(COOKIES_FILE, 'utf-8').slice(0, 100);
            if (head.includes('Netscape HTTP Cookie File')) {
                return ['--cookies', COOKIES_FILE];
            }
        } catch (e) {}
    }
    return [];
};

function detectPlatform(url) {
    if (!url) return 'instagram';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'instagram';
}

// yt-dlp ile video bilgisi çek (indirmeden)
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            ...getCookiesArgs(),
            url
        ];

        execFile(getYtDlpCmd(), args, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message || 'Video bilgisi alınamadı'));
                return;
            }
            try {
                const info = JSON.parse(stdout);
                resolve({
                    success: true,
                    title: info.title || 'Video',
                    thumbnail: info.thumbnail || null,
                    duration: info.duration || 0,
                    uploader: info.uploader || info.channel || 'Bilinmiyor',
                    platform: detectPlatform(url),
                    originalUrl: url,
                    id: info.id || Date.now().toString(),
                });
            } catch (e) {
                reject(new Error('Video bilgisi parse edilemedi'));
            }
        });
    });
}

const activeDownloads = new Map();

function downloadVideo(url, filename) {
    return new Promise((resolve, reject) => {
        const platform = detectPlatform(url);
        let targetDir = INSTA_DIR;
        if (platform === 'tiktok') targetDir = TIKTOK_DIR;
        else if (platform === 'youtube') targetDir = YOUTUBE_DIR;

        const outputPath = path.join(targetDir, filename);
        
        // YouTube uzun videolar için daha gelişmiş format
        let formatStr;
        if (platform === 'youtube') {
            formatStr = 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best';
        } else {
            formatStr = 'best[ext=mp4]/best';
        }

        const args = [
            '-o', outputPath,
            '--no-playlist',
            '--no-warnings',
            '--merge-output-format', 'mp4',
            '-f', formatStr,
            '--no-check-certificates',
            ...getCookiesArgs(),
            url
        ];

        // YouTube uzun videolar için 10 dakika timeout
        const timeoutMs = platform === 'youtube' ? 600000 : 180000;

        const child = execFile(getYtDlpCmd(), args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            activeDownloads.delete(url);
            if (error) {
                if (error.killed || error.signal === 'SIGTERM') {
                    reject(new Error('İndirme iptal edildi'));
                } else {
                    reject(new Error(stderr || error.message || 'İndirme başarısız'));
                }
                return;
            }
            // Dosyanın gerçekten oluşup oluşmadığını kontrol et
            if (fs.existsSync(outputPath)) {
                resolve({ success: true, filename, path: `/downloads/${platform}/${filename}` });
            } else {
                // yt-dlp bazen farklı uzantı ekleyebilir, glob ile ara
                const dir = path.dirname(outputPath);
                const base = path.basename(outputPath, '.mp4');
                const candidates = fs.readdirSync(dir).filter(f => f.startsWith(base));
                if (candidates.length > 0) {
                    // İlk eşleşeni mp4'e yeniden adlandır
                    const found = candidates[0];
                    if (!found.endsWith('.mp4')) {
                        fs.renameSync(path.join(dir, found), outputPath);
                    }
                    resolve({ success: true, filename, path: `/downloads/${platform}/${filename}` });
                } else {
                    reject(new Error('Dosya oluşturulamadı'));
                }
            }
        });
        
        activeDownloads.set(url, child);
    });
}

// İndirmeyi iptal et
app.post('/api/cancel-download', (req, res) => {
    const { url } = req.body;
    if (activeDownloads.has(url)) {
        const child = activeDownloads.get(url);
        child.kill(); // Process'i öldür
        activeDownloads.delete(url);
        res.json({ success: true, message: 'İptal edildi' });
    } else {
        res.json({ success: false, message: 'Aktif indirme bulunamadı' });
    }
});

// Video bilgisi getir (tek link)
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL gerekli' });

    try {
        const info = await getVideoInfo(url.trim());
        res.json(info);
    } catch (err) {
        res.json({ success: false, error: err.message, originalUrl: url.trim() });
    }
});

// Toplu video bilgisi getir
app.post('/api/info-bulk', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ success: false, error: 'URL listesi gerekli' });
    }

    const results = [];
    for (const url of urls.slice(0, 20)) {
        if (!url.trim()) continue;
        try {
            const info = await getVideoInfo(url.trim());
            results.push(info);
        } catch (err) {
            results.push({ success: false, error: err.message, originalUrl: url.trim() });
        }
    }
    res.json({ results });
});

// Profil / Kanal videolarını tara
function fetchProfileVideos(profileUrl, limit = 50) {
    return new Promise((resolve, reject) => {
        let cleanUrl = (profileUrl || '').trim();
        if (!cleanUrl) return reject(new Error('Profil linki veya kullanıcı adı gerekli'));

        // Kullanıcı adı yazılmışsa uygun URL'e dönüştür
        if (!cleanUrl.startsWith('http')) {
            if (cleanUrl.startsWith('@')) {
                cleanUrl = `https://www.tiktok.com/${cleanUrl}`;
            } else {
                cleanUrl = `https://www.instagram.com/${cleanUrl}/reels/`;
            }
        }

        const args = [
            '--flat-playlist',
            '--dump-single-json',
            '--playlist-end', String(limit || 50),
            '--no-warnings',
            ...getCookiesArgs(),
            cleanUrl
        ];

        execFile(getYtDlpCmd(), args, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message || 'Profil taranamadı'));
                return;
            }
            try {
                const data = JSON.parse(stdout);
                const uploader = data.uploader || data.channel || data.title || 'Kullanici';
                const entries = data.entries || [];
                const platform = detectPlatform(cleanUrl);

                const videos = entries.map(entry => {
                    let vUrl = entry.url;
                    if (vUrl && !vUrl.startsWith('http')) {
                        if (platform === 'tiktok') vUrl = `https://www.tiktok.com/@${uploader}/video/${entry.id}`;
                        else if (platform === 'youtube') vUrl = `https://www.youtube.com/watch?v=${entry.id}`;
                        else vUrl = `https://www.instagram.com/p/${entry.id}/`;
                    }
                    return {
                        url: vUrl,
                        id: entry.id,
                        title: entry.title || 'Video',
                        uploader: uploader,
                        duration: entry.duration || 0,
                        platform: platform
                    };
                }).filter(v => !!v.url);

                resolve({
                    success: true,
                    uploader: uploader,
                    platform: platform,
                    count: videos.length,
                    videos: videos
                });
            } catch (e) {
                reject(new Error('Profil yanıtı işlenemedi: ' + e.message));
            }
        });
    });
}

// Profil videolarını getir
app.post('/api/fetch-profile', async (req, res) => {
    const { url, limit } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Profil linki gerekli' });
    try {
        const result = await fetchProfileVideos(url, limit || 50);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Video indir
app.post('/api/download', async (req, res) => {
    const { url, uploader } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL gerekli' });

    try {
        const timestamp = Date.now();
        const platform = detectPlatform(url.trim());
        const safeUploader = (uploader || 'genel').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'genel';
        const filename = `${platform}_${safeUploader}_${timestamp}.mp4`;
        const result = await downloadVideo(url.trim(), filename);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

const parseUploaderFromFilename = (filename) => {
    const parts = filename.replace('.mp4', '').split('_');
    if (parts.length >= 3 && parts[1] !== 'genel') {
        return parts[1];
    }
    return 'Genel';
};

// İndirilen dosyaları listele
app.get('/api/files', (req, res) => {
    try {
        let allFiles = [];
        
        const readPlatformDir = (dir, platformName) => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).forEach(f => {
                    const stats = fs.statSync(path.join(dir, f));
                    const uploader = parseUploaderFromFilename(f);
                    allFiles.push({
                        name: f,
                        path: `/downloads/${platformName}/${f}`,
                        size: stats.size,
                        date: stats.mtime,
                        platform: platformName,
                        uploader: uploader
                    });
                });
            }
        };

        readPlatformDir(TIKTOK_DIR, 'tiktok');
        readPlatformDir(INSTA_DIR, 'instagram');
        readPlatformDir(YOUTUBE_DIR, 'youtube');
        
        // Klasör dışındaki ana dizindekileri de oku (geriye dönük uyumluluk)
        if (fs.existsSync(DOWNLOADS_DIR)) {
            fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.mp4') && fs.statSync(path.join(DOWNLOADS_DIR, f)).isFile()).forEach(f => {
                const stats = fs.statSync(path.join(DOWNLOADS_DIR, f));
                const platform = f.includes('tiktok') ? 'tiktok' : (f.includes('youtube') ? 'youtube' : 'instagram');
                const uploader = parseUploaderFromFilename(f);
                allFiles.push({
                    name: f,
                    path: `/downloads/${f}`,
                    size: stats.size,
                    date: stats.mtime,
                    platform: platform,
                    uploader: uploader
                });
            });
        }

        allFiles.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Profilleri grupla
        const profileMap = {};
        allFiles.forEach(f => {
            const up = f.uploader || 'Genel';
            if (!profileMap[up]) {
                profileMap[up] = { name: up, count: 0, platform: f.platform };
            }
            profileMap[up].count++;
        });

        res.json({ files: allFiles, profiles: Object.values(profileMap) });
    } catch (err) {
        res.json({ files: [], profiles: [] });
    }
});

// Eklentiden gelen linkleri kaydet
const linksFile = path.join(__dirname, 'collected_links.json');

app.post('/api/save-links', (req, res) => {
    const { links } = req.body;
    if (!links || !Array.isArray(links)) {
        return res.status(400).json({ success: false, error: 'Link listesi gerekli' });
    }

    try {
        let existing = [];
        if (fs.existsSync(linksFile)) {
            existing = JSON.parse(fs.readFileSync(linksFile, 'utf-8'));
        }

        // Yeni linkleri ekle (tekrarlamayanları)
        const existingUrls = new Set(existing.map(l => l.url));
        const newLinks = links
            .filter(l => !existingUrls.has(l.url))
            .map(l => ({ ...l, savedAt: new Date().toISOString() }));

        const all = [...existing, ...newLinks];
        fs.writeFileSync(linksFile, JSON.stringify(all, null, 2));

        res.json({ success: true, added: newLinks.length, total: all.length });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Kaydedilen linkleri getir
app.get('/api/saved-links', (req, res) => {
    try {
        if (fs.existsSync(linksFile)) {
            const links = JSON.parse(fs.readFileSync(linksFile, 'utf-8'));
            res.json({ links });
        } else {
            res.json({ links: [] });
        }
    } catch (err) {
        res.json({ links: [] });
    }
});

// Kaydedilen linkleri temizle
app.delete('/api/saved-links', (req, res) => {
    try {
        fs.writeFileSync(linksFile, '[]');
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Cookie durumu
app.get('/api/cookies', (req, res) => {
    try {
        if (fs.existsSync(COOKIES_FILE)) {
            const stats = fs.statSync(COOKIES_FILE);
            res.json({ exists: true, size: stats.size, lastModified: stats.mtime });
        } else {
            res.json({ exists: false });
        }
    } catch (err) {
        res.json({ exists: false, error: err.message });
    }
});

// Cookie kaydet (Metin olarak)
app.post('/api/cookies', (req, res) => {
    const { cookies } = req.body;
    if (!cookies || typeof cookies !== 'string') {
        return res.status(400).json({ success: false, error: 'Cookie içeriği gerekli' });
    }
    try {
        fs.writeFileSync(COOKIES_FILE, cookies.trim(), 'utf-8');
        res.json({ success: true, message: 'cookies.txt başarıyla kaydedildi' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// TikTok Keşfet Otomasyonu (Playwright Harvester)
let harvestState = {
    isRunning: false,
    found: 0,
    target: 0,
    links: [],
    error: null,
    process: null
};

app.post('/api/harvest-tiktok', (req, res) => {
    if (harvestState.isRunning) {
        return res.json({ success: false, error: 'Zaten devam eden bir keşfet taraması var.' });
    }
    const count = parseInt(req.body.count) || 200;
    const autoDownload = !!req.body.autoDownload;

    harvestState = {
        isRunning: true,
        found: 0,
        target: count,
        links: [],
        error: null,
        process: null
    };

    const py = spawn('python', ['harvest_tiktok.py', '--count', count.toString(), '--cookie', COOKIES_FILE]);
    harvestState.process = py;

    let buffer = '';
    py.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('PROGRESS:')) {
                try {
                    const data = JSON.parse(trimmed.replace('PROGRESS:', ''));
                    harvestState.found = data.found;
                    harvestState.target = data.target;
                } catch(e) {}
            } else if (trimmed.startsWith('DONE:')) {
                try {
                    const data = JSON.parse(trimmed.replace('DONE:', ''));
                    harvestState.links = data.links || [];
                    harvestState.found = (data.links || []).length;
                } catch(e) {}
            }
        }
    });

    py.stderr.on('data', (chunk) => {
        console.log(`[Harvester] ${chunk.toString().trim()}`);
    });

    py.on('close', (code) => {
        harvestState.isRunning = false;
        harvestState.process = null;
        if (code !== 0 && harvestState.links.length === 0) {
            harvestState.error = 'Tarama sonlandı veya iptal edildi (Kod: ' + code + ')';
        } else {
            if (harvestState.links.length > 0) {
                try {
                    let existing = [];
                    if (fs.existsSync(linksFile)) {
                        existing = JSON.parse(fs.readFileSync(linksFile, 'utf-8'));
                    }
                    const existingUrls = new Set(existing.map(l => l.url));
                    const newItems = harvestState.links
                        .filter(url => !existingUrls.has(url))
                        .map(url => ({
                            url,
                            title: 'TikTok Keşfet Videosu',
                            platform: 'tiktok',
                            savedAt: new Date().toISOString()
                        }));
                    const combined = [...existing, ...newItems];
                    fs.writeFileSync(linksFile, JSON.stringify(combined, null, 2));
                    console.log(`[Harvester] ${newItems.length} yeni keşfet linki toplananlara kaydedildi.`);

                    if (autoDownload) {
                        for (const item of newItems) {
                            downloadQueue.push({ url: item.url, filename: null });
                        }
                        processQueue();
                    }
                } catch(err) {
                    console.error('[Harvester] Kaydetme hatası:', err);
                }
            }
        }
    });

    res.json({ success: true, message: `Keşfet taraması başlatıldı (${count} video)`, target: count });
});

app.get('/api/harvest-status', (req, res) => {
    res.json({
        isRunning: harvestState.isRunning,
        found: harvestState.found,
        target: harvestState.target,
        links: harvestState.links,
        error: harvestState.error
    });
});

app.post('/api/harvest-stop', (req, res) => {
    if (harvestState.isRunning && harvestState.process) {
        try {
            harvestState.process.kill();
        } catch(e) {}
        harvestState.isRunning = false;
        harvestState.process = null;
        return res.json({ success: true, message: 'Tarama durduruldu.' });
    }
    res.json({ success: false, message: 'Çalışan tarama yok.' });
});


// İndirilenler klasörünü Windows'ta aç
app.get('/api/open-folder', (req, res) => {
    try {
        require('child_process').exec(`start "" "${DOWNLOADS_DIR}"`);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Bilgisayarın yerel IP adresini bul (Telefonun bağlanabilmesi için)
function getLocalIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    
    for (const devName in interfaces) {
        const isVirtual = /virtual|vmware|vbox|vethernet|host-only/i.test(devName);
        const iface = interfaces[devName];
        
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                if (alias.address.startsWith('192.168.56.')) continue;
                ips.push({ name: devName, address: alias.address, isVirtual });
            }
        }
    }
    
    ips.sort((a, b) => {
        if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
        if (a.address.startsWith('192.168.1.') && !b.address.startsWith('192.168.1.')) return -1;
        return 0;
    });
    
    return ips;
}

app.get('/api/local-ip', (req, res) => {
    const ips = getLocalIps();
    const bestIp = ips.length > 0 ? ips[0].address : 'localhost';
    res.json({ ip: bestIp, allIps: ips.map(i => i.address), port: PORT, url: `http://${bestIp}:${PORT}` });
});

app.listen(PORT, '0.0.0.0', () => {
    const ips = getLocalIps();
    const bestIp = ips.length > 0 ? ips[0].address : 'localhost';
    console.log(`\n🎬 Reels & TikTok İndirici çalışıyor: http://localhost:${PORT}`);
    console.log(`📱 Telefondan bağlanmak için şu IP'yi girin: http://${bestIp}:${PORT}`);
    if (ips.length > 1) {
        console.log(`ℹ️ Diğer ağ adresleri: ${ips.slice(1).map(i => i.address).join(', ')}`);
    }
    console.log('');
});
