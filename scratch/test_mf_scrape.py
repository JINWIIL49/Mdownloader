import urllib.request
import re
import ssl

def main():
    url = "https://www.mediafire.com/file/zulayut7xnratjf/test.txt/file"
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
            
            # Find the download button link
            # Look for: href="https://download... or href="http://download...
            match = re.search(r'href="((?:https?:)?//download[^"]+)"', html)
            if match:
                direct_link = match.group(1)
                print("Direct Link:", direct_link)
                
                # Try a HEAD request to get headers
                if direct_link.startswith('//'):
                    direct_link = 'https:' + direct_link
                head_req = urllib.request.Request(direct_link, headers=headers, method='HEAD')
                with urllib.request.urlopen(head_req, context=ctx, timeout=10) as head_res:
                    print("HEAD status:", head_res.status)
                    print("Headers:", dict(head_res.info()))
            else:
                print("No match found. Let's see some part of the HTML containing 'download':")
                for line in html.splitlines():
                    if 'download' in line.lower() and ('href=' in line or 'button' in line):
                        print(line[:120])
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
