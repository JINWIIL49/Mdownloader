import urllib.request
import urllib.parse
import sys

def test_endpoint(name, url):
    print(f"Testing {name} endpoint: {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as res:
            status = res.status
            content_type = res.headers.get("Content-Type", "")
            content_length = res.headers.get("Content-Length", "unknown")
            disp = res.headers.get("Content-Disposition", "")
            print(f"[{name}] Status: {status}")
            print(f"[{name}] Content-Type: {content_type}")
            print(f"[{name}] Content-Length: {content_length}")
            print(f"[{name}] Content-Disposition: {disp}")
            
            # Read first 100 bytes
            data = res.read(100)
            print(f"[{name}] First 100 bytes: {data[:20]}...")
            
            if "text/html" in content_type.lower():
                print(f"[{name}] FAILURE: Returned HTML instead of media file.")
            elif status == 200:
                print(f"[{name}] SUCCESS!")
            else:
                print(f"[{name}] FAILURE: Status {status}")
    except Exception as e:
        print(f"[{name}] EXCEPTION: {e}")
    print("-" * 50)

if __name__ == "__main__":
    spotify_url = "http://127.0.0.1:8001/spotify/download?file=ytdlp:dQw4w9WgXcQ:bestaudio&filename=Rick_Astley_Never_Gonna_Give_You_Up.mp3"
    test_endpoint("Spotify Audio", spotify_url)
    
    youtube_url = "http://127.0.0.1:8001/youtube/download?file=ytdlp:dQw4w9WgXcQ:bestvideo&filename=Rick_Astley_Never_Gonna_Give_You_Up.mp4"
    test_endpoint("YouTube Video", youtube_url)
