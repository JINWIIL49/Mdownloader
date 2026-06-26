import urllib.request
import json
import time

def test_mediafire():
    url = "http://127.0.0.1:8000/mediafire/info"
    data = {"url": "https://www.mediafire.com/file/zulayut7xnratjf/test.txt/file"}
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        print("Testing MediaFire info endpoint...")
        with urllib.request.urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
            print("MediaFire info response:")
            print(json.dumps(payload, indent=2))
    except Exception as e:
        print("MediaFire test failed:", e)

def test_spotify():
    url = "http://127.0.0.1:8000/spotify/info"
    data = {"url": "https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6"}
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        print("\nTesting Spotify info endpoint...")
        with urllib.request.urlopen(req, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
            print("Spotify info response:")
            print(json.dumps(payload, indent=2))
    except Exception as e:
        print("Spotify test failed:", e)

if __name__ == "__main__":
    test_mediafire()
    test_spotify()
