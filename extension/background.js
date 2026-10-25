// background.js

let isServerConnected = false;

// Initialize storage
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['collectedLinks'], (result) => {
        if (!result.collectedLinks) {
            chrome.storage.local.set({ collectedLinks: [] });
        }
    });
    
    // Create an alarm that fires every 1 minute to check server and sync
    chrome.alarms.create('checkServerAlarm', { periodInMinutes: 0.1 });
});

// Update badge UI
function updateBadge(count) {
    if (count > 0) {
        chrome.action.setBadgeText({ text: count.toString() });
        chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
    } else {
        chrome.action.setBadgeText({ text: "" });
    }
}

// Sunucuya linkleri gönder
async function sendToServer(linksArray) {
    if (linksArray.length === 0) return;
    
    try {
        const response = await fetch('http://localhost:3000/api/save-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ links: linksArray })
        });
        
        if (response.ok) {
            isServerConnected = true;
            
            // Remove successfully sent links from storage
            chrome.storage.local.get(['collectedLinks'], (result) => {
                let currentLinks = result.collectedLinks || [];
                const sentUrls = new Set(linksArray.map(l => l.url));
                currentLinks = currentLinks.filter(url => !sentUrls.has(url));
                
                chrome.storage.local.set({ collectedLinks: currentLinks }, () => {
                    updateBadge(currentLinks.length);
                });
            });
        }
    } catch (err) {
        isServerConnected = false;
        console.log("Sunucuya ulaşılamadı. Linkler eklenti belleğinde tutuluyor.");
    }
}

// Alarms handler
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkServerAlarm') {
        checkServerConnection();
    }
});

async function checkServerConnection() {
    try {
        const response = await fetch('http://localhost:3000/api/files', { method: 'GET' });
        isServerConnected = response.ok;
        
        if (isServerConnected) {
            // Try to send pending links
            chrome.storage.local.get(['collectedLinks'], (result) => {
                const links = result.collectedLinks || [];
                if (links.length > 0) {
                    const linksArray = links.map(url => ({ url, title: "Otomatik Toplanan Link" }));
                    sendToServer(linksArray);
                }
            });
        }
    } catch (err) {
        isServerConnected = false;
    }
}

// URL Check Logic - Sadece yakalama açıksa çalışır
function checkUrl(url) {
    if (!url) return;
    
    // Önce ayarlardan yakalama açık mı kontrol et
    chrome.storage.local.get(['extensionSettings'], (result) => {
        const settings = result.extensionSettings || {};
        // captureEnabled undefined ise varsayılan olarak true kabul et
        const captureEnabled = settings.captureEnabled !== undefined ? settings.captureEnabled : true;
        
        if (!captureEnabled) {
            console.log('[Reels Toplayıcı] ⏸️ Yakalama kapalı, link atlanıyor:', url);
            return;
        }
        
        const cleanNoQuery = url.split('?')[0].replace(/\/+$/, '');
        // Instagram: /reel/ID veya /p/ID olmalı, genel akış /reels değil!
        if ((cleanNoQuery.includes('instagram.com/reel/') || cleanNoQuery.includes('instagram.com/p/')) && !cleanNoQuery.endsWith('/reels')) {
            isValid = true;
        }
        // TikTok
        if (url.includes('tiktok.com/') && url.includes('/video/')) {
            isValid = true;
        }
        
        console.log('[Reels Toplayıcı] URL kontrol:', url, '→', isValid ? 'GEÇERLİ' : 'geçersiz');
        
        if (isValid) {
            const cleanUrl = url.split('?')[0];
            
            chrome.storage.local.get(['collectedLinks'], (result2) => {
                const links = result2.collectedLinks || [];
                if (!links.includes(cleanUrl)) {
                    links.push(cleanUrl);
                    chrome.storage.local.set({ collectedLinks: links }, () => {
                        console.log('[Reels Toplayıcı] ✅ Link kaydedildi:', cleanUrl, '(Toplam:', links.length, ')');
                        updateBadge(links.length);
                        // Try to send immediately if possible
                        if (isServerConnected) {
                            sendToServer([{ url: cleanUrl, title: "Otomatik Toplanan Link" }]);
                        } else {
                            checkServerConnection(); // Wake up server check
                        }
                    });
                } else {
                    console.log('[Reels Toplayıcı] ⏭️ Zaten var, atlanıyor:', cleanUrl);
                }
            });
        }
    });
}

// Navigation listeners
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    checkUrl(details.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        checkUrl(changeInfo.url);
    }
});

let activeScrolls = {};

// Message listener from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "newLinkFound" && request.url) {
        checkUrl(request.url);
        sendResponse({ success: true });
        return false;
    }
    
    if (request.action === "getStatus") {
        // Asynchronous response pattern
        chrome.storage.local.get(['collectedLinks'], (result) => {
            sendResponse({ 
                count: (result.collectedLinks || []).length,
                serverConnected: isServerConnected
            });
        });
        return true; 
    }
    
    if (request.action === "syncNow") {
        checkServerConnection();
        sendResponse({ success: true });
        return false;
    }
    
    if (request.action === "startBackgroundScroll") {
        const tabId = sender.tab.id;
        activeScrolls[tabId] = true;
        
        const loop = () => {
            if (!activeScrolls[tabId]) return;
            try {
                chrome.tabs.sendMessage(tabId, { action: "doScrollTick" }).catch(() => {});
                setTimeout(loop, request.speed || 1000);
            } catch(e) {
                activeScrolls[tabId] = false;
            }
        };
        setTimeout(loop, request.speed || 1000);
        sendResponse({ success: true });
        return false;
    }
    
    if (request.action === "stopBackgroundScroll") {
        if (sender.tab) {
            activeScrolls[sender.tab.id] = false;
        }
        sendResponse({ success: true });
        return false;
    }
    
    return false;
});
