import sys
import json
import time
import argparse
from playwright.sync_api import sync_playwright

def parse_cookies_txt(cookie_path):
    cookies = []
    try:
        with open(cookie_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split('\t')
                if len(parts) >= 7:
                    domain = parts[0]
                    path = parts[2]
                    secure = parts[3].upper() == 'TRUE'
                    name = parts[5]
                    value = parts[6]
                    if 'tiktok.com' in domain:
                        cookies.append({
                            'name': name,
                            'value': value,
                            'domain': domain,
                            'path': path,
                            'secure': secure
                        })
    except Exception as e:
        sys.stderr.write(f"Cookie okuma hatasi: {e}\n")
    return cookies

def clean_tiktok_url(url):
    if not url:
        return None
    url = url.split('?')[0].split('#')[0]
    if '/video/' in url or '/photo/' in url:
        return url
    return None

def main():
    parser = argparse.ArgumentParser(description="TikTok Keşfet (FYP) Video Toplayıcı")
    parser.add_argument("--count", type=int, default=200, help="Toplanacak video sayısı (varsayılan: 200)")
    parser.add_argument("--cookie", type=str, default="cookies.txt", help="cookies.txt dosya yolu")
    parser.add_argument("--timeout", type=int, default=300, help="Maksimum çalışma süresi saniye (varsayılan: 300)")
    args = parser.parse_args()

    target_count = args.count
    max_duration = args.timeout
    start_time = time.time()

    collected_links = set()
    cookies = parse_cookies_txt(args.cookie)
    
    sys.stderr.write(f"[TikTok Harvester] Hedef: {target_count} video | Cookie: {len(cookies)} adet\n")

    def report_progress(latest_item=None):
        recent = list(collected_links)[-5:] if collected_links else []
        msg = json.dumps({
            "type": "progress",
            "found": min(len(collected_links), target_count),
            "target": target_count,
            "latest": latest_item or (recent[-1] if recent else None),
            "recent": recent
        })
        print(f"PROGRESS:{msg}", flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel='chrome',
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-infobars',
                '--disable-dev-shm-usage',
                '--mute-audio'
            ]
        )
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        )
        if cookies:
            try:
                context.add_cookies(cookies)
            except Exception as e:
                sys.stderr.write(f"Cookie yukleme uyarisi: {e}\n")

        page = context.new_page()

        # Ağ yanıtlarını yakala (TikTok item_list, recommend, feed, explore API)
        def handle_response(response):
            try:
                url = response.url
                if any(k in url for k in ['item_list', 'recommend', 'feed', 'explore']):
                    data = response.json()
                    items = data.get('itemList') or data.get('items') or []
                    prev_len = len(collected_links)
                    for it in items:
                        vid_id = it.get('id')
                        author = it.get('author', {}).get('uniqueId') or (it.get('author', {}).get('secUid')[:15] if it.get('author', {}).get('secUid') else 'user')
                        if vid_id:
                            full_url = f"https://www.tiktok.com/@{author}/video/{vid_id}"
                            collected_links.add(full_url)
                    if len(collected_links) > prev_len:
                        report_progress()
            except Exception:
                pass

        page.on('response', handle_response)

        def close_modals():
            try:
                page.evaluate("""() => {
                    const closeSelectors = [
                        '[data-e2e="modal-close-inner"]',
                        'button[aria-label="Close"]',
                        'div[role="dialog"] button',
                        '#login-modal-cross',
                        '[data-e2e="close-icon"]',
                        '.tiktok-cookie-banner button'
                    ];
                    for (const sel of closeSelectors) {
                        const el = document.querySelector(sel);
                        if (el) el.click();
                    }
                }""")
            except Exception:
                pass

        def scan_dom():
            try:
                dom_links = page.eval_on_selector_all('a[href*="/video/"], a[href*="/photo/"]', 'elements => elements.map(e => e.href)')
                prev_len = len(collected_links)
                for l in dom_links:
                    cleaned = clean_tiktok_url(l)
                    if cleaned:
                        collected_links.add(cleaned)
                if len(collected_links) > prev_len:
                    report_progress()
            except Exception:
                pass

        # 1. Başlangıç: Doğrudan sonsuz akış olan /foryou açılır
        sys.stderr.write("[TikTok Harvester] TikTok For You akışı açılıyor...\n")
        try:
            page.goto("https://www.tiktok.com/foryou", wait_until="domcontentloaded", timeout=25000)
            time.sleep(2)
            close_modals()
            scan_dom()
        except Exception as e:
            sys.stderr.write(f"[TikTok Harvester] For You açılış uyarısı: {e}\n")

        stuck_cycles = 0
        last_count = len(collected_links)
        pivot_count = 0

        while len(collected_links) < target_count and (time.time() - start_time) < max_duration:
            # Akışı ileri kaydırma komboları
            try:
                page.keyboard.press("ArrowDown")
                page.keyboard.press("PageDown")
                page.evaluate("""() => {
                    const btn = document.querySelector('[data-e2e="navigation-down"]') || document.querySelector('[data-e2e="arrow-right"]');
                    if (btn) btn.click();
                }""")
            except Exception:
                pass

            time.sleep(0.12)
            scan_dom()

            if len(collected_links) > last_count:
                stuck_cycles = 0
                last_count = len(collected_links)
            else:
                stuck_cycles += 1
                if stuck_cycles % 6 == 0:
                    close_modals()
                    page.mouse.wheel(0, 1200)

                # Eğer akış tıkandıysa (~20 döngü) explore veya yenileme ile yeni havuz çek
                if stuck_cycles >= 20 and len(collected_links) < target_count:
                    stuck_cycles = 0
                    pivot_count += 1
                    if pivot_count % 2 == 1:
                        # Explore'a geçip 30-40 video topla
                        sys.stderr.write(f"[TikTok Harvester] Keşfet ızgarasına geçilip ek videolar taranıyor (Mevcut: {len(collected_links)})...\n")
                        try:
                            page.goto("https://www.tiktok.com/explore", wait_until="domcontentloaded", timeout=20000)
                            time.sleep(1.5)
                            close_modals()
                            for _ in range(5):
                                page.mouse.wheel(0, 2500)
                                time.sleep(0.25)
                                scan_dom()
                            # Tekrar foryou akışına dön
                            page.goto("https://www.tiktok.com/foryou", wait_until="domcontentloaded", timeout=20000)
                            time.sleep(1.5)
                            close_modals()
                        except Exception as e:
                            sys.stderr.write(f"[TikTok Harvester] Explore pivot uyarısı: {e}\n")
                    else:
                        # ForYou sayfasını tazeleyip yeni feed al
                        sys.stderr.write(f"[TikTok Harvester] For You akışı yenileniyor (Mevcut: {len(collected_links)})...\n")
                        try:
                            page.reload(wait_until="domcontentloaded", timeout=20000)
                            time.sleep(1.5)
                            close_modals()
                        except Exception:
                            pass

                if stuck_cycles >= 50:
                    sys.stderr.write("[TikTok Harvester] Maksimum deneme sınırına ulaşıldı.\n")
                    break

        browser.close()

    final_list = list(collected_links)[:target_count]
    sys.stderr.write(f"[TikTok Harvester] Tamamlandı: {len(final_list)}/{target_count} video ({time.time()-start_time:.1f} sn)\n")
    result = {
        "status": "ok",
        "total": len(final_list),
        "target": target_count,
        "links": final_list
    }
    print(f"DONE:{json.dumps(result)}", flush=True)

if __name__ == '__main__':
    main()
