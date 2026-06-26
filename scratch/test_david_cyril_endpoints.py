import urllib.request
import urllib.parse
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

q1 = urllib.parse.quote("Pink Floyd Speak To Me")
test_urls = [
    "https://apis.davidcyriltech.my.id/download/spotify?url=https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6",
    "https://apis.davidcyriltech.my.id/spotify?url=https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6",
    f"https://apis.davidcyriltech.my.id/spotify?query={q1}",
    f"https://apis.davidcyriltech.my.id/play?query={q1}",
    # Also let's test if there is a spotifydl or similar endpoint
    "https://apis.davidcyriltech.my.id/spotifydl?url=https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6"
]

headers = {
    "User-Agent": "Mozilla/5.0"
}

for url in test_urls:
    print(f"\nFetching: {url}")
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=8) as response:
            print("Status:", response.status)
            body = response.read().decode('utf-8', errors='ignore')
            print("Response:", body[:800])
    except Exception as e:
        print("Error:", e)
