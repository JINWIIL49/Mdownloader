import urllib.request
import json

port = 8001
track_url = "https://open.spotify.com/track/44PH8NLzVddk4qhAUvm4v3?si=76d50af905f94315"

data = json.dumps({"url": track_url}).encode('utf-8')
req = urllib.request.Request(
    f"http://127.0.0.1:{port}/spotify/info",
    data=data,
    headers={"Content-Type": "application/json"}
)

print(f"Testing local info request to port {port}...")
try:
    with urllib.request.urlopen(req, timeout=15) as res:
        print(f"Status: {res.status}")
        body = res.read().decode('utf-8')
        info = json.loads(body)
        print("Resolved Title:", info.get("title"))
        print("Resolved Artists:", info.get("username"))
        print("Media List:")
        for item in info.get("media", []):
            print(f"  - Quality: {item.get('quality')} | URL: {item.get('url')}")
except Exception as e:
    print(f"Failed: {e}")
    if hasattr(e, "read"):
        print(f"Error body: {e.read().decode('utf-8', errors='ignore')}")
