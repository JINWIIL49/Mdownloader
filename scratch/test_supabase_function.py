import urllib.request
import json

url = "https://mdeaizzwijbnarzqrlbh.supabase.co/functions/v1/spotify-download"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZWFpenp3aWpibmFyenFybGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTI5NjksImV4cCI6MjA5MjM4ODk2OX0.QqjYI5_Zzr7jTceLxH7lWY5nJGBHOLoS3WkNQ5Lgpdo"

track_url = "https://open.spotify.com/track/4VpoMzQCFaTMNWMcJBhyPc?si=ad7bc8ceba8248a5"

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {key}",
    "apikey": key
}

data = json.dumps({
    "action": "info",  # or is it just the default post body?
    "url": track_url
}).encode('utf-8')

print(f"Calling hosted function: {url}...")
req = urllib.request.Request(url, data=data, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=10) as res:
        print(f"Status: {res.status}")
        body = res.read().decode('utf-8')
        print("Response Body:")
        print(body)
except Exception as e:
    print(f"Failed: {e}")
    if hasattr(e, "read"):
        print(f"Error body: {e.read().decode('utf-8', errors='ignore')}")
