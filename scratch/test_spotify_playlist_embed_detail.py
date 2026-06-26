import urllib.request
import ssl
import re
import json

url = "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGo37Z2U"
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
    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
        html = response.read().decode('utf-8', errors='ignore')
        
    next_data_match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
    if next_data_match:
        data = json.loads(next_data_match.group(1))
        # Print keys of the root data
        print("Root keys:", list(data.keys()))
        # Print props
        props = data.get("props", {})
        print("props keys:", list(props.keys()))
        pageProps = props.get("pageProps", {})
        print("pageProps keys:", list(pageProps.keys()))
        print("pageProps status:", pageProps.get("status"))
        # Print the entire pageProps to inspect
        print(json.dumps(pageProps, indent=2))
    else:
        print("No NEXT_DATA")
except Exception as e:
    print("Error:", e)
