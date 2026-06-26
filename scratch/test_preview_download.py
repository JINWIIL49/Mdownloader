import urllib.request
import ssl

def main():
    # Public spotify preview URL
    url = "https://p.scdn.co/mp3-preview/4caa4ecf0519b90ed0827569d237fe30f4824818"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    req = urllib.request.Request(url, headers=headers)
    try:
        print("Testing direct fetch...")
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            print("Status:", resp.status)
            print("Headers:", dict(resp.info()))
            body = resp.read()
            print("Length of read body:", len(body))
    except Exception as e:
        print("Fetch failed:", e)

if __name__ == "__main__":
    main()
