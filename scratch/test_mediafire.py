import requests
import re
import sys

def test():
    # Use a dummy/sample MediaFire file url if we have one, or just test the scraper structure.
    url = "https://www.mediafire.com/file/17h1sw21e9u1u4m/sample.txt/file"
    # Wait, let's see if we can query this page and regex the download link.
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        print("Fetching MediaFire page...")
        r = requests.get(url, headers=headers, timeout=10)
        print("Status:", r.status_code)
        
        # Regex search for the download button or link
        match = re.search(r'href="((?:https?:)?//download[^"]+)"', r.text)
        if match:
            print("Found download link:", match.group(1))
        else:
            # Let's inspect some of the page
            print("Not found. HTML preview:")
            print(r.text[:1000])
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
