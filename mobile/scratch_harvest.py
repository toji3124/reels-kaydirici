import sys
import json
import time
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
        print(f"Cookie okuma hatasi: {e}")
    return cookies

def harvest(target_count=10, headless=True):
    links = set()
    cookies = parse_cookies_txt('cookies.txt')
    print(f"Yuklenen TikTok cookie sayisi: {len(cookies)}")

    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=headless, args=['--disable-blink-features=AutomationControlled'])
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        )
        if cookies:
            context.add_cookies(cookies)
        
        page = context.new_page()

        def handle_response(response):
            try:
                # TikTok item_list veya recommend API cevapları
                if 'item_list' in response.url or 'recommend' in response.url or 'feed' in response.url:
                    text = response.text()
                    data = json.loads(text)
                    items = data.get('itemList') or data.get('items') or []
                    for it in items:
                        vid_id = it.get('id')
                        author = it.get('author', {}).get('uniqueId') or it.get('author', {}).get('secUid')
                        if vid_id:
                            if author:
                                links.add(f"https://www.tiktok.com/@{author}/video/{vid_id}")
                            else:
                                links.add(f"https://www.tiktok.com/video/{vid_id}")
            except Exception:
                pass

        page.on('response', handle_response)

        print("TikTok Keşfet açılıyor...")
        page.goto("https://www.tiktok.com/foryou", wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)

        # DOM'dan da link tara
        for scroll_i in range(15):
            # Sayfadaki linkleri tara
            dom_links = page.eval_on_selector_all('a[href*="/video/"]', 'elements => elements.map(e => e.href)')
            for l in dom_links:
                # Temizle (? query parametrelerini at)
                clean_url = l.split('?')[0]
                links.add(clean_url)
            
            print(f"Kaydirma {scroll_i + 1} - Toplam link: {len(links)}")
            if len(links) >= target_count:
                break
            
            page.keyboard.press("PageDown")
            page.wait_for_timeout(1000)

        browser.close()
    
    print(f"\nSonuc: {len(links)} adet video linki toplandi!")
    for l in list(links)[:10]:
        print(" -", l)
    return list(links)

if __name__ == '__main__':
    harvest(10, headless=True)
