const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Sadece Linux (Render, Koyeb, VPS vb.) ortamında çalıştır
if (process.platform === 'linux') {
    console.log('[Setup-Cloud] Linux ortamı algılandı. Bağımlılıklar kontrol ediliyor...');

    const localYtDlp = path.join(__dirname, 'yt-dlp');
    if (!fs.existsSync(localYtDlp)) {
        console.log('[Setup-Cloud] yt-dlp indiriliyor...');
        try {
            execSync(`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${localYtDlp}" && chmod a+rx "${localYtDlp}"`, { stdio: 'inherit' });
            console.log('[Setup-Cloud] yt-dlp başarıyla kuruldu.');
        } catch (e) {
            console.error('[Setup-Cloud] yt-dlp curl ile indirilemedi, https ile deneniyor...', e.message);
        }
    } else {
        try {
            execSync(`chmod a+rx "${localYtDlp}"`);
        } catch (e) {}
    }

    // Klasörleri hazırla
    ['downloads', 'downloads/instagram', 'downloads/tiktok', 'downloads/youtube', 'downloads/twitter', 'thumbnails'].forEach(dir => {
        const p = path.join(__dirname, dir);
        if (!fs.existsSync(p)) {
            try { fs.mkdirSync(p, { recursive: true }); } catch(e) {}
        }
    });

    console.log('[Setup-Cloud] Bulut kurulumu tamamlandı.');
}
