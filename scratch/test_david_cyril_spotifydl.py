import urllib.request
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

urls = {
    "track": "https://apis.davidcyriltech.my.id/spotifydl?url=https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6",
    "playlist": "https://apis.davidcyriltech.my.id/spotifydl?url=https://open.spotify.com/playlist/37i9dQZF1DXcBWIGo37Z2U",
    "album": "https://apis.davidcyriltech.my.id/spotifydl?url=https://open.spotify.com/album/4aavy4KGs5hg7gkZJu7H6b"
}

headers = {
    "User-Agent": "Mozilla/5.0"
}

for name, url in urls.items():
    print(f"\n--- Testing {name}: {url} ---")
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=12) as response:
            print("Status:", response.status)
            body = response.read().decode('utf-8', errors='ignore')
            data = json.loads(body)
            print(json.dumps(data, indent=2))
    except Exception as e:
        print("Error:", e)
