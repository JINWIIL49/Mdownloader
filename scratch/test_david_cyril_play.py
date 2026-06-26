import urllib.request
import urllib.parse
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

query = urllib.parse.quote("Speak To Me Pink Floyd")
url = f"https://apis.davidcyriltech.my.id/play?query={query}"

headers = {
    "User-Agent": "Mozilla/5.0"
}

print(f"Fetching: {url}")
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx, timeout=12) as response:
        print("Status:", response.status)
        body = response.read().decode('utf-8', errors='ignore')
        data = json.loads(body)
        print(json.dumps(data, indent=2))
except Exception as e:
    print("Error:", e)
