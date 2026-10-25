document.addEventListener('DOMContentLoaded', async () => {
    // ==========================================
    // 1. SEKMELER ARASI GEÇİŞ
    // ==========================================
    const tabDirect = document.getElementById('tabDirect');
    const tabCrawler = document.getElementById('tabCrawler');
    const tabTools = document.getElementById('tabTools');

    const sectionDirect = document.getElementById('sectionDirect');
    const sectionCrawler = document.getElementById('sectionCrawler');
    const sectionTools = document.getElementById('sectionTools');

    function switchTab(activeTab, activeSection) {
        [tabDirect, tabCrawler, tabTools].forEach(t => t.classList.remove('active', 'primary-tab'));
        [sectionDirect, sectionCrawler, sectionTools].forEach(s => s.style.display = 'none');

        activeTab.classList.add('active');
        if (activeTab === tabDirect) activeTab.classList.add('primary-tab');
        activeSection.style.display = 'block';
    }

    tabDirect.addEventListener('click', () => switchTab(tabDirect, sectionDirect));
    tabCrawler.addEventListener('click', () => switchTab(tabCrawler, sectionCrawler));
    tabTools.addEventListener('click', () => switchTab(tabTools, sectionTools));

    // ==========================================
    // 2. SUNUCU BAĞLANTISI VE İSTATİSTİKLER
    // ==========================================
    const serverDot = document.getElementById('serverDot');
    const serverText = document.getElementById('serverText');
    const statPendingCount = document.getElementById('statPendingCount');
    const statServerCount = document.getElementById('statServerCount');

    async function checkServer() {
        try {
            const res = await fetch('http://localhost:3000/api/saved-links', { cache: 'no-cache' });
            if (res.ok) {
                const data = await res.json();
                serverDot.className = 'dot connected';
                serverText.textContent = 'Bağlı (:3000)';
                if (statServerCount) statServerCount.textContent = (data.links || []).length;
            } else {
                serverDot.className = 'dot';
                serverText.textContent = 'Bağlantı Yok';
            }
        } catch (err) {
            serverDot.className = 'dot';
            serverText.textContent = 'Bağlantı Yok';
        }

        // Bekleyen linkleri storage'dan oku
        chrome.storage.local.get(['collectedLinks'], (result) => {
            if (statPendingCount) {
                statPendingCount.textContent = (result.collectedLinks || []).length;
            }
        });
    }

    checkServer();
    const serverTimer = setInterval(checkServer, 1500);

    // ==========================================
    // 3. DOĞRUDAN İNDİR (LİNK GİRMELİ + SAVE AS)
    // ==========================================
    const linkInput = document.getElementById('linkInput');
    const clearInputBtn = document.getElementById('clearInputBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const getActiveTabBtn = document.getElementById('getActiveTabBtn');
    const downloadDirectBtn = document.getElementById('downloadDirectBtn');
    const directStatusMsg = document.getElementById('directStatusMsg');
    const detectedPlatformBadge = document.getElementById('detectedPlatformBadge');

    function detectPlatform(url) {
        if (!url) return null;
        const u = url.toLowerCase();
        if (u.includes('instagram.com')) return { name: 'Instagram', color: '#ec4899', bg: 'rgba(236,72,153,0.15)', border: 'rgba(236,72,153,0.3)' };
        if (u.includes('tiktok.com')) return { name: 'TikTok', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)', border: 'rgba(6,182,212,0.3)' };
        if (u.includes('youtube.com') || u.includes('youtu.be')) return { name: 'YouTube', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)' };
        if (u.includes('twitter.com') || u.includes('x.com')) return { name: 'X / Twitter', color: '#f4f4f5', bg: 'rgba(255,255,255,0.12)', border: 'rgba(255,255,255,0.25)' };
        return null;
    }

    function updateLinkInputUI() {
        const val = linkInput.value.trim();
        clearInputBtn.style.display = val ? 'block' : 'none';

        const platform = detectPlatform(val);
        if (platform) {
            detectedPlatformBadge.textContent = platform.name;
            detectedPlatformBadge.style.color = platform.color;
            detectedPlatformBadge.style.background = platform.bg;
            detectedPlatformBadge.style.borderColor = platform.border;
            detectedPlatformBadge.style.display = 'inline-block';
        } else {
            detectedPlatformBadge.style.display = 'none';
        }
    }

    linkInput.addEventListener('input', updateLinkInputUI);

    clearInputBtn.addEventListener('click', () => {
        linkInput.value = '';
        updateLinkInputUI();
        linkInput.focus();
    });

    // Panodan Yapıştır Butonu
    pasteBtn.addEventListener('click', async () => {
        try {
            const clip = await navigator.clipboard.readText();
            if (clip && clip.trim()) {
                linkInput.value = clip.trim();
                updateLinkInputUI();
                showStatus(directStatusMsg, 'success', '📋 Link panodan yapıştırıldı.');
            } else {
                showStatus(directStatusMsg, 'error', 'Pano boş veya metin içermiyor.');
            }
        } catch (err) {
            // Clipboard izni gerekebilir, kullanıcıya bilgi ver
            linkInput.focus();
            document.execCommand('paste');
            updateLinkInputUI();
        }
    });

    // Açık Sekmeyi Al Butonu
    getActiveTabBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                linkInput.value = tab.url;
                updateLinkInputUI();
                showStatus(directStatusMsg, 'success', '🌐 Aktif sekme linki alındı.');
            }
        } catch (err) {
            showStatus(directStatusMsg, 'error', 'Aktif sekme URL\'si alınamadı.');
        }
    });

    // Otomatik olarak aktif sekmeyi kontrol et (Eğer video sitesindeyse otomatik doldur)
    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (currentTab && currentTab.url) {
            const plat = detectPlatform(currentTab.url);
            if (plat && (currentTab.url.includes('/reel/') || currentTab.url.includes('/video/') || currentTab.url.includes('/status/') || currentTab.url.includes('/shorts/'))) {
                linkInput.value = currentTab.url;
                updateLinkInputUI();
            }

            // Akış sayfası etiketini güncelle
            const activePageBadge = document.getElementById('activePageBadge');
            if (activePageBadge) {
                if (currentTab.url.includes('tiktok.com')) {
                    activePageBadge.textContent = 'TikTok Açık';
                    activePageBadge.style.color = '#06b6d4';
                } else if (currentTab.url.includes('instagram.com')) {
                    activePageBadge.textContent = 'Instagram Açık';
                    activePageBadge.style.color = '#ec4899';
                } else if (currentTab.url.includes('x.com') || currentTab.url.includes('twitter.com')) {
                    activePageBadge.textContent = 'Twitter / X Açık';
                    activePageBadge.style.color = '#ffffff';
                } else {
                    activePageBadge.textContent = 'Desteklenen Sayfa Değil';
                    activePageBadge.style.color = '#71717a';
                }
            }
        }
    } catch (e) {}

    function showStatus(element, type, text) {
        if (!element) return;
        element.className = `status-msg ${type}`;
        element.textContent = text;
        element.style.display = 'block';
    }

    // DOĞRUDAN İNDİR BUTONU TIKLANDIĞINDA
    downloadDirectBtn.addEventListener('click', async () => {
        let url = linkInput.value.trim();

        // Eğer kutu boşsa aktif sekmeyi kullan
        if (!url) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && detectPlatform(tab.url)) {
                url = tab.url;
                linkInput.value = url;
                updateLinkInputUI();
            }
        }

        if (!url) {
            showStatus(directStatusMsg, 'error', '⚠️ Lütfen bir video linki yapıştırın veya aktif sekmeyi alın.');
            return;
        }

        downloadDirectBtn.disabled = true;
        downloadDirectBtn.innerHTML = `
            <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
            </svg>
            Video Hazırlanıyor...
        `;
        showStatus(directStatusMsg, 'loading', '⏳ Video sunucuda hazırlanıyor. Birazdan Farklı Kaydet penceresi açılacak...');

        try {
            let endpoint = 'http://localhost:3000/api/download';
            if (url.includes('twitter.com') || url.includes('x.com')) {
                endpoint = 'http://localhost:3000/api/twitter/download';
            }

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });

            const data = await res.json();
            if (data.success && data.path) {
                const downloadUrl = `http://localhost:3000${data.path}`;
                const filename = data.filename || `video_${Date.now()}.mp4`;

                // SS'DEKİ GİBİ WİNDOWS FARKLI KAYDET PENCERESİNİ AÇ!
                chrome.downloads.download({
                    url: downloadUrl,
                    filename: filename,
                    saveAs: true // Kullanıcıya nereye kaydedeceğini soran pencereyi tetikler
                }, (downloadId) => {
                    if (chrome.runtime.lastError || !downloadId) {
                        showStatus(directStatusMsg, 'error', 'Kaydetme penceresi iptal edildi veya kapandı.');
                    } else {
                        showStatus(directStatusMsg, 'success', '✅ Farklı Kaydet penceresi açıldı! Dosya seçtiğiniz konuma kaydediliyor.');
                    }
                });
            } else {
                // Sunucu hata verdiyse doğrudan akış URL'siyle Farklı Kaydet dene
                const infoRes = await fetch(`http://localhost:3000/api/video-play-info?url=${encodeURIComponent(url)}`);
                const infoData = await infoRes.json();
                const streamUrl = infoData.streamUrl || `http://localhost:3000/api/video-stream?url=${encodeURIComponent(url)}`;
                const filename = `video_${Date.now()}.mp4`;

                chrome.downloads.download({
                    url: streamUrl,
                    filename: filename,
                    saveAs: true
                }, (downloadId) => {
                    if (chrome.runtime.lastError || !downloadId) {
                        showStatus(directStatusMsg, 'error', 'Hata: ' + (data.error || 'İndirme başlatılamadı.'));
                    } else {
                        showStatus(directStatusMsg, 'success', '✅ Farklı Kaydet penceresi açıldı!');
                    }
                });
            }
        } catch (err) {
            showStatus(directStatusMsg, 'error', 'Sunucu bağlantı hatası: Sunucunun (http://localhost:3000) açık olduğundan emin olun.');
        } finally {
            downloadDirectBtn.disabled = false;
            downloadDirectBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Doğrudan İndir (Konum Seç)
            `;
        }
    });

    // ==========================================
    // 4. OTOMATİK AKIŞ KAYDIRICI & TOPLAYICI
    // ==========================================
    const scrollBtn = document.getElementById('autoScrollBtn');
    const captureToggle = document.getElementById('captureToggle');
    const fastModeToggle = document.getElementById('fastModeToggle');
    const scrollCount = document.getElementById('scrollCount');

    // Kayıtlı ayarları geri yükle
    chrome.storage.local.get(['extensionSettings'], (result) => {
        if (result.extensionSettings) {
            if (captureToggle) captureToggle.checked = result.extensionSettings.captureEnabled;
            if (fastModeToggle) fastModeToggle.checked = result.extensionSettings.fastMode;
            if (scrollCount) scrollCount.value = result.extensionSettings.maxScrolls;
        }
    });

    function saveSettings() {
        chrome.storage.local.set({
            extensionSettings: {
                captureEnabled: captureToggle.checked,
                fastMode: fastModeToggle.checked,
                maxScrolls: parseInt(scrollCount.value) || 0
            }
        });
    }

    if (captureToggle) captureToggle.addEventListener('change', saveSettings);
    if (fastModeToggle) fastModeToggle.addEventListener('change', saveSettings);
    if (scrollCount) scrollCount.addEventListener('input', saveSettings);

    if (scrollBtn) {
        scrollBtn.addEventListener('click', async () => {
            const settings = {
                captureEnabled: captureToggle.checked,
                fastMode: fastModeToggle.checked,
                maxScrolls: parseInt(scrollCount.value) || 0
            };
            saveSettings();

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, { action: "toggleAutoScroll", settings }, (res) => {
                    if (chrome.runtime.lastError) {
                        alert('Bu sayfa otomatik kaydırmayı desteklemiyor. Lütfen Instagram Reels veya TikTok akışında deneyin.');
                        return;
                    }
                    if (res && res.isScrolling) {
                        scrollBtn.textContent = '🛑 Otomatik Kaydırmayı Durdur';
                        scrollBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
                    } else {
                        scrollBtn.textContent = '🚀 Otomatik Kaydırmayı Başlat';
                        scrollBtn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
                    }
                });
            }
        });

        // Başlangıçta durumu kontrol et
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
            chrome.tabs.sendMessage(activeTab.id, { action: "getScrollStatus" }, (res) => {
                if (!chrome.runtime.lastError && res && res.isScrolling) {
                    scrollBtn.textContent = '🛑 Otomatik Kaydırmayı Durdur';
                    scrollBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
                }
            });
        }
    }

    // ==========================================
    // 5. COOKIE AKTARMA
    // ==========================================
    const syncCookiesBtn = document.getElementById('syncCookiesBtn');
    const cookieStatusMsg = document.getElementById('cookieStatusMsg');

    function cookiesToNetscape(cookies) {
        let lines = [
            '# Netscape HTTP Cookie File',
            '# Generated by Reels & TikTok Extension',
            ''
        ];
        for (const c of cookies) {
            const domain = c.domain || '';
            const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
            const path = c.path || '/';
            const secure = c.secure ? 'TRUE' : 'FALSE';
            const expiry = c.expirationDate ? Math.round(c.expirationDate) : (Math.round(Date.now() / 1000) + 31536000);
            lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
        }
        return lines.join('\n') + '\n';
    }

    if (syncCookiesBtn) {
        syncCookiesBtn.addEventListener('click', async () => {
            syncCookiesBtn.disabled = true;
            syncCookiesBtn.textContent = "⏳ Cookieler Çekiliyor...";
            showStatus(cookieStatusMsg, 'loading', 'Çerezler okunuyor...');

            try {
                const [igCookies, ttCookies, twCookies, xCookies] = await Promise.all([
                    chrome.cookies.getAll({ domain: "instagram.com" }),
                    chrome.cookies.getAll({ domain: "tiktok.com" }),
                    chrome.cookies.getAll({ domain: "twitter.com" }),
                    chrome.cookies.getAll({ domain: "x.com" })
                ]);

                const totalCookies = [...(igCookies || []), ...(ttCookies || []), ...(twCookies || []), ...(xCookies || [])];

                if (totalCookies.length === 0) {
                    showStatus(cookieStatusMsg, 'error', '⚠️ Tarayıcıda Instagram, TikTok veya Twitter açık değil / giriş yapılmamış.');
                    syncCookiesBtn.disabled = false;
                    syncCookiesBtn.textContent = "🍪 Cookieleri Sunucuya Aktar (IG, TT, X)";
                    return;
                }

                const netscapeData = cookiesToNetscape(totalCookies);

                const res = await fetch('http://localhost:3000/api/cookies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cookies: netscapeData })
                });

                const data = await res.json();
                if (data.success) {
                    const twitterTotal = (twCookies.length + xCookies.length);
                    showStatus(cookieStatusMsg, 'success', `✅ Başarıyla aktarıldı! (${igCookies.length} IG, ${ttCookies.length} TT, ${twitterTotal} Twitter).`);
                } else {
                    showStatus(cookieStatusMsg, 'error', 'Hata: ' + (data.error || 'Sunucuya kaydedilemedi.'));
                }
            } catch (err) {
                showStatus(cookieStatusMsg, 'error', 'Bağlantı hatası: Sunucu açık mı? (http://localhost:3000)');
            } finally {
                setTimeout(() => {
                    syncCookiesBtn.disabled = false;
                    syncCookiesBtn.textContent = "🍪 Cookieleri Sunucuya Aktar (IG, TT, X)";
                }, 3500);
            }
        });
    }
});
