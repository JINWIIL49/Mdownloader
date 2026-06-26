import urllib.request
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://api.spotifydown.com/getId/6rqhFgbbKwnb9MLmUQDhG6"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://spotifydown.com",
    "Referer": "https://spotifydown.com/",
    "Host": "api.spotifydown.com"
}

req = urllib.request.Request(url, headers=headers)
try:
    print(f"Fetching: {url}")
    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
        print("Status:", response.status)
        body = response.read().decode('utf-8')
        data = json.loads(body)
        print(json.dumps(data, indent=2))
except Exception as e:
    print("Error:", e)
