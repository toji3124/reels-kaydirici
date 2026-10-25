import sys
import json
import time
import argparse
import re
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
                    if 'instagram.com' in domain:
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

def clean_insta_url(url):
    if not url:
        return None
    m = re.search(r'/(?:reel|reels|p)/([A-Za-z0-9_-]{8,15})', url)
    if m:
        return f"https://www.instagram.com/reel/{m.group(1)}/"
    return None

def main():
    parser = argparse.ArgumentParser(description="Instagram Reels Otomatik Toplayıcı")
    parser.add_argument("--count", type=int, default=200, help="Toplanacak video sayısı (varsayılan: 200)")
    parser.add_argument("--cookie", type=str, default="cookies.txt", help="cookies.txt dosya yolu")
    parser.add_argument("--timeout", type=int, default=300, help="Maksimum çalışma süresi saniye (varsayılan: 300)")
    args = parser.parse_args()

    target_count = args.count
    max_duration = args.timeout
    start_time = time.time()

    collected_links = set()
    cookies = parse_cookies_txt(args.cookie)
    
    sys.stderr.write(f"[Instagram Harvester] Hedef: {target_count} Reels | Cookie: {len(cookies)} adet\n")

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

        # Ağ yanıtlarını yakala (Instagram GraphQL, clips, reels, explore)
        def handle_response(response):
            try:
                url = response.url
                if any(k in url for k in ['graphql', 'clips', 'feed', 'reels', 'explore']):
                    text = response.text()
                    codes = re.findall(r'"code":"([A-Za-z0-9_-]{10,13})"', text)
                    prev_len = len(collected_links)
                    for c in codes:
                        collected_links.add(f"https://www.instagram.com/reel/{c}/")
                    if len(collected_links) > prev_len:
                        report_progress()
            except Exception:
                pass

        page.on('response', handle_response)

        def dismiss_popups():
            try:
                page.evaluate("""() => {
                    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                    for (const b of buttons) {
                        const text = (b.innerText || '').toLowerCase();
                        if (text.includes('şimdi değil') || text.includes('not now') || text.includes('kabul et') || text.includes('accept')) {
                            b.click();
                        }
                    }
                }""")
            except Exception:
                pass

        def scan_dom():
            try:
                dom_links = page.eval_on_selector_all('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"]', 'elements => elements.map(e => e.href)')
                prev_len = len(collected_links)
                for l in dom_links:
                    cleaned = clean_insta_url(l)
                    if cleaned:
                        collected_links.add(cleaned)
                if len(collected_links) > prev_len:
                    report_progress()
            except Exception:
                pass

        # 1. Başlangıç: Doğrudan https://www.instagram.com/reels/ aç
        sys.stderr.write("[Instagram Harvester] Instagram Reels akışı açılıyor...\n")
        try:
            page.goto("https://www.instagram.com/reels/", wait_until="domcontentloaded", timeout=25000)
            time.sleep(2.5)
            dismiss_popups()
            scan_dom()
        except Exception as e:
            sys.stderr.write(f"[Instagram Harvester] Reels açılış uyarısı: {e}\n")

        stuck_cycles = 0
        last_count = len(collected_links)
        pivot_count = 0

        while len(collected_links) < target_count and (time.time() - start_time) < max_duration:
            # Sonraki Reels videosuna geç
            try:
                page.evaluate("""() => {
                    const nextBtn = document.querySelector('[aria-label*="Sonraki"], [aria-label*="next" i]');
                    if (nextBtn) {
                        nextBtn.click();
                    }
                }""")
                page.keyboard.press("ArrowDown")
                page.keyboard.press("PageDown")
            except Exception:
                pass

            time.sleep(0.18)
            scan_dom()

            # Mevcut URL'i de kontrol et
            try:
                cleaned_curr = clean_insta_url(page.url)
                if cleaned_curr:
                    prev_len = len(collected_links)
                    collected_links.add(cleaned_curr)
                    if len(collected_links) > prev_len:
                        report_progress()
            except Exception:
                pass

            if len(collected_links) > last_count:
                stuck_cycles = 0
                last_count = len(collected_links)
            else:
                stuck_cycles += 1
                if stuck_cycles % 6 == 0:
                    dismiss_popups()
                    page.mouse.wheel(0, 1000)

                # Eğer Reels akışı tıkandıysa (~20 döngü), Explore ızgarasına geçip ek Reels topla
                if stuck_cycles >= 20 and len(collected_links) < target_count:
                    stuck_cycles = 0
                    pivot_count += 1
                    if pivot_count % 2 == 1:
                        sys.stderr.write(f"[Instagram Harvester] Keşfet ızgarasına geçilip ek Reels taranıyor (Mevcut: {len(collected_links)})...\n")
                        try:
                            page.goto("https://www.instagram.com/explore/", wait_until="domcontentloaded", timeout=20000)
                            time.sleep(2)
                            dismiss_popups()
                            for _ in range(5):
                                page.mouse.wheel(0, 3000)
                                time.sleep(0.3)
                                scan_dom()
                            # Tekrar reels akışına dön
                            page.goto("https://www.instagram.com/reels/", wait_until="domcontentloaded", timeout=20000)
                            time.sleep(2)
                            dismiss_popups()
                        except Exception as e:
                            sys.stderr.write(f"[Instagram Harvester] Explore pivot uyarısı: {e}\n")
                    else:
                        sys.stderr.write(f"[Instagram Harvester] Reels sayfası yenileniyor (Mevcut: {len(collected_links)})...\n")
                        try:
                            page.reload(wait_until="domcontentloaded", timeout=20000)
                            time.sleep(2)
                            dismiss_popups()
                        except Exception:
                            pass

                if stuck_cycles >= 50:
                    sys.stderr.write("[Instagram Harvester] Maksimum deneme sınırına ulaşıldı.\n")
                    break

        browser.close()

    final_list = list(collected_links)[:target_count]
    sys.stderr.write(f"[Instagram Harvester] Tamamlandı: {len(final_list)}/{target_count} video ({time.time()-start_time:.1f} sn)\n")
    result = {
        "status": "ok",
        "total": len(final_list),
        "target": target_count,
        "links": final_list
    }
    print(f"DONE:{json.dumps(result)}", flush=True)

if __name__ == '__main__':
    main()
