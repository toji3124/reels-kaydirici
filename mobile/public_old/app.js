// ============================================
// STATE
// ============================================
let isProcessing = false;
let currentTab = 'manual';

// ============================================
// DOM ELEMENTS
// ============================================
// Tabs
const tabs = document.querySelectorAll('.sidebar-tab');
const tabContents = document.querySelectorAll('.tab-content');
const collectedBadge = document.getElementById('collectedBadge');

// Manual Input
const linksInput = document.getElementById('linksInput');
const linkCount = document.getElementById('linkCount');
const clearBtn = document.getElementById('clearBtn');
const pasteBtn = document.getElementById('pasteBtn');
const processBtn = document.getElementById('processBtn');
const processBtnText = document.getElementById('processBtnText');

// Progress
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const progressPercentage = document.getElementById('progressPercentage');

// Results
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const successCount = document.getElementById('successCount');
const failCount = document.getElementById('failCount');

// Collected Links
const collectedList = document.getElementById('collectedList');
const refreshLinksBtn = document.getElementById('refreshLinksBtn');
const downloadCollectedBtn = document.getElementById('downloadCollectedBtn');
const clearLinksBtn = document.getElementById('clearLinksBtn');

// Downloaded Files
const downloadedList = document.getElementById('downloadedList');

// ============================================
// TOAST SYSTEM
// ============================================
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✗', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.95)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// TAB SWITCHING
// ============================================
console.log('Tab switching initializing, found tabs:', tabs.length);

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        console.log('Tab clicked:', target, 'Current tab:', currentTab);
        
        if (target === currentTab) return;

        // Update active classes
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Activate selected tab
        tab.classList.add('active');
        const panelId = 'panel' + target.charAt(0).toUpperCase() + target.slice(1);
        const targetContent = document.getElementById(panelId);
        
        console.log('Looking for panel:', panelId, 'Found:', !!targetContent);
        
        if (targetContent) {
            targetContent.classList.add('active');
        } else {
            console.error('Panel not found:', panelId);
        }

        currentTab = target;

        // Load data when switching to specific tabs
        if (target === 'collected') {
            fetchCollectedLinks();
        } else if (target === 'downloaded') {
            fetchDownloadedFiles();
        } else if (target === 'favorites') {
            renderFavoritesTab();
        }
    });
});

// ============================================
// PROFILE TAB LOGIC
// ============================================
const profileInput = document.getElementById('profileInput');
const profileLimit = document.getElementById('profileLimit');
const fetchProfileBtn = document.getElementById('fetchProfileBtn');
const profileResultsSection = document.getElementById('profileResultsSection');
const profileTitleText = document.getElementById('profileTitleText');
const profileVideoCountBadge = document.getElementById('profileVideoCountBadge');
const profileVideosList = document.getElementById('profileVideosList');
const downloadAllProfileVideosBtn = document.getElementById('downloadAllProfileVideosBtn');

let currentProfileVideos = [];

if (fetchProfileBtn) {
    fetchProfileBtn.addEventListener('click', async () => {
        const url = (profileInput ? profileInput.value : '').trim();
        if (!url) {
            showToast('Lütfen bir profil linki veya kullanıcı adı girin.', 'error');
            return;
        }

        const limit = parseInt(profileLimit ? profileLimit.value : '50', 10);
        fetchProfileBtn.disabled = true;
        fetchProfileBtn.innerHTML = '<span class="spinner"></span> Taranıyor...';

        try {
            const res = await fetch('/api/fetch-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, limit })
            });
            const data = await res.json();

            if (data.success && data.videos && data.videos.length > 0) {
                currentProfileVideos = data.videos;
                profileTitleText.textContent = `@${data.uploader} (${data.platform.toUpperCase()})`;
                profileVideoCountBadge.textContent = `${data.count} video bulundu`;

                profileVideosList.innerHTML = data.videos.map((v, i) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 6px;">
                        <div style="font-size: 13px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">
                            <span style="color: #f59e0b; margin-right: 6px;">#${i + 1}</span> ${v.title}
                        </div>
                        <a href="${v.url}" target="_blank" style="color: #3b82f6; font-size: 11px; text-decoration: none;">Aç ↗</a>
                    </div>
                `).join('');

                profileResultsSection.style.display = 'block';
                showToast(`${data.count} video başarıyla çekildi!`, 'success');
            } else {
                showToast(data.error || 'Bu profilde video bulunamadı veya profil gizli.', 'error');
            }
        } catch (err) {
            showToast('Hata: ' + err.message, 'error');
        } finally {
            fetchProfileBtn.disabled = false;
            fetchProfileBtn.textContent = '⚡ Videoları Çek';
        }
    });
}

if (downloadAllProfileVideosBtn) {
    downloadAllProfileVideosBtn.addEventListener('click', async () => {
        if (!currentProfileVideos || currentProfileVideos.length === 0) return;

        const urlsText = currentProfileVideos.map(v => v.url).join('\n');
        linksInput.value = urlsText;
        linksInput.dispatchEvent(new Event('input'));

        const tabManualBtn = document.getElementById('tabManual');
        if (tabManualBtn) tabManualBtn.click();

        showToast('Videolar indirme kuyruğuna aktarıldı, başlatılıyor...', 'info');
        processBtn.click();
    });
}

// ============================================
// EXPLORE (HARVESTER) LOGIC (TikTok & Instagram)
// ============================================
const explorePlatformSelect = document.getElementById('explorePlatformSelect');
const exploreCountSelect = document.getElementById('exploreCountSelect');
const exploreActionType = document.getElementById('exploreActionType');
const startHarvestBtn = document.getElementById('startHarvestBtn');
const stopHarvestBtn = document.getElementById('stopHarvestBtn');
const harvestProgressArea = document.getElementById('harvestProgressArea');
const harvestStatusText = document.getElementById('harvestStatusText');
const harvestPercentText = document.getElementById('harvestPercentText');
const harvestProgressBar = document.getElementById('harvestProgressBar');
const harvestResultsArea = document.getElementById('harvestResultsArea');
const harvestResultCountBadge = document.getElementById('harvestResultCountBadge');
const harvestLinksList = document.getElementById('harvestLinksList');
const harvestSendToCollectedBtn = document.getElementById('harvestSendToCollectedBtn');
const harvestDownloadAllBtn = document.getElementById('harvestDownloadAllBtn');
const exploreLiveBadge = document.getElementById('exploreLiveBadge');

let harvestPollInterval = null;
let currentHarvestLinks = [];

if (explorePlatformSelect) {
    explorePlatformSelect.addEventListener('change', () => {
        const isInsta = explorePlatformSelect.value === 'instagram';
        if (startHarvestBtn) {
            if (isInsta) {
                startHarvestBtn.style.background = 'linear-gradient(135deg, #f59e0b, #ec4899)';
                startHarvestBtn.innerHTML = '📸 Reels Akışını Çek';
            } else {
                startHarvestBtn.style.background = 'linear-gradient(135deg, #00f2ea, #059669)';
                startHarvestBtn.innerHTML = '🚀 Keşfeti Tara ve Çek';
            }
        }
    });
}

async function pollHarvestStatus() {
    try {
        const res = await fetch('/api/harvest-status');
        const data = await res.json();
        const pLabel = (data.platform === 'instagram') ? 'Instagram Reels' : 'TikTok Keşfet';

        if (data.isRunning) {
            if (exploreLiveBadge) exploreLiveBadge.style.display = 'inline-block';
            if (harvestProgressArea) harvestProgressArea.style.display = 'block';
            if (startHarvestBtn) startHarvestBtn.style.display = 'none';
            if (stopHarvestBtn) stopHarvestBtn.style.display = 'inline-flex';

            const pct = data.target > 0 ? Math.min(100, Math.round((data.found / data.target) * 100)) : 0;
            if (harvestProgressBar) harvestProgressBar.style.width = `${pct}%`;
            if (harvestPercentText) harvestPercentText.textContent = `${data.found} / ${data.target} (%${pct})`;
            if (harvestStatusText) harvestStatusText.textContent = `⚡ ${pLabel} taranıyor... (${data.found} video bulundu)`;
        } else {
            if (harvestPollInterval) {
                clearInterval(harvestPollInterval);
                harvestPollInterval = null;
            }
            if (exploreLiveBadge) exploreLiveBadge.style.display = 'none';
            if (startHarvestBtn) startHarvestBtn.style.display = 'inline-flex';
            if (stopHarvestBtn) stopHarvestBtn.style.display = 'none';

            if (data.links && data.links.length > 0) {
                currentHarvestLinks = data.links;
                if (harvestProgressBar) harvestProgressBar.style.width = '100%';
                if (harvestPercentText) harvestPercentText.textContent = `${data.links.length} / ${data.target}`;
                if (harvestStatusText) harvestStatusText.textContent = `✅ Tamamlandı! Toplam ${data.links.length} ${pLabel} videosu toplandı.`;

                renderHarvestResults(data.links);
                showToast(`🎯 ${data.links.length} adet ${pLabel} videosu toplandı!`, 'success');
                fetchCollectedLinks();
            } else if (data.error) {
                if (harvestStatusText) harvestStatusText.textContent = `❌ ${data.error}`;
                showToast(data.error, 'error');
            }
        }
    } catch (err) {
        console.error('Harvest poll hatası:', err);
    }
}

function renderHarvestResults(links) {
    if (!harvestResultsArea || !harvestLinksList) return;
    harvestResultsArea.style.display = 'block';
    if (harvestResultCountBadge) harvestResultCountBadge.textContent = `(${links.length} video)`;

    harvestLinksList.innerHTML = links.map((link, idx) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 6px; background: rgba(255,255,255,0.05); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                <span style="color: #00f2ea; font-size: 12px; font-weight: bold; min-width: 25px;">#${idx + 1}</span>
                <span style="font-size: 13px; color: #ddd; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 500px;">${link}</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-secondary" onclick="window.open('${link}', '_blank')" style="padding: 4px 10px; font-size: 12px;">🔗 Aç</button>
            </div>
        </div>
    `).join('');
}

if (startHarvestBtn) {
    startHarvestBtn.addEventListener('click', async () => {
        const platform = explorePlatformSelect ? explorePlatformSelect.value : 'tiktok';
        const count = parseInt(exploreCountSelect ? exploreCountSelect.value : '200', 10);
        const autoDownload = (exploreActionType ? exploreActionType.value : '') === 'download';
        const isInsta = platform === 'instagram';
        const pLabel = isInsta ? 'Instagram Reels' : 'TikTok Keşfet';

        try {
            if (harvestProgressArea) harvestProgressArea.style.display = 'block';
            if (harvestProgressBar) harvestProgressBar.style.width = '0%';
            if (harvestPercentText) harvestPercentText.textContent = `0 / ${count}`;
            if (harvestStatusText) harvestStatusText.textContent = `🚀 Tarayıcı arka planda başlatılıyor ve ${pLabel} açılıyor...`;
            if (startHarvestBtn) startHarvestBtn.style.display = 'none';
            if (stopHarvestBtn) stopHarvestBtn.style.display = 'inline-flex';
            if (harvestResultsArea) harvestResultsArea.style.display = 'none';

            const res = await fetch('/api/harvest-start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, count, autoDownload })
            });
            const data = await res.json();

            if (data.success) {
                showToast(`🎯 ${pLabel} taraması başladı (${count} video)`, 'info');
                if (harvestPollInterval) clearInterval(harvestPollInterval);
                harvestPollInterval = setInterval(pollHarvestStatus, 1000);
            } else {
                showToast(data.error || 'Tarama başlatılamadı', 'error');
                if (startHarvestBtn) startHarvestBtn.style.display = 'inline-flex';
                if (stopHarvestBtn) stopHarvestBtn.style.display = 'none';
            }
        } catch (err) {
            showToast('Sunucu bağlantı hatası: ' + err.message, 'error');
            if (startHarvestBtn) startHarvestBtn.style.display = 'inline-flex';
            if (stopHarvestBtn) stopHarvestBtn.style.display = 'none';
        }
    });
}

if (stopHarvestBtn) {
    stopHarvestBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/harvest-stop', { method: 'POST' });
            showToast('Tarama durduruluyor...', 'info');
        } catch (e) { }
    });
}

if (harvestSendToCollectedBtn) {
    harvestSendToCollectedBtn.addEventListener('click', async () => {
        if (currentHarvestLinks.length === 0) return;
        try {
            const linksPayload = currentHarvestLinks.map(l => ({ url: l, title: 'TikTok Keşfet' }));
            const res = await fetch('/api/save-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links: linksPayload })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`✅ ${data.added} yeni link toplananlara eklendi!`, 'success');
                fetchCollectedLinks();
            }
        } catch (e) {
            showToast('Hata: ' + e.message, 'error');
        }
    });
}

if (harvestDownloadAllBtn) {
    harvestDownloadAllBtn.addEventListener('click', () => {
        if (currentHarvestLinks.length === 0) return;
        const text = currentHarvestLinks.join('\n');
        if (linksInput) {
            linksInput.value = text;
            linksInput.dispatchEvent(new Event('input'));
            const tabManual = document.getElementById('tabManual');
            if (tabManual) tabManual.click();
            if (processBtn) processBtn.click();
            showToast(`${currentHarvestLinks.length} video indirme kuyruğuna alındı!`, 'success');
        }
    });
}


// ============================================
// MANUAL INPUT TAB
// ============================================
linksInput.addEventListener('input', () => {
    const lines = linksInput.value.split('\n').filter(line => line.trim() !== '');
    const count = Math.min(lines.length, 1000);
    linkCount.textContent = count;
    linkCount.style.color = count > 1000 ? '#ef4444' : (count > 0 ? '#8b5cf6' : '');
});

clearBtn.addEventListener('click', () => {
    linksInput.value = '';
    linksInput.dispatchEvent(new Event('input'));
    resultsSection.style.display = 'none';
    progressSection.style.display = 'none';
    showToast('Temizlendi', 'info');
});

pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            if (linksInput.value && !linksInput.value.endsWith('\n')) linksInput.value += '\n';
            linksInput.value += text;
            linksInput.dispatchEvent(new Event('input'));
            showToast('Yapıştırıldı', 'success');
        }
    } catch (err) {
        showToast('Pano erişimi reddedildi', 'error');
    }
});

let isCancelled = false;
let activeDownloads = [];
const cancelBtn = document.getElementById('cancelBtn');

cancelBtn.addEventListener('click', async () => {
    if (!isProcessing) return;
    isCancelled = true;
    cancelBtn.disabled = true;
    cancelBtn.innerHTML = '<span class="spinner"></span> İptal ediliyor...';

    // Sunucuya aktif indirmeleri iptal etmesi için istek at
    for (const url of activeDownloads) {
        try {
            await fetch('/api/cancel-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
        } catch (e) { }
    }
});

processBtn.addEventListener('click', async () => {
    if (isProcessing) return;

    const urls = linksInput.value.split('\n').map(l => l.trim()).filter(l => l.includes('instagram.com') || l.includes('tiktok.com') || l.includes('youtube.com') || l.includes('youtu.be'));
    if (urls.length === 0) return showToast('Lütfen geçerli Instagram, TikTok veya YouTube linki girin', 'error');

    startProcessing(urls.length);
    resultsGrid.innerHTML = '';

    let successes = 0;
    let completed = 0;

    // Create UI cards
    const cards = urls.map((url, i) => {
        const card = createResultCard(url, i + 1, 'info', 'Bekliyor...');
        resultsGrid.appendChild(card);
        return { url, card };
    });

    // UI'dan paralel indirme sayısını al
    const limitInput = document.getElementById('parallelLimitInput');
    let PARALLEL_LIMIT = limitInput ? parseInt(limitInput.value) : 25;
    if (isNaN(PARALLEL_LIMIT) || PARALLEL_LIMIT < 1) PARALLEL_LIMIT = 1;
    if (PARALLEL_LIMIT > 50) PARALLEL_LIMIT = 50;

    for (let i = 0; i < cards.length; i += PARALLEL_LIMIT) {
        if (isCancelled) break;

        const chunk = cards.slice(i, i + PARALLEL_LIMIT);

        // İşlemleri paralel başlat
        await Promise.all(chunk.map(async ({ url, card }) => {
            if (isCancelled) {
                updateResultCard(card, false, 'İptal edildi');
                return;
            }

            updateResultCard(card, true, 'İşleniyor...');

            try {
                // Info
                const infoRes = await fetch('/api/info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const infoData = await infoRes.json();

                if (isCancelled) {
                    updateResultCard(card, false, 'İptal edildi');
                    return;
                }

                if (!infoData.success) {
                    updateResultCard(card, false, infoData.error || 'Bilgi alınamadı');
                } else {
                    updateResultCard(card, true, 'İndiriliyor...', infoData);

                    activeDownloads.push(url);
                    const downRes = await fetch('/api/download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    });
                    activeDownloads = activeDownloads.filter(u => u !== url);

                    if (isCancelled) {
                        updateResultCard(card, false, 'İptal edildi');
                        return;
                    }

                    const downData = await downRes.json();

                    if (downData.success) {
                        successes++;
                        updateResultCard(card, true, 'İndirildi', downData, true);
                    } else {
                        updateResultCard(card, false, downData.error || 'İndirme hatası');
                    }
                }
            } catch (err) {
                activeDownloads = activeDownloads.filter(u => u !== url);
                updateResultCard(card, false, 'Bağlantı hatası veya iptal');
            }

            completed++;
            updateProgress(completed, urls.length);
        }));
    }

    finishProcessing(successes, urls.length - successes);
});

function startProcessing(total) {
    isProcessing = true;
    isCancelled = false;
    activeDownloads = [];
    processBtn.style.display = 'none';
    cancelBtn.style.display = 'inline-flex';
    cancelBtn.disabled = false;
    cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> İptal`;

    progressSection.style.display = 'block';
    resultsSection.style.display = 'block';
    successCount.textContent = `0 başarılı`;
    failCount.textContent = `0 başarısız`;
    updateProgress(0, total);
}

function updateProgress(current, total) {
    const pct = (current / total) * 100;
    progressBar.style.width = `${pct}%`;
    progressPercentage.textContent = `${Math.round(pct)}%`;
    progressLabel.textContent = `${current} / ${total} işlendi`;
}

function finishProcessing(successes, failures) {
    isProcessing = false;
    processBtn.style.display = 'inline-flex';
    cancelBtn.style.display = 'none';
    progressSection.style.display = 'none';
    successCount.textContent = `${successes} başarılı`;
    failCount.textContent = `${failures} başarısız`;
    if (isCancelled) {
        showToast(`İşlem iptal edildi`, 'info');
    } else {
        showToast(`${successes} video indirildi`, 'success');
    }
}

function createResultCard(url, index, statusClass, statusText) {
    const card = document.createElement('div');
    card.className = `result-card ${statusClass}`;

    const isIg = url.includes('instagram.com');
    const isYt = url.includes('youtube.com') || url.includes('youtu.be');
    const platform = isYt ? 'YT' : (isIg ? 'IG' : 'TT');
    const pStyle = isYt
        ? 'background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4);'
        : (isIg
            ? 'background: rgba(236, 72, 153, 0.2); color: #ec4899; border: 1px solid rgba(236, 72, 153, 0.4);'
            : 'background: rgba(0, 242, 234, 0.2); color: #00f2ea; border: 1px solid rgba(0, 242, 234, 0.4);');

    card.innerHTML = `
        <div class="result-index">${index}</div>
        <div class="result-info">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                <span class="platform-tag" style="padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; ${pStyle}">${platform}</span>
                <span class="result-url">${url}</span>
            </div>
            <div class="result-status status-text">${statusText}</div>
        </div>
        <div class="result-actions"></div>
    `;
    return card;
}

function updateResultCard(card, success, statusText, data = null, showDownloadBtn = false) {
    card.className = `result-card ${success ? 'success' : 'error'}`;
    card.querySelector('.status-text').textContent = success ? `✓ ${statusText}` : `✗ ${statusText}`;
    card.querySelector('.status-text').className = `result-status status-text ${success ? 'success' : 'error'}`;

    if (showDownloadBtn && data && data.path) {
        const btn = document.createElement('a');
        btn.href = data.path;
        btn.download = data.filename || 'video.mp4';
        btn.className = 'btn btn-download';
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Kaydet`;
        card.querySelector('.result-actions').innerHTML = '';
        card.querySelector('.result-actions').appendChild(btn);
    }
}

// ============================================
// COLLECTED LINKS TAB
// ============================================
async function fetchCollectedLinks() {
    try {
        const res = await fetch('/api/saved-links');
        const data = await res.json();
        const links = data.links || [];

        // Update badge
        if (links.length > 0) {
            collectedBadge.style.display = 'flex';
            collectedBadge.textContent = links.length;
        } else {
            collectedBadge.style.display = 'none';
        }

        renderCollectedLinks(links);
    } catch (err) {
        showToast('Toplanan linkler alınamadı', 'error');
    }
}

const selectAllBtn = document.getElementById('selectAllBtn');
const selectIgBtn = document.getElementById('selectIgBtn');
const selectTtBtn = document.getElementById('selectTtBtn');
const selectYtBtn = document.getElementById('selectYtBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const selectedCountBadge = document.getElementById('selectedCountBadge');

function updateSelectedCount() {
    const all = document.querySelectorAll('.collected-checkbox');
    const checked = document.querySelectorAll('.collected-checkbox:checked');
    if (selectedCountBadge) {
        selectedCountBadge.textContent = `${checked.length} / ${all.length} video seçildi`;
    }
    if (downloadCollectedBtn) {
        downloadCollectedBtn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
        downloadCollectedBtn.innerHTML = `📥 Seçilenleri İndir (${checked.length})`;
    }
}

function renderCollectedLinks(links) {
    if (links.length === 0) {
        collectedList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--text-muted);"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                <p>Henüz toplanan link yok</p>
                <span>Eklenti veya Keşfet toplayıcı ile video toplayın</span>
            </div>
        `;
        clearLinksBtn.style.display = 'none';
        downloadCollectedBtn.style.display = 'none';
        if (selectedCountBadge) selectedCountBadge.textContent = '0 video seçildi';
        return;
    }

    clearLinksBtn.style.display = 'inline-flex';
    collectedList.innerHTML = '';

    links.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'collected-card';

        const isIg = item.url.includes('instagram.com');
        const isTt = item.url.includes('tiktok.com');
        const isYt = item.url.includes('youtube.com') || item.url.includes('youtu.be');

        let pClass = 'platform-ig';
        let pText = 'IG';
        if (isTt) { pClass = 'platform-tt'; pText = 'TIKTOK'; }
        else if (isYt) { pClass = 'platform-yt'; pText = 'YOUTUBE'; }

        const date = new Date(item.savedAt).toLocaleString('tr-TR');

        div.innerHTML = `
            <div class="collected-left">
                <input type="checkbox" class="collected-checkbox" value="${item.url}" checked>
                <span class="platform-tag ${pClass}">${pText}</span>
                <div class="collected-details">
                    <a href="${item.url}" target="_blank" class="collected-url" title="${item.url}">
                        ${item.url}
                    </a>
                    <div class="collected-meta">
                        <span>#${index + 1}</span>
                        <span>•</span>
                        <span>🕒 ${date}</span>
                    </div>
                </div>
            </div>
            <div class="collected-actions">
                <button class="btn btn-sm btn-secondary copy-btn" title="Linki Kopyala" style="padding: 5px 10px; font-size: 12px;">
                    📋
                </button>
                <a href="${item.url}" target="_blank" class="btn btn-sm btn-secondary" title="Tarayıcıda Aç" style="padding: 5px 10px; font-size: 12px; text-decoration: none;">
                    🔗
                </a>
                <button class="btn btn-sm btn-primary single-dl-btn" title="Hemen İndir" style="padding: 5px 12px; font-size: 12px;">
                    📥 İndir
                </button>
            </div>
        `;

        const cb = div.querySelector('.collected-checkbox');
        cb.addEventListener('change', updateSelectedCount);

        const copyBtn = div.querySelector('.copy-btn');
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(item.url);
            showToast('Link kopyalandı!', 'success');
        });

        const dlBtn = div.querySelector('.single-dl-btn');
        dlBtn.addEventListener('click', () => {
            linksInput.value = item.url;
            linksInput.dispatchEvent(new Event('input'));
            document.getElementById('tabManual').click();
            processBtn.click();
        });

        collectedList.appendChild(div);
    });

    updateSelectedCount();
}

function setFilterActive(activeBtn) {
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
}

if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
        setFilterActive(selectAllBtn);
        document.querySelectorAll('.collected-checkbox').forEach(cb => { cb.checked = true; });
        updateSelectedCount();
    });
}

if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
        setFilterActive(deselectAllBtn);
        document.querySelectorAll('.collected-checkbox').forEach(cb => { cb.checked = false; });
        updateSelectedCount();
    });
}

if (selectIgBtn) {
    selectIgBtn.addEventListener('click', () => {
        setFilterActive(selectIgBtn);
        document.querySelectorAll('.collected-checkbox').forEach(cb => {
            cb.checked = cb.value.includes('instagram.com');
        });
        updateSelectedCount();
    });
}

if (selectTtBtn) {
    selectTtBtn.addEventListener('click', () => {
        setFilterActive(selectTtBtn);
        document.querySelectorAll('.collected-checkbox').forEach(cb => {
            cb.checked = cb.value.includes('tiktok.com');
        });
        updateSelectedCount();
    });
}

if (selectYtBtn) {
    selectYtBtn.addEventListener('click', () => {
        setFilterActive(selectYtBtn);
        document.querySelectorAll('.collected-checkbox').forEach(cb => {
            cb.checked = cb.value.includes('youtube.com') || cb.value.includes('youtu.be');
        });
        updateSelectedCount();
    });
}

refreshLinksBtn.addEventListener('click', fetchCollectedLinks);

clearLinksBtn.addEventListener('click', async () => {
    if (!confirm('Toplanan tüm linkleri silmek istediğinize emin misiniz?')) return;

    try {
        await fetch('/api/saved-links', { method: 'DELETE' });
        fetchCollectedLinks();
        showToast('Linkler temizlendi', 'success');
    } catch (err) {
        showToast('Temizleme hatası', 'error');
    }
});

downloadCollectedBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.collected-checkbox:checked');
    if (checkboxes.length === 0) return showToast('Lütfen indirilecek linkleri seçin', 'error');

    const urls = Array.from(checkboxes).map(cb => cb.value).join('\n');

    // Switch to manual tab and paste links
    linksInput.value = urls;
    linksInput.dispatchEvent(new Event('input'));
    tabs[0].click();

    // Start processing automatically
    setTimeout(() => processBtn.click(), 500);
});

// ============================================
// DOWNLOADED FILES TAB
// ============================================
async function fetchDownloadedFiles() {
    try {
        const res = await fetch('/api/files');
        const data = await res.json();
        const files = data.files || [];

        if (files.length === 0) {
            downloadedList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--text-muted);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <p>Henüz indirilmiş video yok</p>
                </div>
            `;
            return;
        }

        downloadedList.className = 'downloaded-grid';
        downloadedList.innerHTML = '';
        files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'downloaded-card';

            const mb = (file.size / (1024 * 1024)).toFixed(1);
            const date = new Date(file.date).toLocaleDateString('tr-TR');
            const isYt = file.platform === 'youtube' || file.name.includes('youtube');
            const isTt = file.platform === 'tiktok' || file.name.includes('tiktok');
            const isIg = !isYt && !isTt;

            const pClass = isYt ? 'platform-yt' : (isTt ? 'platform-tt' : 'platform-ig');
            const pLabel = isYt ? 'YouTube' : (isTt ? 'TikTok' : 'Instagram');
            const thumbUrl = file.thumbnail || `/api/thumbnail/${file.platform || 'instagram'}/${file.name}`;

            div.innerHTML = `
                <div class="downloaded-thumb-wrapper" title="Oynatmak için tıkla">
                    <img class="downloaded-thumb-img" src="${thumbUrl}" alt="Kapak Resmi" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'168\\' viewBox=\\'0 0 300 168\\'><rect width=\\'300\\' height=\\'168\\' fill=\\'%23111422\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23555\\' font-size=\\'14\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'>Kapak Yükleniyor...</text></svg>'">
                    <div class="downloaded-thumb-badge">
                        <span class="platform-tag ${pClass}">${pLabel}</span>
                    </div>
                    <div class="downloaded-thumb-size">${mb} MB</div>
                    <div class="downloaded-thumb-play">
                        <div class="downloaded-thumb-play-btn">▶</div>
                    </div>
                </div>
                <div class="downloaded-body">
                    <div class="downloaded-title" title="${file.name}">${file.name}</div>
                    <div class="downloaded-meta">
                        <span>👤 ${file.uploader || 'Genel'}</span>
                        <span>🕒 ${date}</span>
                    </div>
                    <div class="downloaded-actions">
                        <button class="btn btn-primary btn-sm play-btn" style="flex: 1; padding: 6px 10px; font-size: 12px;">
                            ▶ Oynat
                        </button>
                        <a href="${file.path}" download="${file.name}" class="btn btn-secondary btn-sm" style="flex: 1; text-align: center; text-decoration: none; padding: 6px 10px; font-size: 12px;">
                            📥 Kaydet
                        </a>
                    </div>
                </div>
            `;

            const playTarget = () => openVideoModal(file.path, file.name);
            div.querySelector('.downloaded-thumb-wrapper').addEventListener('click', playTarget);
            div.querySelector('.play-btn').addEventListener('click', playTarget);

            downloadedList.appendChild(div);
        });
    } catch (err) {
        showToast('Dosyalar alınamadı', 'error');
    }
}

function openVideoModal(videoSrc, title) {
    let modal = document.getElementById('videoPreviewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'videoPreviewModal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px);
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;
        modal.innerHTML = `
            <div style="background: #111422; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; max-width: 900px; width: 100%; box-shadow: 0 25px 60px rgba(0,0,0,0.8); overflow: hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                    <h3 id="videoModalTitle" style="font-size: 14px; color: #fff; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:85%;"></h3>
                    <button id="closeVideoModalBtn" style="background:none; border:none; color:rgba(255,255,255,0.7); font-size:24px; cursor:pointer; line-height:1;">&times;</button>
                </div>
                <div style="position:relative; background:#000; aspect-ratio: 16/9; max-height: 72vh; display:flex; align-items:center; justify-content:center;">
                    <video id="modalVideoPlayer" controls autoplay style="width:100%; height:100%; object-fit: contain;"></video>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#closeVideoModalBtn').addEventListener('click', () => {
            const v = modal.querySelector('#modalVideoPlayer');
            v.pause();
            v.src = '';
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                const v = modal.querySelector('#modalVideoPlayer');
                v.pause();
                v.src = '';
                modal.style.display = 'none';
            }
        });
    }
    modal.querySelector('#videoModalTitle').textContent = title || 'Video';
    const player = modal.querySelector('#modalVideoPlayer');
    player.src = videoSrc;
    modal.style.display = 'flex';
    player.play().catch(() => { });
}

const openFolderBtn = document.getElementById('openFolderBtn');
if (openFolderBtn) {
    openFolderBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/open-folder');
            showToast('Klasör açıldı', 'info');
        } catch (e) { }
    });
}

// QR Modal Logic
const showQrBtn = document.getElementById('showQrBtn');
const qrModal = document.getElementById('qrModal');
const closeQrBtn = document.getElementById('closeQrBtn');
const qrImage = document.getElementById('qrImage');
const ipText = document.getElementById('ipText');

if (showQrBtn) {
    showQrBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/local-ip');
            const data = await res.json();

            ipText.textContent = data.url;
            qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.url)}`;

            qrModal.style.display = 'flex';
        } catch (err) {
            showToast('IP adresi alınamadı.', 'error');
        }
    });
}

if (closeQrBtn) {
    closeQrBtn.addEventListener('click', () => {
        qrModal.style.display = 'none';
    });
}

if (qrModal) {
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) qrModal.style.display = 'none';
    });
}

// ============================================
// COOKIE MODAL LOGIC
// ============================================
const showCookieBtn = document.getElementById('showCookieBtn');
const cookieModal = document.getElementById('cookieModal');
const closeCookieBtn = document.getElementById('closeCookieBtn');
const cookieStatusBadge = document.getElementById('cookieStatusBadge');
const cookieStatusText = document.getElementById('cookieStatusText');
const cookieFileInput = document.getElementById('cookieFileInput');
const cookieTextInput = document.getElementById('cookieTextInput');
const saveCookieBtn = document.getElementById('saveCookieBtn');
const deleteCookieBtn = document.getElementById('deleteCookieBtn');

async function checkCookieStatus() {
    try {
        const res = await fetch('/api/cookies');
        const data = await res.json();
        if (data.exists) {
            if (cookieStatusBadge) {
                cookieStatusBadge.textContent = 'Aktif';
                cookieStatusBadge.style.color = '#10b981';
            }
            if (cookieStatusText) {
                const kb = (data.size / 1024).toFixed(1);
                cookieStatusText.textContent = `cookies.txt aktif (${kb} KB)`;
                cookieStatusText.style.color = '#10b981';
            }
            if (deleteCookieBtn) deleteCookieBtn.style.display = 'inline-block';
        } else {
            if (cookieStatusBadge) {
                cookieStatusBadge.textContent = 'Yok';
                cookieStatusBadge.style.color = '#ef4444';
            }
            if (cookieStatusText) {
                cookieStatusText.textContent = 'cookies.txt bulunamadı';
                cookieStatusText.style.color = '#ef4444';
            }
            if (deleteCookieBtn) deleteCookieBtn.style.display = 'none';
        }
    } catch (err) {
        console.error('Cookie status check error:', err);
    }
}

if (showCookieBtn) {
    showCookieBtn.addEventListener('click', () => {
        checkCookieStatus();
        if (cookieModal) cookieModal.style.display = 'flex';
    });
}

if (closeCookieBtn) {
    closeCookieBtn.addEventListener('click', () => {
        if (cookieModal) cookieModal.style.display = 'none';
    });
}

if (cookieModal) {
    cookieModal.addEventListener('click', (e) => {
        if (e.target === cookieModal) cookieModal.style.display = 'none';
    });
}

// Dosya seçilirse içeriğini textarea'ya aktar
if (cookieFileInput) {
    cookieFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (cookieTextInput) cookieTextInput.value = event.target.result;
            };
            reader.readAsText(file);
        }
    });
}

// Cookie Kaydet
if (saveCookieBtn) {
    saveCookieBtn.addEventListener('click', async () => {
        const text = cookieTextInput ? cookieTextInput.value.trim() : '';
        if (!text) {
            showToast('Lütfen önce bir cookie metni yapıştırın veya dosya seçin.', 'error');
            return;
        }

        try {
            saveCookieBtn.disabled = true;
            saveCookieBtn.textContent = 'Kaydediliyor...';

            const res = await fetch('/api/cookies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookies: text })
            });

            const data = await res.json();
            if (data.success) {
                showToast('cookies.txt başarıyla kaydedildi! Videolar artık bu cookie ile indirilecek.', 'success');
                if (cookieTextInput) cookieTextInput.value = '';
                if (cookieFileInput) cookieFileInput.value = '';
                await checkCookieStatus();
                if (cookieModal) cookieModal.style.display = 'none';
            } else {
                showToast(data.error || 'Kaydedilemedi.', 'error');
            }
        } catch (err) {
            showToast('Bağlantı hatası: ' + err.message, 'error');
        } finally {
            saveCookieBtn.disabled = false;
            saveCookieBtn.textContent = '💾 Cookie\'yi Kaydet';
        }
    });
}

// Cookie Sil
if (deleteCookieBtn) {
    deleteCookieBtn.addEventListener('click', async () => {
        if (!confirm('cookies.txt dosyasını silmek istediğinize emin misiniz?')) return;

        try {
            const res = await fetch('/api/cookies', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast('cookies.txt silindi.', 'info');
                await checkCookieStatus();
            } else {
                showToast(data.error || 'Silinemedi.', 'error');
            }
        } catch (err) {
            showToast('Hata: ' + err.message, 'error');
        }
    });
}

// ============================================
// INIT
// ============================================
fetchCollectedLinks(); // Initial fetch for badge
checkCookieStatus(); // Check cookie status on load


// ============================================
// TWITTER VIDEO VIEWER
// ============================================
const twitterUsernameInput = document.getElementById('twitterUsernameInput');
const twitterSearchInput = document.getElementById('twitterSearchInput');
const twitterLoadBtn = document.getElementById('twitterLoadBtn');
const twitterRefreshBtn = document.getElementById('twitterRefreshBtn');
const twitterStatus = document.getElementById('twitterStatus');
const twitterStatusText = document.getElementById('twitterStatusText');
const twitterStatusCount = document.getElementById('twitterStatusCount');
const twitterVideoGrid = document.getElementById('twitterVideoGrid');
const twitterEmptyState = document.getElementById('twitterEmptyState');

// Twitter variables
let twitterVideos = [];
let filteredTwitterVideos = [];
let currentTwitterPage = 1;
const TWITTER_PAGE_SIZE = 24;

if (twitterLoadBtn) {
    twitterLoadBtn.addEventListener('click', loadTwitterVideos);
}

if (twitterRefreshBtn) {
    twitterRefreshBtn.addEventListener('click', () => {
        if (twitterUsernameInput.value.trim()) {
            loadTwitterVideos();
        }
    });
}

if (twitterSearchInput) {
    twitterSearchInput.addEventListener('input', (e) => {
        filterTwitterVideos(e.target.value);
    });
}

// Toggle Twitter help box
function toggleTwitterHelp() {
    const helpBox = document.getElementById('twitterHelpBox');
    if (helpBox) {
        helpBox.style.display = helpBox.style.display === 'none' ? 'block' : 'none';
    }
}

async function loadTwitterVideos() {
    const username = twitterUsernameInput.value.trim();
    if (!username) {
        showToast('Please enter a Twitter username', 'error');
        return;
    }

    const startTime = Date.now();

    twitterLoadBtn.disabled = true;
    twitterLoadBtn.innerHTML = '<span class="spinner"></span> Loading...';
    twitterEmptyState.style.display = 'none';
    twitterStatus.style.display = 'block';
    twitterStatusText.innerHTML = 'Fetching videos from @' + username.replace('@', '') + '<br><small style="color: #888; font-weight: normal;">May take 30-60s...</small>';
    twitterStatusCount.textContent = '...';

    const limitSelect = document.getElementById('twitterLimitSelect');
    const limit = limitSelect ? limitSelect.value : 'all';

    try {
        const res = await fetch('/api/twitter/fetch-videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, limit })
        });
        const data = await res.json();

        if (data.success && data.videos && data.videos.length > 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            
            twitterVideos = data.videos;
            filteredTwitterVideos = [...twitterVideos];
            currentTwitterPage = 1;

            twitterStatusText.innerHTML = `@${data.username} - Videos loaded in ${elapsed}s`;
            twitterStatusCount.textContent = `${data.count} videos found`;
            twitterSearchInput.disabled = false;

            renderTwitterVideos();
            showToast(`${data.count} videos loaded in ${elapsed}s`, 'success');
        } else {
            twitterStatus.style.display = 'none';
            twitterEmptyState.style.display = 'flex';
            twitterEmptyState.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:#dc2626;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <p style="color: #dc2626; font-weight: 600;">${data.error || 'Could not fetch videos'}</p>
                <span style="margin-top: 8px;">Twitter requires authentication. <a href="#" onclick="toggleTwitterHelp(); return false;" style="color: #1da1f2; text-decoration: underline;">Set up cookies</a> to enable this feature.</span>
            `;
            showToast(data.error || 'Authentication required', 'error');
        }
    } catch (err) {
        twitterStatus.style.display = 'none';
        twitterEmptyState.style.display = 'flex';
        showToast('Error: ' + err.message, 'error');
    } finally {
        twitterLoadBtn.disabled = false;
        twitterLoadBtn.textContent = 'Load Videos';
    }
}

// ===========================
// TWITTER VIDEO VIEWER
// ===========================
// Twitter Viewer variables already declared at top

if (twitterSearchInput) {
    twitterSearchInput.addEventListener('input', (e) => {
        filterTwitterVideos(e.target.value);
    });
}

// Türkçe karakterleri ve aksanları normalize eden arama yardımcısı
function normalizeSearchText(str) {
    if (!str) return '';
    return str.toString()
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/i̇/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .trim();
}

function filterTwitterVideos(searchTerm) {
    const rawTerm = searchTerm ? searchTerm.trim() : '';
    
    if (!rawTerm) {
        filteredTwitterVideos = [...twitterVideos];
    } else {
        const normTerm = normalizeSearchText(rawTerm);
        // Çoklu kelime desteği (örn: 'cem yilmaz' -> her iki kelimeyi de arasın)
        const keywords = normTerm.split(/\s+/).filter(Boolean);

        filteredTwitterVideos = twitterVideos.filter(video => {
            const searchPool = normalizeSearchText(
                `${video.title || ''} ${video.content || ''} ${video.description || ''} ${video.author || ''} ${video.username || ''}`
            );
            return keywords.every(kw => searchPool.includes(kw));
        });
    }

    currentTwitterPage = 1;
    twitterStatusCount.textContent = `${filteredTwitterVideos.length} / ${twitterVideos.length} videos`;
    renderTwitterVideos(true); // reset = true
}

let twitterScrollObserver = null;

function renderTwitterVideos(reset = true) {
    twitterEmptyState.style.display = 'none';

    if (!filteredTwitterVideos || filteredTwitterVideos.length === 0) {
        twitterVideoGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1rem;">
                <p style="color: var(--text-muted);">Arama kriterine uygun video bulunamadı.</p>
            </div>
        `;
        return;
    }

    // İlk render veya arama değiştiğinde grid'i temizle
    if (reset) {
        twitterVideoGrid.innerHTML = '';
        currentTwitterPage = 1;
    }

    // Eski scroll gözlemcisini kaldır
    if (twitterScrollObserver) {
        twitterScrollObserver.disconnect();
    }
    const oldSentinel = document.getElementById('twitterScrollSentinel');
    if (oldSentinel) oldSentinel.remove();

    // Sayfalanan videolar
    const startIdx = (currentTwitterPage - 1) * TWITTER_PAGE_SIZE;
    const endIdx = currentTwitterPage * TWITTER_PAGE_SIZE;
    const nextVideos = filteredTwitterVideos.slice(startIdx, endIdx);

    const cardsHtml = nextVideos.map((video, i) => {
        const idx = startIdx + i;
        const videoUrl = video.originalUrl || video.url;
        const proxyUrl = `/api/twitter/proxy?url=${encodeURIComponent(videoUrl)}`;
        const title = video.title || `Video #${idx + 1}`;
        const durationStr = video.duration ? `${Math.floor(video.duration / 60)}:${('0' + Math.floor(video.duration % 60)).slice(-2)}` : '';
        const viewsStr = video.view_count ? `${Number(video.view_count).toLocaleString()} izlenme` : '';
        const likesStr = video.like_count ? `❤️ ${Number(video.like_count).toLocaleString()}` : '';
        const isFav = isVideoFavorited(videoUrl);

        return `
        <div class="twitter-video-card" data-index="${idx}" data-url="${videoUrl}">
            <div class="twitter-video-thumb-container">
                <img 
                    class="twitter-video-thumb-img" 
                    src="${video.thumbnail || ''}" 
                    loading="lazy" 
                    alt="${title.replace(/"/g, '&quot;')}"
                    onerror="this.style.display='none'; const ph=this.parentElement.querySelector('.twitter-thumb-placeholder'); if(ph) ph.style.display='flex';"
                />

                <video 
                    class="twitter-preview-video"
                    preload="none" 
                    playsinline
                    data-src="${videoUrl}"
                    data-proxy="${proxyUrl}"
                    style="display: none;"
                ></video>
                
                <div class="twitter-thumb-placeholder">
                    <div class="twitter-play-circle">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </div>
                </div>

                <div class="twitter-video-loading-spinner" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 4;">
                    <span class="spinner" style="width: 34px; height: 34px; border-width: 3px;"></span>
                </div>

                <button class="twitter-fav-overlay-btn ${isFav ? 'active' : ''}" data-fav-btn data-url="${videoUrl}" title="${isFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}">
                    <svg viewBox="0 0 24 24" fill="${isFav ? '#ef4444' : 'rgba(0,0,0,0.5)'}" stroke="${isFav ? '#ef4444' : '#fff'}" stroke-width="2" width="18" height="18">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </button>

                ${durationStr ? `<div class="twitter-badge twitter-duration-badge">${durationStr}</div>` : ''}
                ${viewsStr ? `<div class="twitter-badge twitter-views-badge">${viewsStr}</div>` : ''}
            </div>

            <div class="twitter-card-body">
                <div class="twitter-video-title" title="${title.replace(/"/g, '&quot;')}">
                    ${title}
                </div>
                <div class="twitter-video-meta">
                    <span>${video.author ? '@' + video.author : '@Twitter'}</span>
                    <span>${likesStr}</span>
                </div>
                <div class="twitter-card-actions">
                    <button class="btn btn-sm btn-primary twitter-download-btn" data-url="${videoUrl}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        İndir
                    </button>
                    <button class="btn btn-sm btn-secondary twitter-open-player-btn" data-url="${videoUrl}" data-proxy="${proxyUrl}" data-title="${encodeURIComponent(title)}">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        İzle
                    </button>
                    <button class="btn btn-sm btn-secondary twitter-fav-toggle-btn ${isFav ? 'active' : ''}" data-url="${videoUrl}" title="${isFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}">
                        <svg viewBox="0 0 24 24" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2" width="14" height="14">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-secondary twitter-copy-btn" data-url="${videoUrl}" title="Linki Kopyala">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    twitterVideoGrid.insertAdjacentHTML('beforeend', cardsHtml);

    // Eğer gösterilecek daha video varsa, en alta görünmez tetikleyici (sentinel) koy
    if (endIdx < filteredTwitterVideos.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'twitterScrollSentinel';
        sentinel.style.cssText = 'grid-column: 1 / -1; height: 60px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px;';
        sentinel.innerHTML = '<span class="spinner" style="margin-right: 8px;"></span> Daha fazla video yükleniyor...';
        twitterVideoGrid.appendChild(sentinel);

        twitterScrollObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                currentTwitterPage++;
                renderTwitterVideos(false); // reset = false: altına ekle
            }
        }, { rootMargin: '300px' });

        twitterScrollObserver.observe(sentinel);
    }

    // Yeni eklenen kartların etkileşimlerini bağla
    setupTwitterVideoInteractions();
}

// Sayfadaki diğer tüm videoları durdurup kapaklarını geri getiren yardımcı fonksiyon
function stopOtherTwitterVideos(currentVideo) {
    document.querySelectorAll('.twitter-video-card').forEach(card => {
        const v = card.querySelector('.twitter-preview-video');
        const img = card.querySelector('.twitter-video-thumb-img');
        const ph = card.querySelector('.twitter-thumb-placeholder');
        const sp = card.querySelector('.twitter-video-loading-spinner');
        if (sp) sp.style.display = 'none';
        if (v && v !== currentVideo && !v.paused) {
            v.pause();
            v.controls = false;
            v.style.display = 'none';
            if (img) img.style.display = 'block';
            if (ph) ph.style.display = 'flex';
        }
    });
}

function setupTwitterVideoInteractions() {
    // Sadece henüz etkileşimi bağlanmamış kartları işle (Duplicate event listener engeli)
    document.querySelectorAll('.twitter-video-card:not([data-events-bound="true"])').forEach(card => {
        card.dataset.eventsBound = 'true';

        const thumbContainer = card.querySelector('.twitter-video-thumb-container');
        const img = card.querySelector('.twitter-video-thumb-img');
        const video = card.querySelector('.twitter-preview-video');
        const placeholder = card.querySelector('.twitter-thumb-placeholder');
        const spinner = card.querySelector('.twitter-video-loading-spinner');

        if (!thumbContainer || !video) return;

        let hoverZoomTimer = null;

        // Mouse üzerinde durunca hafif büyüme efekti
        card.addEventListener('mouseenter', () => {
            clearTimeout(hoverZoomTimer);
            hoverZoomTimer = setTimeout(() => {
                card.classList.add('is-hover-zoomed');
            }, 1200);
        });

        card.addEventListener('mouseleave', () => {
            clearTimeout(hoverZoomTimer);
            card.classList.remove('is-hover-zoomed');
        });

        // Kapağa veya oynat butonuna tıklandığında videoyu oynat / duraklat
        thumbContainer.addEventListener('click', (e) => {
            // Eğer favori butonuna tıklandıysa video başlatma
            if (e.target.closest('[data-fav-btn]')) return;

            // Eğer video kontrollerine tıklandıysa tarayıcı yerel kontrollerine bırak
            if (e.target === video && video.controls) return;

            e.stopPropagation();

            // Eğer video zaten yüklenmiş ve görünürse
            if (video.dataset.loaded === 'true') {
                if (video.paused) {
                    stopOtherTwitterVideos(video);
                    video.muted = false;
                    video.volume = 1.0;
                    video.play().catch(() => { });
                } else {
                    video.pause();
                }
                return;
            }

            // İlk defa oynatma başlatılıyor
            stopOtherTwitterVideos(video);
            if (spinner) spinner.style.display = 'flex';

            video.dataset.loaded = 'true';
            video.controls = true;
            video.muted = false; // Sesi kesinlikle açık başlat
            video.defaultMuted = false;
            video.volume = 1.0;
            video.src = video.dataset.src;

            // Hata durumunda proxy URL'e otomatik geç
            video.onerror = () => {
                if (video.dataset.proxy && video.src !== video.dataset.proxy) {
                    console.warn('Direct Twitter playback error, switching to proxy fallback:', video.dataset.proxy);
                    video.muted = false;
                    video.volume = 1.0;
                    video.src = video.dataset.proxy;
                    video.play().catch(() => { });
                } else {
                    if (spinner) spinner.style.display = 'none';
                    showToast('Video yüklenemedi. İndir butonuyla izleyebilirsiniz.', 'error');
                }
            };

            const onReadyToPlay = () => {
                if (spinner) spinner.style.display = 'none';
                video.style.display = 'block';
                video.muted = false;
                video.volume = 1.0;
                if (img) img.style.display = 'none';
                if (placeholder) placeholder.style.display = 'none';
                if (video.paused) {
                    video.play().catch(() => { });
                }
            };

            video.onplaying = onReadyToPlay;
            video.oncanplay = onReadyToPlay;

            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch((err) => {
                    // Yükleme sırasında henüz hazır değilse canplay/onplaying tetiklendiğinde ses açık devam edecek
                    video.muted = false;
                    video.volume = 1.0;
                });
            }
        });

        // İndir butonu
        const downloadBtn = card.querySelector('.twitter-download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = downloadBtn.dataset.url;
                downloadBtn.disabled = true;
                const originalHTML = downloadBtn.innerHTML;
                downloadBtn.innerHTML = '<span class="spinner"></span> İndiriliyor...';

                try {
                    const res = await fetch('/api/twitter/download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    });
                    const data = await res.json();

                    if (data.success) {
                        showToast('Video başarıyla indirildi!', 'success');
                        downloadBtn.innerHTML = '✓ İndirildi';
                        setTimeout(() => {
                            downloadBtn.innerHTML = originalHTML;
                            downloadBtn.disabled = false;
                        }, 2500);
                    } else {
                        showToast('İndirme hatası: ' + (data.error || 'Bilinmeyen hata'), 'error');
                        downloadBtn.innerHTML = originalHTML;
                        downloadBtn.disabled = false;
                    }
                } catch (err) {
                    showToast('Hata: ' + err.message, 'error');
                    downloadBtn.innerHTML = originalHTML;
                    downloadBtn.disabled = false;
                }
            });
        }

        // İzle (Modal player) butonu
        const openPlayerBtn = card.querySelector('.twitter-open-player-btn');
        if (openPlayerBtn) {
            openPlayerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = openPlayerBtn.dataset.url;
                const proxyUrl = openPlayerBtn.dataset.proxy;
                const title = decodeURIComponent(openPlayerBtn.dataset.title || 'Twitter Video');
                openTwitterModalPlayer(url, title, proxyUrl);
            });
        }

        // Favori butonları
        card.querySelectorAll('.twitter-fav-overlay-btn, .twitter-fav-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                const videoData = findVideoByUrl(url);

                if (!videoData) return;

                const isNowFav = toggleFavoriteVideo(videoData);

                // Sayfadaki aynı karta ait her iki butonu da senkronize et
                card.querySelectorAll('.twitter-fav-overlay-btn, .twitter-fav-toggle-btn').forEach(b => {
                    b.classList.toggle('active', isNowFav);
                    const svg = b.querySelector('svg');
                    if (svg) {
                        svg.setAttribute('fill', isNowFav ? '#ef4444' : (b.classList.contains('twitter-fav-overlay-btn') ? 'rgba(0,0,0,0.5)' : 'none'));
                        svg.setAttribute('stroke', isNowFav ? '#ef4444' : (b.classList.contains('twitter-fav-overlay-btn') ? '#fff' : 'currentColor'));
                    }
                });

                showToast(isNowFav ? 'Favorilere eklendi! ❤️' : 'Favorilerden çıkarıldı', isNowFav ? 'success' : 'info');
            });
        });

        // Kopyala butonu
        const copyBtn = card.querySelector('.twitter-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = copyBtn.dataset.url;
                navigator.clipboard.writeText(url).then(() => {
                    showToast('Video linki panoya kopyalandı!', 'success');
                }).catch(() => {
                    showToast('Kopyalanamadı', 'error');
                });
            });
        }
    });
}

// Twitter Fullscreen / Modal Video Player
function openTwitterModalPlayer(videoUrl, title, proxyUrl) {
    stopOtherTwitterVideos(null); // Diğer tüm çalan videoları durdur

    let modal = document.getElementById('twitterPlayerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'twitterPlayerModal';
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.92);
            z-index: 10000; display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(12px); padding: 1.5rem;
        `;
        modal.innerHTML = `
            <div style="background: #141418; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; width: 100%; max-width: 900px; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,0.85); position: relative;">
                <div style="padding: 12px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; background: #0f1015;">
                    <div id="twitterModalTitle" style="font-weight: 700; font-size: 14px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;"></div>
                    <button id="closeTwitterModal" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 18px; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; line-height: 1;">&times;</button>
                </div>
                <div style="aspect-ratio: 16/9; background: #000; position: relative; display: flex; align-items: center; justify-content: center;">
                    <div id="twitterModalSpinner" style="position: absolute; display: flex; align-items: center; justify-content: center; z-index: 2;">
                        <span class="spinner" style="width: 40px; height: 40px; border-width: 3px;"></span>
                    </div>
                    <video id="twitterModalVideo" style="width: 100%; height: 100%; max-height: 75vh;" controls playsinline autoplay></video>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => {
            const v = modal.querySelector('#twitterModalVideo');
            if (v) {
                v.pause();
                v.removeAttribute('src');
                v.load();
            }
            modal.style.display = 'none';
        };

        modal.querySelector('#closeTwitterModal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
        });
    }

    modal.querySelector('#twitterModalTitle').textContent = title;
    const modalVideo = modal.querySelector('#twitterModalVideo');
    const modalSpinner = modal.querySelector('#twitterModalSpinner');

    if (modalSpinner) modalSpinner.style.display = 'flex';
    modal.style.display = 'flex';

    modalVideo.onplaying = () => {
        if (modalSpinner) modalSpinner.style.display = 'none';
        modalVideo.muted = false;
        modalVideo.volume = 1.0;
    };
    modalVideo.oncanplay = () => {
        if (modalSpinner) modalSpinner.style.display = 'none';
        modalVideo.muted = false;
        modalVideo.volume = 1.0;
        if (modalVideo.paused) {
            modalVideo.play().catch(() => { });
        }
    };

    modalVideo.onerror = () => {
        if (proxyUrl && modalVideo.src !== proxyUrl) {
            console.warn('Direct modal playback failed, trying proxy:', proxyUrl);
            modalVideo.muted = false;
            modalVideo.volume = 1.0;
            modalVideo.src = proxyUrl;
            modalVideo.play().catch(() => { });
        } else {
            if (modalSpinner) modalSpinner.style.display = 'none';
            showToast('Video yüklenemedi. İndir butonunu kullanabilirsiniz.', 'error');
        }
    };

    modalVideo.muted = false; // Sesi kesinlikle açık başlat
    modalVideo.defaultMuted = false;
    modalVideo.volume = 1.0;
    modalVideo.src = videoUrl;

    const playPromise = modalVideo.play();
    if (playPromise !== undefined) {
        playPromise.catch(() => {
            modalVideo.muted = false;
            modalVideo.volume = 1.0;
        });
    }
}

// ============================================
// FAVORITES SYSTEM (Storage & Management)
// ============================================
const FAVORITES_STORAGE_KEY = 'video_pro_favorites_v1';

function getFavorites() {
    try {
        const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function saveFavorites(favorites) {
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
        updateFavoritesBadge();
    } catch (e) { }
}

function isVideoFavorited(url) {
    if (!url) return false;
    const favs = getFavorites();
    return favs.some(f => (f.originalUrl || f.url) === url);
}

function toggleFavoriteVideo(video) {
    const videoUrl = video.originalUrl || video.url;
    let favs = getFavorites();
    const existingIndex = favs.findIndex(f => (f.originalUrl || f.url) === videoUrl);

    if (existingIndex >= 0) {
        favs.splice(existingIndex, 1);
        saveFavorites(favs);
        return false;
    } else {
        favs.unshift({
            id: video.id || Date.now(),
            url: videoUrl,
            originalUrl: videoUrl,
            title: video.title || 'Twitter Video',
            description: video.description || '',
            thumbnail: video.thumbnail || '',
            duration: video.duration || 0,
            author: video.author || 'Twitter',
            view_count: video.view_count || 0,
            like_count: video.like_count || 0,
            savedAt: Date.now()
        });
        saveFavorites(favs);
        return true;
    }
}

function findVideoByUrl(url) {
    // Önce aktif twitter listesinden ara
    let found = twitterVideos.find(v => (v.originalUrl || v.url) === url);
    if (found) return found;

    // Favoriler listesinden ara
    found = getFavorites().find(v => (v.originalUrl || v.url) === url);
    return found || null;
}

function updateFavoritesBadge() {
    const badge = document.getElementById('favoritesBadge');
    if (!badge) return;
    const count = getFavorites().length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
}

// Favoriler Sayfasını Render Etme
function renderFavoritesTab() {
    const favorites = getFavorites();
    const grid = document.getElementById('favoritesVideoGrid');
    const emptyState = document.getElementById('favoritesEmptyState');
    const subtitle = document.getElementById('favoritesCountSubtitle');

    if (subtitle) {
        subtitle.textContent = `${favorites.length} video kaydedildi`;
    }

    if (!grid) return;

    if (!favorites || favorites.length === 0) {
        grid.innerHTML = `
            <div id="favoritesEmptyState" class="empty-state" style="grid-column: 1 / -1; padding: 4rem 1rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:52px;height:52px;color:#ef4444;opacity:0.8;margin-bottom:12px;">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                <p style="font-size: 15px; font-weight: 600; color: #fff;">Henüz favori video eklenmedi</p>
                <span style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">Twitter veya URL Downloader'daki videolarda kalp butonuna tıklayarak buraya kaydedebilirsin.</span>
            </div>
        `;
        return;
    }

    const searchTerm = (document.getElementById('favoritesSearchInput')?.value || '').toLowerCase().trim();
    const filtered = searchTerm
        ? favorites.filter(v => (v.title && v.title.toLowerCase().includes(searchTerm)) || (v.author && v.author.toLowerCase().includes(searchTerm)))
        : favorites;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1rem;">
                <p style="color: var(--text-muted);">Aramanızla eşleşen favori video bulunamadı.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map((video, idx) => {
        const videoUrl = video.originalUrl || video.url;
        const proxyUrl = `/api/twitter/proxy?url=${encodeURIComponent(videoUrl)}`;
        const title = video.title || `Favori Video #${idx + 1}`;
        const durationStr = video.duration ? `${Math.floor(video.duration / 60)}:${('0' + Math.floor(video.duration % 60)).slice(-2)}` : '';

        return `
        <div class="twitter-video-card" data-index="${idx}" data-url="${videoUrl}">
            <div class="twitter-video-thumb-container">
                <img 
                    class="twitter-video-thumb-img" 
                    src="${video.thumbnail || ''}" 
                    loading="lazy" 
                    alt="${title.replace(/"/g, '&quot;')}"
                    onerror="this.style.display='none'; const ph=this.parentElement.querySelector('.twitter-thumb-placeholder'); if(ph) ph.style.display='flex';"
                />

                <video 
                    class="twitter-preview-video"
                    preload="none" 
                    playsinline
                    data-src="${videoUrl}"
                    data-proxy="${proxyUrl}"
                    style="display: none;"
                ></video>
                
                <div class="twitter-thumb-placeholder">
                    <div class="twitter-play-circle">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </div>
                </div>

                <div class="twitter-video-loading-spinner" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 4;">
                    <span class="spinner" style="width: 34px; height: 34px; border-width: 3px;"></span>
                </div>

                <button class="twitter-fav-overlay-btn active" data-fav-btn data-url="${videoUrl}" title="Favorilerden Çıkar">
                    <svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" stroke-width="2" width="18" height="18">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </button>

                ${durationStr ? `<div class="twitter-badge twitter-duration-badge">${durationStr}</div>` : ''}
            </div>

            <div class="twitter-card-body">
                <div class="twitter-video-title" title="${title.replace(/"/g, '&quot;')}">
                    ${title}
                </div>
                <div class="twitter-video-meta">
                    <span>${video.author ? '@' + video.author : '@Twitter'}</span>
                    <span style="color: #ef4444; font-weight: 600;">Favori</span>
                </div>
                <div class="twitter-card-actions">
                    <button class="btn btn-sm btn-primary twitter-download-btn" data-url="${videoUrl}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        İndir
                    </button>
                    <button class="btn btn-sm btn-secondary twitter-open-player-btn" data-url="${videoUrl}" data-proxy="${proxyUrl}" data-title="${encodeURIComponent(title)}">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        İzle
                    </button>
                    <button class="btn btn-sm btn-secondary fav-remove-btn" data-url="${videoUrl}" title="Favorilerden Sil" style="color: #ef4444; border-color: rgba(239,68,68,0.3);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    // Favoriler tabındaki etkileşimleri bağla
    setupTwitterVideoInteractions();

    // Silme butonu
    grid.querySelectorAll('.fav-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = btn.dataset.url;
            let favs = getFavorites().filter(f => (f.originalUrl || f.url) !== url);
            saveFavorites(favs);
            showToast('Video favorilerden silindi', 'info');
            renderFavoritesTab();
        });
    });
}

// Favoriler arama kutusu
document.getElementById('favoritesSearchInput')?.addEventListener('input', () => {
    renderFavoritesTab();
});

// Tüm favorileri temizle
document.getElementById('clearAllFavoritesBtn')?.addEventListener('click', () => {
    if (getFavorites().length === 0) return;
    if (confirm('Tüm favori videolar silinsin mi?')) {
        saveFavorites([]);
        renderFavoritesTab();
        showToast('Tüm favoriler temizlendi', 'info');
    }
});

// Sayfa ilk açıldığında rozeti güncelle
updateFavoritesBadge();


// ============================================
// TWITTER INFINITE SCROLL
// ============================================
let isLoadingMore = false;

function setupTwitterInfiniteScroll() {
    if (!twitterVideoGrid) return;
    
    const scrollContainer = document.querySelector('#panelTwitter');
    if (!scrollContainer) return;
    
    scrollContainer.addEventListener('scroll', () => {
        if (isLoadingMore) return;
        if (filteredTwitterVideos.length === 0) return;
        
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
        
        // %80'e gelince daha fazla yükle
        if (scrollPercentage > 0.8) {
            loadMoreTwitterVideos();
        }
    });
}

function loadMoreTwitterVideos() {
    const totalVideos = filteredTwitterVideos.length;
    const currentlyShown = currentTwitterPage * TWITTER_PAGE_SIZE;
    
    if (currentlyShown >= totalVideos || isLoadingMore) return; // Hepsi yüklendi veya zaten yükleniyor
    
    isLoadingMore = true;
    currentTwitterPage++;
    
    console.log(`Loading page ${currentTwitterPage}, showing ${currentTwitterPage * TWITTER_PAGE_SIZE} / ${totalVideos}`);
    
    // Videoları yeniden render et (tüm sayfalar)
    renderTwitterVideos();
    
    setTimeout(() => { isLoadingMore = false; }, 300);
}

// Call setup when page loads
setupTwitterInfiniteScroll();


// ============================================
// TWITTER DIRECT LINK DOWNLOAD
// ============================================
const twitterDirectLinkInput = document.getElementById('twitterDirectLinkInput');
const twitterDirectDownloadBtn = document.getElementById('twitterDirectDownloadBtn');

if (twitterDirectDownloadBtn) {
    twitterDirectDownloadBtn.addEventListener('click', async () => {
        const url = twitterDirectLinkInput.value.trim();
        if (!url) {
            showToast('Please paste a Twitter video URL', 'error');
            return;
        }

        // URL validation
        if (!url.includes('twitter.com') && !url.includes('x.com')) {
            showToast('Invalid Twitter URL', 'error');
            return;
        }

        twitterDirectDownloadBtn.disabled = true;
        twitterDirectDownloadBtn.innerHTML = '<span class="spinner"></span> Downloading...';

        try {
            const res = await fetch('/api/twitter/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await res.json();

            if (data.success) {
                showToast('Video downloaded successfully!', 'success');
                twitterDirectLinkInput.value = '';
            } else {
                showToast(data.error || 'Download failed', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            twitterDirectDownloadBtn.disabled = false;
            twitterDirectDownloadBtn.textContent = 'Download';
        }
    });

    // Enter key support
    twitterDirectLinkInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            twitterDirectDownloadBtn.click();
        }
    });
}
