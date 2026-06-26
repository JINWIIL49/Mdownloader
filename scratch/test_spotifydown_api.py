import urllib.request
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

urls = [
    "https://api.spotifydown.com/metadata/playlist/37i9dQZF1DXcBWIGo37Z2U",
    "https://api.spotifydown.com/metadata/track/6rqhFgbbKwnb9MLmUQDhG6"
]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://spotifydown.com",
    "Referer": "https://spotifydown.com/"
}

for url in urls:
    print(f"\nFetching: {url}")
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            print("Status:", response.status)
            data = json.loads(response.read().decode('utf-8'))
            print("Response Keys:", list(data.keys()))
            if "success" in data:
                print("Success:", data["success"])
            if "title" in data:
                print("Title:", data["title"])
            if "tracks" in data:
                print("Tracks count:", len(data["tracks"]))
            else:
                # Print sample
                print(json.dumps(data, indent=2)[:500])
    except Exception as e:
        print("Error:", e)
