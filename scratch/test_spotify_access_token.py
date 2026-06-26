import urllib.request
import ssl
import json

url = "https://open.spotify.com/get_access_token?reason=transport&productType=web_player"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://open.spotify.com/"
}

req = urllib.request.Request(url, headers=headers)
try:
    print(f"Fetching: {url}")
    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
        print("Status:", response.status)
        data = json.loads(response.read().decode('utf-8'))
        print(json.dumps(data, indent=2))
except Exception as e:
    print("Error:", e)
