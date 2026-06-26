import yt_dlp
import imageio_ffmpeg
import time
import os

video_url = "https://www.youtube.com/watch?v=LXb3EKWsInQ" # Costa Rica 4K
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

def test_speed(use_custom_headers):
    temp_file = f"scratch/test_speed_{'custom' if use_custom_headers else 'default'}.%(ext)s"
    ydl_opts = {
        'format': 'bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]',
        'ffmpeg_location': ffmpeg_exe,
        'outtmpl': temp_file,
        'quiet': True,
        'no_warnings': True,
    }
    
    if use_custom_headers:
        ydl_opts.update({
            'source_address': '0.0.0.0',
            'geo_bypass': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Sec-Fetch-Mode': 'navigate',
            }
        })
    else:
        ydl_opts.update({
            'source_address': '0.0.0.0',
            'geo_bypass': True,
        })
        
    start_time = time.time()
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
        duration = time.time() - start_time
        print(f"Downloaded {'WITH' if use_custom_headers else 'WITHOUT'} custom headers in {duration:.2f} seconds.")
    except Exception as e:
        print(f"Failed {'WITH' if use_custom_headers else 'WITHOUT'} custom headers: {e}")
        
    # Clean up
    for ext in ['mp4', 'mkv', 'webm']:
        path = f"scratch/test_speed_{'custom' if use_custom_headers else 'default'}.{ext}"
        if os.path.exists(path):
            os.remove(path)

print("Starting speed tests...")
test_speed(True)
test_speed(False)
