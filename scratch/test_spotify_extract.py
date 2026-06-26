import urllib.request
import re
import ssl
import json

def main():
    track_id = "6rqhFgbbKwnb9MLmUQDhG6"
    url = f"https://open.spotify.com/embed/track/{track_id}"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            html = response.read().decode('utf-8', errors='ignore')
            match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
            if match:
                data = json.loads(match.group(1))
                # Dump the props -> pageProps to inspect
                pageProps = data.get("props", {}).get("pageProps", {})
                print("pageProps keys:", list(pageProps.keys()))
                
                # Check different keys
                state = pageProps.get("state", {})
                if state:
                    data_obj = state.get("data", {})
                    print("data keys:", list(data_obj.keys()))
                    print(json.dumps(data_obj, indent=2)[:3000])
                else:
                    # Maybe it's directly in pageProps or props
                    # Let's print the entire pageProps
                    print(json.dumps(pageProps, indent=2)[:3000])
            else:
                print("__NEXT_DATA__ not found")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
