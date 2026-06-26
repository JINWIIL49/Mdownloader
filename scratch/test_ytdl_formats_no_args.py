import yt_dlp
import imageio_ffmpeg

video_url = "https://www.youtube.com/watch?v=2xWkATdMQms"
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

ydl_opts = {
    'format': 'bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    'ffmpeg_location': ffmpeg_exe,
    'quiet': False,
    'no_warnings': False,
    'source_address': '0.0.0.0', # Force IPv4
    'geo_bypass': True,
    'http_headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-us,en;q=0.5',
        'Sec-Fetch-Mode': 'navigate',
    },
    'js_runtimes': {
        'node': {}
    }
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info = ydl.extract_info(video_url, download=False)
    print("Selected format:", info.get('format'))
    print("Selected format ID:", info.get('format_id'))
    print("Width:", info.get('width'), "Height:", info.get('height'))
