const express = require('express');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigürasyon ve İndirme Klasörü Yönetimi
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    } catch(e) {}
    return {
        downloadDir: path.join(__dirname, 'downloads')
    };
}

let appConfig = loadConfig();

let DOWNLOADS_DIR = appConfig.downloadDir || path.join(__dirname, 'downloads');
let TIKTOK_DIR = path.join(DOWNLOADS_DIR, 'tiktok');
let INSTA_DIR = path.join(DOWNLOADS_DIR, 'instagram');
let YOUTUBE_DIR = path.join(DOWNLOADS_DIR, 'youtube');
let TWITTER_DIR = path.join(DOWNLOADS_DIR, 'twitter');
const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

function updateDownloadDirs(newBaseDir) {
    if (!newBaseDir || typeof newBaseDir !== 'string') return;
    DOWNLOADS_DIR = path.resolve(newBaseDir.trim());
    TIKTOK_DIR = path.join(DOWNLOADS_DIR, 'tiktok');
    INSTA_DIR = path.join(DOWNLOADS_DIR, 'instagram');
    YOUTUBE_DIR = path.join(DOWNLOADS_DIR, 'youtube');
    TWITTER_DIR = path.join(DOWNLOADS_DIR, 'twitter');

    [DOWNLOADS_DIR, TIKTOK_DIR, INSTA_DIR, YOUTUBE_DIR, TWITTER_DIR, THUMBNAILS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
        }
    });

    appConfig.downloadDir = DOWNLOADS_DIR;
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
    } catch(e) {}
}

updateDownloadDirs(DOWNLOADS_DIR);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', (req, res, next) => {
    express.static(DOWNLOADS_DIR)(req, res, next);
});

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

const getFfmpegArgs = () => {
    const localFfmpeg = path.join(__dirname, 'ffmpeg.exe');
    if (fs.existsSync(localFfmpeg)) {
        return ['--ffmpeg-location', __dirname];
    }
    return [];
};

function ensureH264(filePath) {
    return new Promise((resolve) => {
        const localFfmpeg = path.join(__dirname, 'ffmpeg.exe');
        const ffmpegCmd = fs.existsSync(localFfmpeg) ? localFfmpeg : 'ffmpeg';
        execFile(ffmpegCmd, ['-i', filePath], (err, stdout, stderr) => {
            const out = (stderr || '') + (stdout || '');
            if (out.includes('Video: hevc') || out.includes('Video: hvc1') || out.includes('Video: av01') || out.includes('Video: vp9')) {
                const temp = filePath + '.temp.mp4';
                execFile(ffmpegCmd, ['-y', '-i', filePath, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'copy', temp], { timeout: 60000 }, (convErr) => {
                    if (!convErr && fs.existsSync(temp) && fs.statSync(temp).size > 1000) {
                        try {
                            fs.unlinkSync(filePath);
                            fs.renameSync(temp, filePath);
                        } catch(e) {}
                    } else {
                        try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch(e) {}
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });
}

function detectPlatform(url) {
    if (!url) return 'instagram';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'instagram';
}

function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const cleanNoSlash = (url || '').trim().split('?')[0].replace(/\/+$/, '');
        if (cleanNoSlash.endsWith('instagram.com/reels')) {
            return reject(new Error('Bu genel Reels akış linkidir! Lütfen tekil video linki (örn: https://www.instagram.com/reel/C8xyz...) girin.'));
        }
        const args = [
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            '--js-runtimes', 'node',
            ...getCookiesArgs(),
            url
        ];

        execFile(getYtDlpCmd(), args, { timeout: 60000, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
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
        const cleanNoSlash = (url || '').trim().split('?')[0].replace(/\/+$/, '');
        if (cleanNoSlash.endsWith('instagram.com/reels')) {
            return reject(new Error('Bu genel Reels akış linkidir! Lütfen tekil video linki girin: https://www.instagram.com/reel/ID'));
        }
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
            '--js-runtimes', 'node',
            '--merge-output-format', 'mp4',
            '-f', formatStr,
            '--no-check-certificates',
            ...getCookiesArgs(),
            ...getFfmpegArgs(),
            url
        ];

        // YouTube uzun videolar için 10 dakika timeout
        const timeoutMs = platform === 'youtube' ? 600000 : 180000;

        const child = execFile(getYtDlpCmd(), args, { timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            activeDownloads.delete(url);
            if (error) {
                if (error.killed || error.signal === 'SIGTERM') {
                    reject(new Error('İndirme iptal edildi'));
                } else {
                    reject(new Error(stderr || error.message || 'İndirme başarısız'));
                }
                return;
            }
            const finishSuccess = async (targetFile) => {
                try {
                    await ensureH264(targetFile);
                } catch(e) {}
                resolve({ success: true, filename, path: `/downloads/${platform}/${filename}` });
            };

            // Dosyanın gerçekten oluşup oluşmadığını kontrol et
            if (fs.existsSync(outputPath)) {
                finishSuccess(outputPath);
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
                    finishSuccess(outputPath);
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
            '--js-runtimes', 'node',
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

// Profil videolarını getir (Instagram, TikTok, YouTube - Playwright + yt-dlp)
app.post(['/api/profile/scrape', '/api/fetch-profile'], (req, res) => {
    const { url, limit } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Profil linki veya kullanıcı adı gerekli' });

    const targetLimit = parseInt(limit) || 50;
    const py = spawn('python', ['scrape_profile.py', url.trim(), targetLimit.toString()]);

    let output = '';
    let errorOutput = '';

    py.stdout.on('data', chunk => {
        output += chunk.toString();
    });

    py.stderr.on('data', chunk => {
        errorOutput += chunk.toString();
    });

    py.on('close', code => {
        try {
            const data = JSON.parse(output);
            return res.json(data);
        } catch (e) {
            console.error('scrape_profile error:', errorOutput);
            return res.json({
                success: false,
                error: errorOutput || 'Profil taranamadı veya video bulunamadı.'
            });
        }
    });
});

// Toplu indirme kuyruğuna ekle
app.post('/api/profile/download-batch', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ success: false, error: 'İndirilecek URL listesi gerekli' });
    }

    let addedCount = 0;
    for (const u of urls) {
        if (u && typeof u === 'string') {
            downloadQueue.push({ url: u.trim(), filename: null });
            addedCount++;
        }
    }
    processQueue();

    res.json({
        success: true,
        message: `${addedCount} video indirme kuyruğuna eklendi`,
        count: addedCount
    });
});

// Resim proxy (CORS veya Referrer engelini aşmak için)
app.get('/api/proxy-image', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');
    try {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? require('https') : require('http');
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': parsed.origin + '/'
            }
        };
        client.get(url, options, (resp) => {
            if ([301, 302, 307, 308].includes(resp.statusCode) && resp.headers.location) {
                return res.redirect(resp.headers.location);
            }
            res.status(resp.statusCode || 200);
            if (resp.headers['content-type']) res.setHeader('Content-Type', resp.headers['content-type']);
            res.setHeader('Cache-Control', 'public, max-age=604800');
            resp.pipe(res);
        }).on('error', () => {
            if (!res.headersSent) res.status(500).send('Proxy error');
        });
    } catch(e) {
        if (!res.headersSent) res.status(400).send('Invalid URL');
    }
});

// Canlı Video Oynatma ve Akış Çözücü
const directStreamCache = new Map();

function getDirectStreamUrl(webUrl) {
    const cached = directStreamCache.get(webUrl);
    if (cached && cached.expiresAt > Date.now()) {
        return Promise.resolve(cached.streamUrl);
    }

    return new Promise((resolve, reject) => {
        const args = [
            '-g',
            '-f', 'best[ext=mp4]/best',
            '--no-warnings',
            '--no-playlist',
            '--js-runtimes', 'node',
            ...getCookiesArgs(),
            webUrl
        ];

        execFile(getYtDlpCmd(), args, { timeout: 30000 }, (error, stdout) => {
            if (error || !stdout || !stdout.trim()) {
                return reject(error || new Error('Video akış linki çözülemedi'));
            }
            const streamUrl = stdout.trim().split('\n')[0].trim();
            directStreamCache.set(webUrl, {
                streamUrl,
                expiresAt: Date.now() + 1800000 // 30 dk
            });
            resolve(streamUrl);
        });
    });
}

// Video akış proxy'si (Range request / seek / controls destekli)
app.get('/api/video-stream', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    try {
        let streamUrl = url;
        // Eğer URL doğrudan CDN video akışı değilse yt-dlp ile çöz
        if (!url.includes('.mp4') && !url.includes('googlevideo.com') && !url.includes('tiktokcdn.com') && !url.includes('fbcdn.net')) {
            streamUrl = await getDirectStreamUrl(url);
        }

        const parsed = new URL(streamUrl);
        const client = parsed.protocol === 'https:' ? require('https') : require('http');
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': '*/*'
        };
        if (req.headers.range) {
            headers['range'] = req.headers.range;
        }

        const request = client.get(streamUrl, { headers }, (resp) => {
            if ([301, 302, 307, 308].includes(resp.statusCode) && resp.headers.location) {
                return res.redirect(resp.headers.location);
            }

            res.status(resp.statusCode || 200);
            if (resp.headers['content-type']) res.setHeader('Content-Type', resp.headers['content-type']);
            else res.setHeader('Content-Type', 'video/mp4');

            if (resp.headers['content-length']) res.setHeader('Content-Length', resp.headers['content-length']);
            if (resp.headers['content-range']) res.setHeader('Content-Range', resp.headers['content-range']);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=3600');

            resp.pipe(res);
            resp.on('error', () => {
                if (!res.headersSent) try { res.status(500).end(); } catch(e) {}
            });
        });

        request.on('error', (e) => {
            if (!res.headersSent) res.status(500).send('Stream error: ' + e.message);
        });

        req.on('close', () => {
            try { request.destroy(); } catch(e) {}
        });
    } catch (err) {
        if (!res.headersSent) res.status(500).send('Stream resolve error: ' + err.message);
    }
});

// Video oynatma bilgi API'si
app.get('/api/video-play-info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    try {
        const platform = detectPlatform(url);
        if (platform === 'youtube') {
            const m = url.match(/(?:watch\?v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (m) {
                return res.json({
                    success: true,
                    type: 'youtube',
                    videoId: m[1],
                    embedUrl: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`
                });
            }
        }

        const streamUrl = await getDirectStreamUrl(url);
        res.json({
            success: true,
            type: 'video',
            streamUrl,
            proxyUrl: `/api/video-stream?url=${encodeURIComponent(url)}`
        });
    } catch (err) {
        res.json({
            success: false,
            error: err.message
        });
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
                fs.readdirSync(dir).filter(f => f.endsWith('.mp4') && !/\.f\d+\.mp4$/i.test(f)).forEach(f => {
                    const stats = fs.statSync(path.join(dir, f));
                    const uploader = parseUploaderFromFilename(f);
                    allFiles.push({
                        name: f,
                        path: `/downloads/${platformName}/${f}`,
                        size: stats.size,
                        date: stats.mtime,
                        platform: platformName,
                        uploader: uploader,
                        thumbnail: `/api/thumbnail/${platformName}/${f}`
                    });
                });
            }
        };

        readPlatformDir(TIKTOK_DIR, 'tiktok');
        readPlatformDir(INSTA_DIR, 'instagram');
        readPlatformDir(YOUTUBE_DIR, 'youtube');
        readPlatformDir(TWITTER_DIR, 'twitter');
        
        // Klasör dışındaki ana dizindekileri de oku (geriye dönük uyumluluk)
        if (fs.existsSync(DOWNLOADS_DIR)) {
            fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.mp4') && fs.statSync(path.join(DOWNLOADS_DIR, f)).isFile()).forEach(f => {
                const stats = fs.statSync(path.join(DOWNLOADS_DIR, f));
                const platform = f.includes('tiktok') ? 'tiktok' : (f.includes('youtube') ? 'youtube' : (f.includes('twitter') ? 'twitter' : 'instagram'));
                const uploader = parseUploaderFromFilename(f);
                allFiles.push({
                    name: f,
                    path: `/downloads/${f}`,
                    size: stats.size,
                    date: stats.mtime,
                    platform: platform,
                    uploader: uploader,
                    thumbnail: `/api/thumbnail/${platform}/${f}`
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

app.get('/api/downloads', (req, res) => {
    // Aynı dosya listesini döndür
    req.url = '/api/files';
    app.handle(req, res);
});

// Dosya silme API (Tekil veya Tümünü Sil)
app.delete('/api/files', (req, res) => {
    const { path: filePath, name, platform, all } = req.body || {};
    try {
        if (all) {
            const platforms = ['instagram', 'tiktok', 'twitter', 'youtube', 'x'];
            let deletedCount = 0;
            platforms.forEach(plat => {
                const pDir = path.join(DOWNLOADS_DIR, plat);
                if (fs.existsSync(pDir)) {
                    const files = fs.readdirSync(pDir);
                    files.forEach(f => {
                        const fPath = path.join(pDir, f);
                        try {
                            if (fs.statSync(fPath).isFile()) {
                                fs.unlinkSync(fPath);
                                deletedCount++;
                            }
                        } catch(e) {}
                    });
                }
            });
            // Ayrıca kök downloads dizininde doğrudan video dosyaları varsa sil
            if (fs.existsSync(DOWNLOADS_DIR)) {
                const rootFiles = fs.readdirSync(DOWNLOADS_DIR);
                rootFiles.forEach(rf => {
                    const rfPath = path.join(DOWNLOADS_DIR, rf);
                    try {
                        if (fs.statSync(rfPath).isFile()) {
                            fs.unlinkSync(rfPath);
                            deletedCount++;
                        }
                    } catch(e) {}
                });
            }
            // Thumbnails temizle
            if (fs.existsSync(THUMBNAILS_DIR)) {
                const tFiles = fs.readdirSync(THUMBNAILS_DIR);
                tFiles.forEach(tf => {
                    try {
                        const tfPath = path.join(THUMBNAILS_DIR, tf);
                        if (fs.statSync(tfPath).isFile()) fs.unlinkSync(tfPath);
                    } catch(e) {}
                });
            }
            return res.json({ success: true, count: deletedCount, message: `${deletedCount} video silindi` });
        }

        // Platform bazlı toplu silme (Örn: Sadece TikTok veya Sadece Instagram)
        if (platform && (!name || name === 'all') && !filePath) {
            const plat = platform === 'x' ? 'twitter' : platform;
            const pDir = path.join(DOWNLOADS_DIR, plat);
            let deletedCount = 0;
            if (fs.existsSync(pDir)) {
                const files = fs.readdirSync(pDir);
                files.forEach(f => {
                    const fPath = path.join(pDir, f);
                    try {
                        if (fs.statSync(fPath).isFile()) {
                            fs.unlinkSync(fPath);
                            deletedCount++;
                        }
                    } catch(e) {}
                });
            }
            // İlgili platformun thumbnail klasörünü de temizle
            const pThumbDir = path.join(THUMBNAILS_DIR, plat);
            if (fs.existsSync(pThumbDir)) {
                const tFiles = fs.readdirSync(pThumbDir);
                tFiles.forEach(tf => {
                    try {
                        const tfPath = path.join(pThumbDir, tf);
                        if (fs.statSync(tfPath).isFile()) fs.unlinkSync(tfPath);
                    } catch(e) {}
                });
            }
            return res.json({ success: true, count: deletedCount, message: `${deletedCount} ${platform} videosu silindi` });
        }

        let fullPath = null;
        if (filePath && typeof filePath === 'string') {
            const rel = filePath.replace(/^\/downloads\//, '');
            fullPath = path.join(DOWNLOADS_DIR, rel);
        } else if (name && platform) {
            fullPath = path.join(DOWNLOADS_DIR, platform, name);
        }
        if (fullPath && fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return res.json({ success: true, message: 'Dosya silindi' });
        }
        return res.status(404).json({ success: false, error: 'Dosya bulunamadı' });
    } catch(err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/files/all', (req, res) => {
    req.body = { ...(req.body || {}), all: true };
    const { path: filePath, name, platform, all } = req.body;
    try {
        const platforms = ['instagram', 'tiktok', 'twitter', 'youtube', 'x'];
        let deletedCount = 0;
        platforms.forEach(plat => {
            const pDir = path.join(DOWNLOADS_DIR, plat);
            if (fs.existsSync(pDir)) {
                const files = fs.readdirSync(pDir);
                files.forEach(f => {
                    const fPath = path.join(pDir, f);
                    try {
                        if (fs.statSync(fPath).isFile()) {
                            fs.unlinkSync(fPath);
                            deletedCount++;
                        }
                    } catch(e) {}
                });
            }
        });
        if (fs.existsSync(DOWNLOADS_DIR)) {
            const rootFiles = fs.readdirSync(DOWNLOADS_DIR);
            rootFiles.forEach(rf => {
                const rfPath = path.join(DOWNLOADS_DIR, rf);
                try {
                    if (fs.statSync(rfPath).isFile()) {
                        fs.unlinkSync(rfPath);
                        deletedCount++;
                    }
                } catch(e) {}
            });
        }
        if (fs.existsSync(THUMBNAILS_DIR)) {
            const tFiles = fs.readdirSync(THUMBNAILS_DIR);
            tFiles.forEach(tf => {
                try {
                    const tfPath = path.join(THUMBNAILS_DIR, tf);
                    if (fs.statSync(tfPath).isFile()) fs.unlinkSync(tfPath);
                } catch(e) {}
            });
        }
        return res.json({ success: true, count: deletedCount, message: `${deletedCount} video silindi` });
    } catch(err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Video Kapak Resmi (Thumbnail) Üretici
function generateThumbnail(videoPath, thumbPath) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(thumbPath)) return resolve(thumbPath);
        const localFfmpeg = path.join(__dirname, 'ffmpeg.exe');
        const ffmpegCmd = fs.existsSync(localFfmpeg) ? localFfmpeg : 'ffmpeg';
        
        const args = [
            '-y',
            '-ss', '00:00:02',
            '-i', videoPath,
            '-vframes', '1',
            '-update', '1',
            '-vf', 'scale=480:-1',
            '-q:v', '3',
            thumbPath
        ];
        
        execFile(ffmpegCmd, args, { timeout: 15000 }, (err) => {
            if (err || !fs.existsSync(thumbPath)) {
                execFile(ffmpegCmd, ['-y', '-ss', '00:00:00.5', '-i', videoPath, '-vframes', '1', '-update', '1', '-vf', 'scale=480:-1', '-q:v', '3', thumbPath], { timeout: 10000 }, (err2) => {
                    if (err2 || !fs.existsSync(thumbPath)) return reject(err2 || new Error('Kapak oluşturulamadı'));
                    resolve(thumbPath);
                });
                return;
            }
            resolve(thumbPath);
        });
    });
}

app.get('/api/thumbnail/:platform/:filename', async (req, res) => {
    const { platform, filename } = req.params;
    let targetDir = INSTA_DIR;
    if (platform === 'tiktok') targetDir = TIKTOK_DIR;
    else if (platform === 'youtube') targetDir = YOUTUBE_DIR;
    else if (platform === 'twitter' || platform === 'x') targetDir = TWITTER_DIR;
    
    let videoPath = path.join(targetDir, filename);
    if (!fs.existsSync(videoPath)) {
        videoPath = path.join(DOWNLOADS_DIR, filename);
    }
    if (!fs.existsSync(videoPath)) return res.status(404).send('Video bulunamadı');
    
    const thumbName = `${platform}_${filename}.jpg`;
    const thumbPath = path.join(THUMBNAILS_DIR, thumbName);
    
    try {
        await generateThumbnail(videoPath, thumbPath);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(thumbPath);
    } catch(err) {
        res.status(500).send('Kapak resmi oluşturulamadı');
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

// Keşfet & Akış Otomasyonu (Playwright Harvester: TikTok & Instagram)
let harvestState = {
    isRunning: false,
    platform: 'tiktok',
    found: 0,
    target: 0,
    links: [],
    recentLinks: [],
    latest: null,
    startTime: null,
    error: null,
    process: null
};

function startHarvester(platform, count, autoDownload, res) {
    if (harvestState.isRunning) {
        return res.json({ success: false, error: 'Zaten devam eden bir tarama var.' });
    }
    const targetCount = parseInt(count) || 200;
    const isInsta = (platform || '').toLowerCase().includes('insta');
    const scriptName = isInsta ? 'harvest_instagram.py' : 'harvest_tiktok.py';
    const platformName = isInsta ? 'instagram' : 'tiktok';
    const itemTitle = isInsta ? 'Instagram Reels Videosu' : 'TikTok Keşfet Videosu';

    harvestState = {
        isRunning: true,
        platform: platformName,
        found: 0,
        target: targetCount,
        links: [],
        recentLinks: [],
        latest: null,
        startTime: Date.now(),
        error: null,
        process: null
    };

    const py = spawn('python', [scriptName, '--count', targetCount.toString(), '--cookie', COOKIES_FILE]);
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
                    if (data.latest) harvestState.latest = data.latest;
                    if (Array.isArray(data.recent)) {
                        harvestState.recentLinks = data.recent;
                    }
                } catch(e) {}
            } else if (trimmed.startsWith('DONE:')) {
                try {
                    const data = JSON.parse(trimmed.replace('DONE:', ''));
                    harvestState.links = data.links || [];
                    harvestState.found = (data.links || []).length;
                    if (harvestState.links.length > 0) {
                        harvestState.recentLinks = harvestState.links.slice(-5);
                        harvestState.latest = harvestState.links[harvestState.links.length - 1];
                    }
                } catch(e) {}
            }
        }
    });

    py.stderr.on('data', (chunk) => {
        console.log(`[Harvester-${platformName}] ${chunk.toString().trim()}`);
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
                            title: itemTitle,
                            platform: platformName,
                            savedAt: new Date().toISOString()
                        }));
                    const combined = [...existing, ...newItems];
                    fs.writeFileSync(linksFile, JSON.stringify(combined, null, 2));
                    console.log(`[Harvester] ${newItems.length} yeni ${platformName} linki toplananlara kaydedildi.`);

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

    res.json({ success: true, message: `${isInsta ? 'Instagram Reels' : 'TikTok Keşfet'} taraması başlatıldı (${targetCount} video)`, target: targetCount, platform: platformName });
}

app.post('/api/harvest-tiktok', (req, res) => {
    startHarvester('tiktok', req.body.count, !!req.body.autoDownload, res);
});

app.post('/api/harvest-instagram', (req, res) => {
    startHarvester('instagram', req.body.count, !!req.body.autoDownload, res);
});

app.post('/api/harvest-start', (req, res) => {
    const platform = req.body.platform || 'tiktok';
    startHarvester(platform, req.body.count, !!req.body.autoDownload, res);
});

app.get('/api/harvest-status', (req, res) => {
    res.json({
        isRunning: harvestState.isRunning,
        platform: harvestState.platform,
        found: harvestState.found,
        target: harvestState.target,
        links: harvestState.links,
        recentLinks: harvestState.recentLinks || [],
        latest: harvestState.latest || null,
        startTime: harvestState.startTime || null,
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


// Harvester route aliases (hem slash hem tire destekli)
app.post('/api/harvest/start', (req, res) => {
    const platform = req.body.platform || 'tiktok';
    startHarvester(platform, req.body.count, !!req.body.autoDownload, res);
});

app.get('/api/harvest/status', (req, res) => {
    res.json({
        isRunning: harvestState.isRunning,
        platform: harvestState.platform,
        found: harvestState.found,
        target: harvestState.target,
        links: harvestState.links,
        error: harvestState.error
    });
});

app.post('/api/harvest/stop', (req, res) => {
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
        if (process.platform === 'win32') {
            require('child_process').exec(`start "" "${DOWNLOADS_DIR}"`);
        }
        res.json({ success: true, path: DOWNLOADS_DIR });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// İndirme Klasörü Bilgisi ve Önayarları
app.get('/api/config/download-dir', (req, res) => {
    const home = os.homedir();
    res.json({
        success: true,
        currentDir: DOWNLOADS_DIR,
        isDefault: DOWNLOADS_DIR === path.join(__dirname, 'downloads'),
        presets: {
            default: path.join(__dirname, 'downloads'),
            desktop: path.join(home, 'Desktop', 'Reels_Videolari'),
            downloads: path.join(home, 'Downloads', 'Reels_Videolari'),
            videos: path.join(home, 'Videos', 'Reels_Videolari')
        }
    });
});

// İndirme Klasörünü Güncelle
app.post('/api/config/download-dir', (req, res) => {
    const { dir } = req.body;
    if (!dir || typeof dir !== 'string') {
        return res.status(400).json({ success: false, error: 'Klasör yolu gerekli' });
    }
    try {
        updateDownloadDirs(dir);
        res.json({ success: true, currentDir: DOWNLOADS_DIR });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Windows FolderBrowserDialog ile klasör seçimi
app.post('/api/select-folder', (req, res) => {
    if (process.platform !== 'win32') {
        return res.json({ success: false, error: 'Sunucuda masaüstü klasör seçici kullanılamaz.' });
    }
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Videoların kaydedileceği klasörü seçin'
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
`;
    const child = spawn('powershell', ['-Sta', '-Command', psScript]);
    let output = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        try { child.kill(); } catch(e) {}
        res.json({ success: false, timeout: true, currentDir: DOWNLOADS_DIR });
    }, 60000); // 1 dk bekle

    child.stdout.on('data', d => output += d.toString());
    child.on('close', () => {
        clearTimeout(timeout);
        if (timedOut) return;
        const selected = output.trim();
        if (selected && fs.existsSync(selected)) {
            updateDownloadDirs(selected);
            res.json({ success: true, selectedDir: selected, currentDir: DOWNLOADS_DIR });
        } else {
            res.json({ success: false, cancelled: true, currentDir: DOWNLOADS_DIR });
        }
    });
});

// Gerçek depolama kullanımı ve dosya istatistikleri
function getDirSizeBytes(dirPath) {
    let total = 0;
    let count = 0;
    try {
        if (!fs.existsSync(dirPath)) return { total, count };
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            const full = path.join(dirPath, item.name);
            if (item.isDirectory()) {
                const sub = getDirSizeBytes(full);
                total += sub.total;
                count += sub.count;
            } else if (item.isFile()) {
                total += fs.statSync(full).size;
                count++;
            }
        }
    } catch (e) {}
    return { total, count };
}

app.get('/api/storage', (req, res) => {
    try {
        const stats = getDirSizeBytes(DOWNLOADS_DIR);
        const usedBytes = stats.total;
        const maxBytes = 100 * 1024 * 1024 * 1024; // 100 GB gösterge sınırı
        const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(1);
        const percent = Math.min(100, Math.max(1, Math.round((usedBytes / maxBytes) * 100)));

        res.json({
            success: true,
            usedBytes,
            usedFormatted: `${usedGB} GB`,
            maxFormatted: '100 GB',
            percent,
            fileCount: stats.count
        });
    } catch (err) {
        res.json({
            success: false,
            usedBytes: 0,
            usedFormatted: '0 GB',
            maxFormatted: '100 GB',
            percent: 1,
            fileCount: 0
        });
    }
});

// Yerel IP ve bağlantı bilgisi (QR için)
app.get('/api/network-info', (req, res) => {
    const ips = getLocalIps();
    const bestIp = ips.length > 0 ? ips[0].address : 'localhost';
    res.json({
        ip: bestIp,
        port: PORT,
        url: `http://${bestIp}:${PORT}`
    });
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

// ============================================
// TWITTER VIDEO API
// ============================================
app.post('/api/twitter/fetch-videos', async (req, res) => {
    const { username, limit } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, error: 'Username required' });
    }

    try {
        // Twitter username temizleme
        const cleanUsername = username.replace(/^@/, '')
            .replace(/^https?:\/\/(twitter\.com|x\.com)\//, '')
            .split('/')[0]
            .trim();
        
        if (!cleanUsername) {
            return res.json({ success: false, error: 'Invalid username format' });
        }

        // gallery-dl ile video listesini + metadata'yı çek
        const url = `https://x.com/${cleanUsername}/media`;
        
        const args = [
            '--cookies', path.join(__dirname, 'cookies.txt'),
            '--dump-json'
        ];

        // Sadece kullanıcı özel bir limit seçtiyse range ekle, varsayılan olarak TÜMÜNÜ çek
        if (limit && limit !== 'all') {
            const num = parseInt(limit);
            if (!isNaN(num) && num > 0) {
                args.push('--range', `1-${num}`);
            }
        }

        args.push(url);

        const startTime = Date.now();
        console.log('Fetching Twitter videos with gallery-dl:', args.join(' '));

        const result = await new Promise((resolve, reject) => {
            execFile('gallery-dl', args, { 
                timeout: 180000,  // 3 dakika
                maxBuffer: 200 * 1024 * 1024  // 200MB
            }, (error, stdout, stderr) => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                if (error) {
                    console.error(`gallery-dl error after ${elapsed}s:`, stderr || error.message);
                    reject(stderr || error.message);
                } else {
                    console.log(`gallery-dl completed in ${elapsed}s`);
                    resolve(stdout);
                }
            });
        });

        // gallery-dl --dump-json çıktısı tek bir büyük JSON array döner
        // Format: [[1, {...user}], [2, {...tweet}], [3, "url", {...video}], ...]
        let allItems;
        try {
            allItems = JSON.parse(result);
        } catch (e) {
            // Fallback: satır satır parse dene (eski format)
            allItems = [];
            const lines = result.split('\n').filter(line => line.trim());
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (Array.isArray(parsed)) {
                        // Eğer iç içe array ise (tek satırda tüm array geldi)
                        if (parsed.length > 0 && Array.isArray(parsed[0])) {
                            allItems = parsed;
                            break;
                        }
                        allItems.push(parsed);
                    }
                } catch (e2) {
                    continue;
                }
            }
        }

        // Eğer dış array'in elemanları da array ise (iç içe array yapısı)
        // [[1,...], [2,...], [3,...]] formatı
        const items = (allItems.length > 0 && Array.isArray(allItems[0])) ? allItems : [allItems];

        const tweetData = new Map(); // tweet_id -> tweet metadata
        const videoFiles = []; // Video file bilgileri
        
        for (const parsed of items) {
            try {
                if (!Array.isArray(parsed) || parsed.length < 2) continue;
                
                const type = parsed[0];
                
                if (type === 2) {
                    // Tweet metadata
                    const data = parsed[1];
                    if (data && data.tweet_id) {
                        tweetData.set(data.tweet_id, data);
                    }
                } else if (type === 3) {
                    // Video file: [3, "URL", {...metadata}]
                    const fileUrl = parsed[1];
                    const metadata = parsed[2] || {};
                    // Sadece mp4 video dosyalarını al
                    if (fileUrl && typeof fileUrl === 'string' && metadata.extension === 'mp4' && metadata.type === 'video') {
                        videoFiles.push({
                            url: fileUrl,
                            ...metadata
                        });
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        if (videoFiles.length === 0) {
            return res.json({ 
                success: false, 
                error: 'No videos found. Make sure the account has videos and cookies are valid.' 
            });
        }

        // Video metadata oluştur - tweet metadata ile birleştir
        const videos = videoFiles.map((data, index) => {
            const tweetMeta = tweetData.get(data.tweet_id) || tweetData.get(String(data.tweet_id)) || {};
            const videoUrl = data.url;
            const thumbUrl = `/api/twitter/thumbnail?id=${data.tweet_id || index}&url=${encodeURIComponent(videoUrl)}`;
            const rawContent = tweetMeta.content || data.content || '';
            const title = rawContent || `Twitter Video ${index + 1}`;
            const authorNick = data.author?.nick || data.user?.nick || tweetMeta.author?.nick || '';
            const authorName = data.author?.name || data.user?.name || tweetMeta.author?.name || cleanUsername;
            
            return {
                id: data.tweet_id || `video_${index}`,
                url: videoUrl,
                originalUrl: videoUrl,
                title: title,
                content: rawContent,
                description: `${authorNick ? authorNick + ' (@' + authorName + ')' : '@' + authorName}${data.date ? ' • ' + new Date(data.date).toLocaleDateString() : ''}`,
                thumbnail: thumbUrl,
                duration: data.duration || 0,
                timestamp: data.date ? new Date(data.date).getTime() / 1000 : null,
                view_count: tweetMeta.view_count || data.view_count || 0,
                like_count: tweetMeta.favorite_count || data.favorite_count || 0,
                author: authorNick || authorName,
                username: authorName,
                width: data.width || 0,
                height: data.height || 0
            };
        });

        return res.json({
            success: true,
            username: cleanUsername,
            count: videos.length,
            videos: videos
        });

    } catch (err) {
        console.error('Twitter fetch error:', err);
        return res.json({ 
            success: false, 
            error: 'Could not fetch Twitter videos. Make sure cookies.txt exists and is valid.' 
        });
    }
});

// Twitter video thumbnail endpoint (Otomatik kapak resmi oluşturucu & önbellek)
const TWITTER_THUMBS_DIR = path.join(THUMBNAILS_DIR, 'twitter');
if (!fs.existsSync(TWITTER_THUMBS_DIR)) fs.mkdirSync(TWITTER_THUMBS_DIR, { recursive: true });

app.get('/api/twitter/thumbnail', async (req, res) => {
    const { id, url } = req.query;
    if (!url) {
        return res.status(400).send('URL required');
    }

    const safeId = (id || 'thumb').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    const thumbPath = path.join(TWITTER_THUMBS_DIR, `${safeId}.jpg`);

    // Eğer önceden üretilmişse doğrudan cache'den ver
    if (fs.existsSync(thumbPath)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 gün
        return res.sendFile(thumbPath);
    }

    // FFmpeg ile videodan anında 1. saniye karesini çıkart (hızlı ve hafif)
    const localFfmpeg = path.join(__dirname, 'ffmpeg.exe');
    const ffmpegCmd = fs.existsSync(localFfmpeg) ? localFfmpeg : 'ffmpeg';

    const args = [
        '-ss', '00:00:01',
        '-i', url,
        '-vframes', '1',
        '-q:v', '3',
        '-update', '1',
        thumbPath,
        '-y'
    ];

    execFile(ffmpegCmd, args, { timeout: 15000 }, (error) => {
        if (!error && fs.existsSync(thumbPath)) {
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=604800');
            return res.sendFile(thumbPath);
        } else {
            // Başarısız olursa şeffaf/varsayılan boş döndür
            return res.status(404).send('Thumbnail could not be generated');
        }
    });
});

// Twitter video proxy (CORS bypass & Range support)
app.get('/api/twitter/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).send('URL required');
    }

    try {
        const https = require('https');
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://twitter.com/',
            'Accept': '*/*'
        };
        if (req.headers.range) {
            headers['range'] = req.headers.range;
        }

        const request = https.get(url, { headers }, (response) => {
            if (res.headersSent) return;

            // Handle redirects if any
            if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
                return res.redirect(response.headers.location);
            }

            res.status(response.statusCode || 200);
            if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
            if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
            if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            
            response.pipe(res);
            response.on('error', (err) => {
                if (!res.headersSent) {
                    try { res.status(500).end(); } catch (e) {}
                }
            });
        });

        request.on('error', (err) => {
            if (!res.headersSent) {
                try { res.status(500).send('Proxy error'); } catch (e) {}
            }
        });

        req.on('close', () => {
            try { request.destroy(); } catch (e) {}
        });
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).send('Failed to proxy video');
        }
    }
});

app.post('/api/twitter/download', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL required' });
    }

    try {
        const timestamp = Date.now();
        const filename = `twitter_${timestamp}.mp4`;
        const targetDir = path.join(DOWNLOADS_DIR, 'twitter');
        
        // Twitter klasörü yoksa oluştur
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const outputPath = path.join(targetDir, filename);

        const args = [
            '-o', outputPath,
            '--no-playlist',
            '--no-warnings',
            '-f', 'best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            ...getCookiesArgs(),
            ...getFfmpegArgs(),
            url
        ];

        execFile(getYtDlpCmd(), args, { timeout: 180000, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                return res.json({ 
                    success: false, 
                    error: stderr || error.message || 'Download failed' 
                });
            }

            if (fs.existsSync(outputPath)) {
                ensureH264(outputPath).then(() => {
                    res.json({ 
                        success: true, 
                        filename, 
                        path: `/downloads/twitter/${filename}` 
                    });
                }).catch(() => {
                    res.json({ 
                        success: true, 
                        filename, 
                        path: `/downloads/twitter/${filename}` 
                    });
                });
            } else {
                res.json({ success: false, error: 'File not created' });
            }
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
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
