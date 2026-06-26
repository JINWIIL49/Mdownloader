import urllib.request
import ssl
import json
import re

url = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGo37Z2U"
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
        
    print("HTML Length:", len(html))
    
    # Check for __NEXT_DATA__
    next_data_match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
    if next_data_match:
        print("Found __NEXT_DATA__")
    else:
        print("__NEXT_DATA__ not found")
        
    # Check for initial state or session scripts
    # Let's search for "initial-state" or "session" script tags
    initial_state_match = re.search(r'<script[^>]+id="initial-state"[^>]*>([\s\S]+?)</script>', html)
    if initial_state_match:
        print("Found initial-state")
    else:
        print("initial-state not found")
        
    # Let's search for any script containing json
    json_scripts = re.findall(r'<script[^>]*type="application/json"[^>]*>([\s\S]+?)</script>', html)
    print("Found", len(json_scripts), "json scripts")
    
except Exception as e:
    print("Error:", e)
