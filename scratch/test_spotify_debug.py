import urllib.request
import ssl

def main():
    url = "https://open.spotify.com/embed/track/6rqhFgbbKwnb9MLmUQDhG6"
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
        with urllib.request.urlopen(req, context=ctx, timeout=10) as res:
            print("Status:", res.status)
            print("Headers:", dict(res.info()))
            body = res.read().decode('utf-8', errors='ignore')
            print("HTML Length:", len(body))
            print("Preview of HTML:", body[:1000])
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
