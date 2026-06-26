import urllib.request
import ssl
import json
import re

url = "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGo37Z2U"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
}

try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
        html = response.read().decode('utf-8', errors='ignore')
        
    next_data_match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
    if next_data_match:
        embed_data = json.loads(next_data_match.group(1))
        pageProps = embed_data.get("props", {}).get("pageProps", {})
        print("Status Code:", pageProps.get("status"))
        state = pageProps.get("state", {})
        data_obj = state.get("data", {})
        entity = data_obj.get("entity", {})
        if entity:
            print("Entity Name/Title:", entity.get("name") or entity.get("title"))
            print("Entity Type:", entity.get("type"))
            tracks = entity.get("tracks", {}).get("items", []) or entity.get("trackList", [])
            print("Track count:", len(tracks))
            if tracks:
                first_track = tracks[0]
                # Let's inspect the first track structure
                print("First track keys:", first_track.keys())
                # If first_track has a nested 'track' object (standard for playlists)
                t = first_track.get("track", first_track)
                print("First track details - Name:", t.get("name"), "Artists:", [a.get("name") for a in t.get("artists", [])])
        else:
            print("No entity found in state data.")
    else:
        print("NEXT_DATA script not found.")
except Exception as e:
    print("Error:", e)
