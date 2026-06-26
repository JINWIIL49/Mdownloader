import urllib.request
import re
import ssl
import json

def main():
    track_id = "4PTG3Z6ehGkBF3zIqYQGS3"
    url = f"https://open.spotify.com/embed/track/{track_id}"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    req = urllib.request.Request(url, headers=headers)
    try:
        print("Fetching page...")
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            html = response.read().decode('utf-8', errors='ignore')
            print("Fetched successfully. HTML size:", len(html))
            
            # Find the __NEXT_DATA__ script tag
            match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
            if match:
                data = json.loads(match.group(1))
                print("Found __NEXT_DATA__!")
                props = data.get("props", {})
                page_props = props.get("pageProps", {})
                state = page_props.get("state", {})
                
                # Check for entity info or track details
                # Sometimes the structure is different, let's dump the keys
                print("Keys in props:", list(props.keys()))
                print("Keys in pageProps:", list(page_props.keys()))
                
                # Let's search inside the state or track data
                # For Spotify embed, track details are usually inside `pageProps.state.data.entity` or similar.
                # Let's print a part of the JSON to inspect it.
                print(json.dumps(page_props, indent=2)[:2000])
            else:
                print("No match for __NEXT_DATA__. Let's find any script tag.")
                # print some lines of html
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
