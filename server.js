const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

const getYtDlpCmd = () => {
    const localYtDlp = path.join(__dirname, 'yt-dlp');
    if (fs.existsSync(localYtDlp)) return localYtDlp;
    return 'yt-dlp';
};

// İndirilen videolar için klasör
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const TIKTOK_DIR = path.join(DOWNLOADS_DIR, 'tiktok');
const INSTA_DIR = path.join(DOWNLOADS_DIR, 'instagram');

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(TIKTOK_DIR)) fs.mkdirSync(TIKTOK_DIR, { recursive: true });
if (!fs.existsSync(INSTA_DIR)) fs.mkdirSync(INSTA_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOADS_DIR));

// CORS - Chrome eklentisinden gelen istekler için
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// yt-dlp ile video bilgisi çek (indirmeden)
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
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
                    platform: url.includes('tiktok') ? 'tiktok' : 'instagram',
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
        const platform = url.includes('tiktok') ? 'tiktok' : 'instagram';
        const targetDir = platform === 'tiktok' ? TIKTOK_DIR : INSTA_DIR;
        const outputPath = path.join(targetDir, filename);
        const args = [
            '-o', outputPath,
            '--no-playlist',
            '--no-warnings',
            '--merge-output-format', 'mp4',
            '-f', 'best[ext=mp4]/best',
            url
        ];

        const child = execFile(getYtDlpCmd(), args, { timeout: 120000 }, (error, stdout, stderr) => {
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
                // yt-dlp bazen farklı uzantı ekleyebilir
                const possibleFile = outputPath.replace('.mp4', '') + '.mp4';
                if (fs.existsSync(possibleFile)) {
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

// Video indir
app.post('/api/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL gerekli' });

    try {
        const timestamp = Date.now();
        const platform = url.includes('tiktok') ? 'tiktok' : 'reels';
        const filename = `${platform}_${timestamp}.mp4`;
        const result = await downloadVideo(url.trim(), filename);
        res.json(result);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// İndirilen dosyaları listele
app.get('/api/files', (req, res) => {
    try {
        let allFiles = [];
        
        const readPlatformDir = (dir, platformName) => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).filter(f => f.endsWith('.mp4')).forEach(f => {
                    const stats = fs.statSync(path.join(dir, f));
                    allFiles.push({
                        name: f,
                        path: `/downloads/${platformName}/${f}`,
                        size: stats.size,
                        date: stats.mtime,
                        platform: platformName
                    });
                });
            }
        };

        readPlatformDir(TIKTOK_DIR, 'tiktok');
        readPlatformDir(INSTA_DIR, 'instagram');
        
        // Klasör dışındaki ana dizindekileri de oku (geriye dönük uyumluluk)
        if (fs.existsSync(DOWNLOADS_DIR)) {
            fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.mp4') && fs.statSync(path.join(DOWNLOADS_DIR, f)).isFile()).forEach(f => {
                const stats = fs.statSync(path.join(DOWNLOADS_DIR, f));
                allFiles.push({
                    name: f,
                    path: `/downloads/${f}`,
                    size: stats.size,
                    date: stats.mtime,
                    platform: f.includes('tiktok') ? 'tiktok' : 'instagram'
                });
            });
        }

        allFiles.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json({ files: allFiles });
    } catch (err) {
        res.json({ files: [] });
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
app.get('/api/local-ip', (req, res) => {
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';
    
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                localIp = alias.address;
                break;
            }
        }
    }
    res.json({ ip: localIp, port: PORT, url: `http://${localIp}:${PORT}` });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎬 Reels & TikTok İndirici çalışıyor: http://localhost:${PORT}`);
    console.log(`📱 Telefondan bağlanmak için aynı Wi-Fi üzerinden şu adrese girin: http://<Senin-IP-Adresin>:${PORT}\n`);
});
