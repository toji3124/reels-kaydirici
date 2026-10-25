# Twitter Video Viewer Setup Guide

## Why Authentication is Needed

Twitter/X now requires login to access user media pages, even for public accounts. This is a platform restriction that started in late 2023.

## How to Set Up Cookies

### Step 1: Install Browser Extension

Install **"Get cookies.txt LOCALLY"** extension:
- **Chrome**: [Chrome Web Store](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/get-cookiestxt-locally/)

⚠️ **Important**: Use the "LOCALLY" version - it exports in Netscape format which yt-dlp requires.

### Step 2: Login to Twitter

1. Open your browser
2. Go to https://twitter.com (or https://x.com)
3. Login with your Twitter account
4. Make sure you stay logged in

### Step 3: Export Cookies

1. While on Twitter website (any page), click the extension icon in your browser toolbar
2. Click **"Export"** or **"Download"** 
3. The extension will download a `cookies.txt` file

### Step 4: Save Cookie File

1. Move the downloaded `cookies.txt` file to your project folder:
   ```
   c:\Users\babapro\Downloads\reelsindirici\cookies.txt
   ```

2. The file should be named exactly `cookies.txt` (not `cookies (1).txt` or anything else)

### Step 5: Restart Server

1. Close the current server window (if running)
2. Run `BASLAT.bat` again
3. The server will automatically detect and use `cookies.txt`

## Verify Setup

1. Go to the **Twitter Viewer** tab in the web interface
2. Enter a Twitter username (e.g., `@verge`, `@mkbhd`)
3. Click **"Load Videos"**
4. If configured correctly, you should see videos loading

## Troubleshooting

### "Could not fetch videos" error
- Make sure you're logged into Twitter in your browser
- Re-export cookies (they expire after a while)
- Check that `cookies.txt` is in the correct folder
- Restart the server after adding cookies

### No videos showing up
- The account might not have any video posts
- The account might be private (requires follow)
- Try a different public account to test

### Cookies expired
Twitter cookies expire periodically. If it stops working:
1. Login to Twitter again in your browser
2. Re-export cookies using the extension
3. Replace the old `cookies.txt` file
4. Restart the server

## Privacy & Security

- **Your cookies are stored locally** on your computer only
- The cookies file contains your Twitter session
- **Never share your `cookies.txt` file** with anyone
- The cookies are only used by yt-dlp to access Twitter on your behalf
- You can delete `cookies.txt` anytime to remove authentication

## Alternative Solutions

If cookies don't work:

### Option 1: Use gallery-dl (Better for Twitter)
```bash
pip install gallery-dl
```
Configure with Twitter account in config file.

### Option 2: Twitter API v2
Requires developer account and API keys. More reliable but has rate limits.

## Current Status

✅ Supported platforms without authentication:
- Instagram (with cookies for private accounts)
- TikTok
- YouTube

⚠️ Requires authentication:
- Twitter/X (cookies required for all accounts)

---

For more help, check:
- yt-dlp documentation: https://github.com/yt-dlp/yt-dlp
- Twitter extractor notes: https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/twitter.py
