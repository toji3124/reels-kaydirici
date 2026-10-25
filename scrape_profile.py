import json
import re
import sys
import os
import subprocess
from playwright.sync_api import sync_playwright

def parse_cookies(cookie_path, domain_filter):
    cookies = []
    if not os.path.exists(cookie_path):
        return cookies
    try:
        with open(cookie_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                parts = line.split('\t')
                if len(parts) >= 7 and domain_filter in parts[0]:
                    cookies.append({
                        'name': parts[5],
                        'value': parts[6],
                        'domain': parts[0],
                        'path': parts[2],
                        'secure': parts[3].upper() == 'TRUE'
                    })
    except Exception as e:
        sys.stderr.write(f"Cookie error: {e}\n")
    return cookies

def scrape_youtube_profile(url, limit=50):
    try:
        # If url doesn't end with /videos or /shorts, try /shorts first or default
        args = [
            'yt-dlp',
            '--flat-playlist',
            '--dump-single-json',
            '--playlist-end', str(limit),
            url
        ]
        res = subprocess.run(args, capture_output=True, text=True, timeout=45)
        if res.returncode == 0 and res.stdout:
            data = json.loads(res.stdout)
            uploader = data.get('uploader') or data.get('channel') or ''
            entries = data.get('entries') or []
            results = []
            for it in entries:
                if not it: continue
                v_url = it.get('url') or f"https://www.youtube.com/watch?v={it.get('id')}"
                thumbs = it.get('thumbnails') or []
                thumb = thumbs[-1]['url'] if thumbs else None
                results.append({
                    'id': it.get('id'),
                    'url': v_url,
                    'title': it.get('title') or 'YouTube Video',
                    'thumbnail': thumb,
                    'author': uploader,
                    'platform': 'youtube',
                    'duration': it.get('duration') or 0,
                    'view_count': it.get('view_count') or 0
                })
            return results
    except Exception as e:
        sys.stderr.write(f"YouTube scrape error: {e}\n")
    return []

def scrape_playwright_profile(url, platform, limit=50):
    domain = 'instagram.com' if platform == 'instagram' else 'tiktok.com'
    cookies = parse_cookies('cookies.txt', domain)
    collected = {}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel='chrome',
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--mute-audio'
            ]
        )
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        )
        if cookies:
            try: context.add_cookies(cookies)
            except: pass
            
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2500)
        
        # Determine uploader name
        uploader = ''
        m = re.search(r'(?:instagram\.com|tiktok\.com)/@?([a-zA-Z0-9_.-]+)', url)
        if m:
            uploader = m.group(1).replace('/', '')

        max_scrolls = max(3, min(25, int(limit / 8) + 2))
        for scroll_i in range(max_scrolls):
            if platform == 'instagram':
                items = page.evaluate("""() => {
                    const results = [];
                    const links = document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]');
                    links.forEach(a => {
                        const img = a.querySelector('img');
                        results.push({
                            url: a.href,
                            thumbnail: img ? img.src : null,
                            title: img ? (img.alt || '') : ''
                        });
                    });
                    return results;
                }""")
            else: # tiktok
                items = page.evaluate("""() => {
                    const results = [];
                    const links = document.querySelectorAll('a[href*="/video/"]');
                    links.forEach(a => {
                        const img = a.querySelector('img');
                        results.push({
                            url: a.href,
                            thumbnail: img ? img.src : null,
                            title: a.getAttribute('aria-label') || (img ? img.alt : '') || ''
                        });
                    });
                    return results;
                }""")
                
            for it in items:
                raw_u = it['url'].split('?')[0].split('#')[0]
                if raw_u not in collected:
                    # Clean title
                    t = it.get('title') or ''
                    if len(t) > 120: t = t[:120] + '...'
                    collected[raw_u] = {
                        'id': raw_u.split('/')[-1] or str(len(collected) + 1),
                        'url': raw_u,
                        'title': t or f"{platform.capitalize()} Video",
                        'thumbnail': it.get('thumbnail'),
                        'author': uploader,
                        'platform': platform
                    }
            if len(collected) >= limit:
                break
            page.mouse.wheel(0, 1800)
            page.wait_for_timeout(1500)
            
        browser.close()
        return list(collected.values())[:limit]

def scrape_profile(input_val, limit=50):
    val = (input_val or '').strip()
    if not val:
        return {'success': False, 'error': 'Profil URL veya kullanıcı adı gerekli'}
        
    # Detect platform
    platform = None
    clean_url = val
    if 'youtube.com' in val or 'youtu.be' in val:
        platform = 'youtube'
        if not val.startswith('http'): clean_url = f"https://{val}"
    elif 'tiktok.com' in val:
        platform = 'tiktok'
        if not val.startswith('http'): clean_url = f"https://{val}"
    elif 'instagram.com' in val:
        platform = 'instagram'
        if not val.startswith('http'): clean_url = f"https://{val}"
    elif val.startswith('@'):
        # Default to instagram if @username
        clean_url = f"https://www.instagram.com/{val.lstrip('@')}/"
        platform = 'instagram'
    else:
        # Bare username: default to instagram
        clean_url = f"https://www.instagram.com/{val}/"
        platform = 'instagram'
        
    if platform == 'youtube':
        videos = scrape_youtube_profile(clean_url, limit)
    else:
        videos = scrape_playwright_profile(clean_url, platform, limit)
        
    return {
        'success': True,
        'platform': platform,
        'url': clean_url,
        'count': len(videos),
        'videos': videos
    }

if __name__ == '__main__':
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://www.instagram.com/yazisizhali0/'
    lim = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    out = scrape_profile(url, lim)
    print(json.dumps(out, indent=2))
