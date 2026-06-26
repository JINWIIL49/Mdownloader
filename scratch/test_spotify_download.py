import urllib.request
import urllib.parse
import json

port = 8001
url = "ytdlp:dQw4w9WgXcQ:bestaudio"
filename = "Rick Astley - Never Gonna Give You Up.mp3"

download_url = f"http://127.0.0.1:{port}/spotify/download?file={urllib.parse.quote(url)}&filename={urllib.parse.quote(filename)}"
print(f"Testing direct download request to: {download_url}")

try:
    req = urllib.request.Request(download_url)
    with urllib.request.urlopen(req, timeout=60) as res:
        print(f"Status: {res.status}")
        headers = dict(res.info())
        print(f"Content-Length: {headers.get('Content-Length')}")
        print(f"Content-Type: {headers.get('Content-Type')}")
        print(f"Content-Disposition: {headers.get('Content-Disposition')}")
        
        # Read the first 100 bytes to check if it's a valid MP3 file
        first_bytes = res.read(100)
        print("First 100 bytes:", repr(first_bytes))
        
        # Verify if it starts with ID3 header (ID3v2 tags start with b'ID3') or standard MP3 sync frame
        if first_bytes.startswith(b'ID3') or (len(first_bytes) > 0 and first_bytes[0] == 0xFF and (first_bytes[1] & 0xE0) == 0xE0):
            print("SUCCESS: Valid MP3 format detected!")
        else:
            print("WARNING: Unrecognized format or empty response.")
except Exception as e:
    print(f"Request failed: {e}")
    if hasattr(e, "read"):
        print(f"Error body: {e.read().decode('utf-8', errors='ignore')}")
