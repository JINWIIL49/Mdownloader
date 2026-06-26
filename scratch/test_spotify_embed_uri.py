import urllib.request
import ssl
import re
import json

url = "https://embed.spotify.com/?uri=spotify:playlist:37i9dQZF1DXcBWIGo37Z2U"
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
    print(f"Fetching: {url}")
    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
        print("Status:", response.status)
        html = response.read().decode('utf-8', errors='ignore')
        print("HTML length:", len(html))
        
        # Check for __NEXT_DATA__
        next_data_match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
        if next_data_match:
            print("Found __NEXT_DATA__!")
            data = json.loads(next_data_match.group(1))
            pageProps = data.get("props", {}).get("pageProps", {})
            print("pageProps status:", pageProps.get("status"))
            state = pageProps.get("state", {})
            data_obj = state.get("data", {})
            entity = data_obj.get("entity", {})
            if entity:
                print("Entity Type:", entity.get("type"))
                print("Entity Name/Title:", entity.get("name") or entity.get("title"))
                tracks = entity.get("tracks", {}).get("items", []) or entity.get("trackList", [])
                print("Tracks:", len(tracks))
            else:
                print("No entity found.")
        else:
            print("__NEXT_DATA__ not found")
except Exception as e:
    print("Error:", e)
