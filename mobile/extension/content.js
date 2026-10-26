// Sayfa içi bildirim (Toast) oluşturma
function showPageToast(message) {
    let toast = document.getElementById('reels-downloader-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'reels-downloader-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: opacity 0.3s;
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2000);
}

let lastUrl = "";
let isCapturingEnabled = true;

let isScrolling = false;
let scrollCount = 0;
let maxScrollLimit = 0;
let isFastMode = false;
let urlCheckInterval = null;
let scrollInterval = null;

function startBackgroundTasks(speed) {
    // 1. Arka plan servis sağlayıcısına bildir (arka sekmede de devam edebilsin)
    try {
        chrome.runtime.sendMessage({ action: "startBackgroundScroll", speed: speed });
    } catch(e) {}
    
    // 2. Doğrudan sayfa içi döngü (servis çalışmasa bile kesin çalışır)
    if (scrollInterval) clearInterval(scrollInterval);
    scrollInterval = setInterval(() => {
        if (isScrolling) {
            scrollToNextVideo();
        }
    }, speed);
    
    // 3. URL yakalama kontrol döngüsü
    if (urlCheckInterval) clearInterval(urlCheckInterval);
    urlCheckInterval = setInterval(checkUrlLogic, 300);
}

function stopAutoScroll(reason = "Durduruldu") {
    try {
        chrome.runtime.sendMessage({ action: "stopBackgroundScroll" });
    } catch(e) {}
    if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
    }
    if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
        urlCheckInterval = null;
    }
    isScrolling = false;
    showPageToast(`🛑 Otomatik Kaydırma ${reason}`);
}

function checkUrlLogic() {
    if (!isCapturingEnabled) return;
    
    let currentUrl = window.location.href;
    
    // TIKTOK ÖZEL: Eğer ana sayfadaysak URL değişmez. DOM'dan bul!
    if (currentUrl.includes('tiktok.com') && !currentUrl.includes('/video/') && !currentUrl.includes('/photo/')) {
        const videoLinks = Array.from(document.querySelectorAll('a[href*="/video/"]'));
        for (const link of videoLinks) {
            const rect = link.getBoundingClientRect();
            const centerY = window.innerHeight / 2;
            if (rect.top <= (centerY + 300) && rect.bottom >= (centerY - 300)) {
                currentUrl = link.href;
                break;
            }
        }
    }
    
    // INSTAGRAM ÖZEL: Reels akışındayken (/reels/) URL değişmez! Ekrandaki aktif videonun /reel/ linkini bul:
    if (currentUrl.includes('instagram.com') && !currentUrl.includes('/reel/') && !currentUrl.includes('/p/')) {
        const reelLinks = Array.from(document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]'));
        for (const link of reelLinks) {
            const rect = link.getBoundingClientRect();
            const centerY = window.innerHeight / 2;
            if (rect.top <= (centerY + 350) && rect.bottom >= (centerY - 350)) {
                currentUrl = link.href;
                break;
            }
        }
    }
    
    // /reels/ genel akış linkini ASLA kaydetme (tekil /reel/ID veya /p/ID olmalı)
    const isRealIgReel = (currentUrl.includes('/reel/') || currentUrl.includes('/p/')) && !currentUrl.endsWith('/reels/') && !currentUrl.endsWith('/reels');
    const isRealTtVideo = currentUrl.includes('tiktok.com') && (currentUrl.includes('/video/') || currentUrl.includes('/photo/'));
    
    if (currentUrl !== lastUrl && (isRealIgReel || isRealTtVideo)) {
        lastUrl = currentUrl;
        try {
            chrome.runtime.sendMessage({ action: "newLinkFound", url: currentUrl }, (response) => {
                if (!chrome.runtime.lastError && response && response.success) {
                    showPageToast("✅ Video Linki Yakalandı!");
                }
            });
        } catch (err) {}
    }
}

// Güvenli tuş simülasyonu
function triggerKey(key, code, keyCode) {
    const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true };
    const targets = [document.activeElement, document.body, document, window].filter(Boolean);
    for (const t of targets) {
        try {
            t.dispatchEvent(new KeyboardEvent('keydown', opts));
            t.dispatchEvent(new KeyboardEvent('keyup', opts));
        } catch(e) {}
    }
}

// Mouse tekerleği simülasyonu
function triggerWheel() {
    const wheelEv = new WheelEvent('wheel', {
        deltaY: 800,
        bubbles: true,
        cancelable: true,
        view: window
    });
    const target = document.querySelector('video')?.parentElement || document.querySelector('main') || document.body || window;
    try {
        target.dispatchEvent(wheelEv);
    } catch(e) {}
}

function scrollToNextVideo() {
    try {
        if (maxScrollLimit > 0 && scrollCount >= maxScrollLimit) {
            stopAutoScroll("Hedefe Ulaşıldı ✅");
            return;
        }

        const isTikTok = window.location.href.includes('tiktok.com');

        // Odaklanmış input/textarea varsa odaktan çıkar
        try {
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                document.activeElement.blur();
            }
        } catch(e) {}

        let scrolled = false;

        if (isTikTok) {
            // 1. TikTok sonraki butonları
            const nextButton = document.querySelector('[data-e2e="arrow-right"]') || 
                               document.querySelector('[data-e2e="navigation-down"]') ||
                               document.querySelector('[data-e2e="arrow-down"]') ||
                               document.querySelector('button[aria-label*="Down"]') ||
                               document.querySelector('button[aria-label*="Aşağı"]');
            if (nextButton) {
                nextButton.click();
                scrolled = true;
            }

            // 2. Bir sonraki feed öğesini görünür yap
            if (!scrolled) {
                const feedItems = Array.from(document.querySelectorAll('[data-e2e="feed-item"], div[class*="DivItemContainer"]'));
                if (feedItems.length > 0) {
                    const current = feedItems.find(el => {
                        const r = el.getBoundingClientRect();
                        return r.top >= -100 && r.top <= window.innerHeight / 2;
                    });
                    const next = current ? current.nextElementSibling : feedItems[1];
                    if (next) {
                        next.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        scrolled = true;
                    }
                }
            }

            // 3. Tekerlek & Tuş
            triggerWheel();
            triggerKey('ArrowDown', 'ArrowDown', 40);
            window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        } else {
            // INSTAGRAM
            // 1. Instagram "Aşağı / Sonraki" butonunu bul ve TIKLA
            const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
            const igNextBtn = allBtns.find(b => {
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const svgAria = (b.querySelector('svg')?.getAttribute('aria-label') || '').toLowerCase();
                const text = (b.innerText || '').toLowerCase();
                const combined = `${aria} ${svgAria} ${text}`;
                return combined.includes('aşağı') || combined.includes('down') || combined.includes('sonraki') || combined.includes('next');
            });

            if (igNextBtn) {
                igNextBtn.click();
                scrolled = true;
            }

            // 2. Bir sonraki reel/post article elementini kaydır
            if (!scrolled) {
                const articles = Array.from(document.querySelectorAll('article, div[data-pressable-container="true"]'));
                if (articles.length > 1) {
                    const current = articles.find(el => {
                        const r = el.getBoundingClientRect();
                        return r.top >= -200 && r.top <= window.innerHeight / 2;
                    });
                    const next = current ? current.nextElementSibling : null;
                    if (next) {
                        next.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        scrolled = true;
                    }
                }
            }

            // 3. Tekerlek Simülasyonu (Instagram Reels mouse tekerleğine hemen tepki verir)
            triggerWheel();

            // 4. Klavye Tuşları (ArrowDown ve PageDown)
            triggerKey('ArrowDown', 'ArrowDown', 40);
            triggerKey('PageDown', 'PageDown', 34);

            // 5. Kaydırılabilir container'ları tara ve kaydır
            try {
                const scrollContainers = Array.from(document.querySelectorAll('div, main, section')).filter(el => {
                    const style = window.getComputedStyle(el);
                    return (style.overflowY === 'scroll' || style.overflowY === 'auto') && el.clientHeight > 400;
                });

                if (scrollContainers.length > 0) {
                    for (const sc of scrollContainers) {
                        sc.scrollBy({ top: sc.clientHeight || window.innerHeight, behavior: 'smooth' });
                    }
                } else {
                    window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
                }
            } catch(e) {
                window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
            }
        }
        
        scrollCount++;
        if (maxScrollLimit > 0) {
            if (!isFastMode || scrollCount % 5 === 0) {
                showPageToast(`🚀 ${scrollCount}/${maxScrollLimit}`);
            }
        } else if (!isFastMode || scrollCount % 5 === 0) {
            showPageToast(`🚀 ${scrollCount} video kaydırıldı`);
        }
    } catch (err) {
        console.log('Kaydırma hatası:', err);
    }
}

// Popup'tan gelen komutları dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleAutoScroll") {
        const settings = request.settings || { captureEnabled: true, fastMode: false, maxScrolls: 0 };
        isCapturingEnabled = settings.captureEnabled;
        maxScrollLimit = settings.maxScrolls;
        isFastMode = settings.fastMode;
        
        if (isScrolling) {
            stopAutoScroll();
        } else {
            scrollCount = 0;
            const speed = isFastMode ? 600 : 3500;
            
            isScrolling = true;
            scrollToNextVideo();
            startBackgroundTasks(speed);
            showPageToast("🚀 Otomatik Kaydırma Başladı");
        }
        sendResponse({ isScrolling: isScrolling });
        return false;
    }
    
    if (request.action === "getScrollStatus") {
        sendResponse({ isScrolling: isScrolling });
        return false;
    }
    
    if (request.action === "doScrollTick") {
        if (isScrolling) scrollToNextVideo();
        sendResponse({ success: true });
        return false;
    }
    
    return false;
});
