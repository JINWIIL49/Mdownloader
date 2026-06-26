import urllib.request
import ssl
import re

track_id = "4jV6jQzR2t5Vz5Y3z9w1g9"
embed_url = f"https://open.spotify.com/embed/track/{track_id}"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

req = urllib.request.Request(embed_url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
        print("Status:", response.status)
        html = response.read().decode('utf-8', errors='ignore')
        print("HTML length:", len(html))
        print("HTML Preview:")
        print(html[:1000])
        next_data = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
        if next_data:
            print("Found NEXT_DATA!")
            import json
            data = json.loads(next_data.group(1))
            print(json.dumps(data, indent=2))
        else:
            print("NEXT_DATA not found in HTML!")
except Exception as e:
    print("Failed:", e)
