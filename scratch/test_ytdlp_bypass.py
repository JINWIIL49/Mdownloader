import yt_dlp
import sys

video_url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
ydl_opts = {
    'quiet': False,
    'source_address': '0.0.0.0', # Force IPv4
    'geo_bypass': True,
    'extractor_args': {
        'youtube': {
            'player_client': ['android', 'ios', 'web', 'mweb'],
            'skip': ['webpage', 'player'],
        }
    },
    'http_headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-us,en;q=0.5',
        'Sec-Fetch-Mode': 'navigate',
    }
}

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(video_url, download=False)
        print("SUCCESS! Title:", info.get('title'))
        print("Available formats:", len(info.get('formats', [])))
except Exception as e:
    print("FAILED:", str(e))
