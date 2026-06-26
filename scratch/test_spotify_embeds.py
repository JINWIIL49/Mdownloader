import urllib.request
import ssl
import re
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
}

urls = {
    "playlist": "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGo37Z2U",
    "album": "https://open.spotify.com/embed/album/4aavy4KGs5hg7gkZJu7H6b",
    "artist": "https://open.spotify.com/embed/artist/0k17h0D3J5VfsdmQ1iZtE9",
    "show": "https://open.spotify.com/embed/show/5Cfhu52lMN4eQqjuCm346z",
    "episode": "https://open.spotify.com/embed/episode/4rOoJ625n2K1452oO5n52d"
}

for name, url in urls.items():
    print(f"--- Fetching {name}: {url} ---")
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            html = response.read().decode('utf-8', errors='ignore')
            print("Status:", response.status)
            print("HTML Length:", len(html))
            match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
            if match:
                data = json.loads(match.group(1))
                pageProps = data.get("props", {}).get("pageProps", {})
                status = pageProps.get("status")
                print("pageProps Status:", status)
                state = pageProps.get("state", {})
                data_obj = state.get("data", {})
                entity = data_obj.get("entity", {})
                if entity:
                    print("Entity Name/Title:", entity.get("name") or entity.get("title"))
                    print("Entity Type:", entity.get("type"))
                    # check track count if any
                    tracks = entity.get("tracks", {}).get("items", []) or entity.get("trackList", [])
                    print("Tracks found in entity:", len(tracks))
                else:
                    print("No entity found in state data.")
            else:
                print("__NEXT_DATA__ not found")
    except Exception as e:
        print("Error:", e)
