import urllib.request
import ssl

url = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGo37Z2U"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
        html = response.read().decode('utf-8', errors='ignore')
        with open("scratch/spotify_playlist.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("Wrote html to scratch/spotify_playlist.html, length:", len(html))
except Exception as e:
    print("Error:", e)
