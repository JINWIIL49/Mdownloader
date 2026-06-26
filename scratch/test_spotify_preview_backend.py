import urllib.request
import urllib.parse
import json

def test_download():
    # Spotify preview URL encoded
    preview_url = "https://p.scdn.co/mp3-preview/4caa4ecf0519b90ed0827569d237fe30f4824818"
    encoded_url = urllib.parse.quote(preview_url)
    
    url = f"http://127.0.0.1:8000/spotify/download?file={encoded_url}&filename=test.mp3"
    try:
        print("Requesting download from backend...")
        with urllib.request.urlopen(url, timeout=10) as response:
            print("Status:", response.status)
            print("Headers:", dict(response.info()))
            body = response.read()
            print("Download size:", len(body))
            if len(body) < 10000:
                print("Body content (first 500 chars):")
                print(body.decode("utf-8", errors="ignore")[:500])
    except Exception as e:
        print("Failed to call download:", e)

if __name__ == "__main__":
    test_download()
