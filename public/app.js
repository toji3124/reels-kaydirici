// ============================================
// STATE
// ============================================
let isProcessing = false;
let currentTab = 'manual';

// ============================================
// DOM ELEMENTS
// ============================================
// Tabs
const tabs = document.querySelectorAll('.tab');
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
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === currentTab) return;

        // Update active classes
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`panel${target.charAt(0).toUpperCase() + target.slice(1)}`).classList.add('active');
        currentTab = target;

        // Load data if needed
        if (target === 'collected') fetchCollectedLinks();
        if (target === 'downloaded') fetchDownloadedFiles();
    });
});

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
        } catch(e) {}
    }
});

processBtn.addEventListener('click', async () => {
    if (isProcessing) return;

    const urls = linksInput.value.split('\n').map(l => l.trim()).filter(l => l.includes('instagram.com') || l.includes('tiktok.com'));
    if (urls.length === 0) return showToast('Lütfen geçerli Instagram veya TikTok linkleri girin', 'error');

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
    const platform = isIg ? 'IG' : 'TT';
    const pClass = isIg ? 'platform-ig' : 'platform-tt';
    
    card.innerHTML = `
        <div class="result-index">${index}</div>
        <div class="result-info">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                <span class="platform-tag ${pClass}">${platform}</span>
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

function renderCollectedLinks(links) {
    if (links.length === 0) {
        collectedList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--text-muted);"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                <p>Henüz toplanan link yok</p>
                <span>Chrome eklentisini yükleyip gezinmeye başlayın</span>
            </div>
        `;
        clearLinksBtn.style.display = 'none';
        downloadCollectedBtn.style.display = 'none';
        if (selectAllBtn) selectAllBtn.style.display = 'none';
        if (selectIgBtn) selectIgBtn.style.display = 'none';
        if (selectTtBtn) selectTtBtn.style.display = 'none';
        return;
    }
    
    clearLinksBtn.style.display = 'inline-flex';
    downloadCollectedBtn.style.display = 'inline-flex';
    if (selectAllBtn) selectAllBtn.style.display = 'inline-block';
    if (selectIgBtn) selectIgBtn.style.display = 'inline-block';
    if (selectTtBtn) selectTtBtn.style.display = 'inline-block';
    
    collectedList.innerHTML = '';
    
    links.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'collected-item';
        
        const isIg = item.url.includes('instagram.com');
        const pClass = isIg ? 'platform-ig' : 'platform-tt';
        const pText = isIg ? 'IG' : 'TT';
        
        const date = new Date(item.savedAt).toLocaleString('tr-TR');
        
        div.innerHTML = `
            <input type="checkbox" class="collected-checkbox" value="${item.url}" checked>
            <div class="collected-item-info">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span class="platform-tag ${pClass}">${pText}</span>
                    <span class="collected-item-url" title="${item.url}">${item.url}</span>
                </div>
                <div class="collected-item-time">Toplanma: ${date}</div>
            </div>
        `;
        collectedList.appendChild(div);
    });
}

if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.collected-checkbox').forEach(cb => {
            cb.checked = true;
        });
    });
}

if (selectIgBtn) {
    selectIgBtn.addEventListener('click', () => {
        document.querySelectorAll('.collected-checkbox').forEach(cb => {
            cb.checked = cb.value.includes('instagram.com');
        });
    });
}

if (selectTtBtn) {
    selectTtBtn.addEventListener('click', () => {
        document.querySelectorAll('.collected-checkbox').forEach(cb => {
            cb.checked = cb.value.includes('tiktok.com');
        });
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
        
        downloadedList.innerHTML = '';
        files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-item';
            
            const mb = (file.size / (1024 * 1024)).toFixed(2);
            const date = new Date(file.date).toLocaleString('tr-TR');
            const isIg = file.name.includes('reels') || file.name.includes('instagram');
            
            div.innerHTML = `
                <div class="file-icon" style="color: ${isIg ? 'var(--accent-purple)' : 'var(--accent-pink)'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-meta">${mb} MB • ${date}</div>
                </div>
                <div style="flex-shrink:0;">
                    <a href="${file.path}" download="${file.name}" class="btn btn-secondary btn-sm">
                        Kaydet
                    </a>
                </div>
            `;
            downloadedList.appendChild(div);
        });
    } catch (err) {
        showToast('Dosyalar alınamadı', 'error');
    }
}

const openFolderBtn = document.getElementById('openFolderBtn');
if (openFolderBtn) {
    openFolderBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/open-folder');
            showToast('Klasör açıldı', 'info');
        } catch(e) {}
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
// INIT
// ============================================
fetchCollectedLinks(); // Initial fetch for badge
