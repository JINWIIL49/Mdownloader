import asyncio
import yt_dlp
import imageio_ffmpeg
import urllib.parse
import re

async def main():
    video_url = "https://www.youtube.com/watch?v=YrqebLrbslo" # The video from user's logs
    format_selector = "bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]"
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 15,
        'format': format_selector,
    }
    
    print("Extracting URLs via yt-dlp...")
    loop = asyncio.get_event_loop()
    try:
        def extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(video_url, download=False)
        info_dict = await loop.run_in_executor(None, extract)
        print("Extraction successful!")
    except Exception as e:
        print(f"Extraction failed: {e}")
        return

    formats = info_dict.get('formats', [])
    requested_url = None
    video_cdn_url = None
    audio_cdn_url = None
    video_headers = {}
    audio_headers = {}

    if info_dict.get('url'):
        requested_url = info_dict['url']
        video_headers = info_dict.get('http_headers', {}) or {}

    if not requested_url:
        vid_streams = [f for f in formats if f.get('vcodec') != 'none' and f.get('acodec') == 'none' and f.get('url')]
        aud_streams = [f for f in formats if f.get('acodec') != 'none' and f.get('vcodec') == 'none' and f.get('url')]
        vid_streams.sort(key=lambda x: (x.get('height', 0), x.get('tbr', 0) or 0), reverse=True)
        aud_streams.sort(key=lambda x: x.get('tbr', 0) or 0, reverse=True)
        
        if vid_streams:
            video_cdn_url = vid_streams[0]['url']
            video_headers = vid_streams[0].get('http_headers', {}) or {}
        if aud_streams:
            audio_cdn_url = aud_streams[0]['url']
            audio_headers = aud_streams[0].get('http_headers', {}) or {}

    def make_http_header_opts(hdrs: dict) -> list:
        if not hdrs:
            return []
        header_str = "".join(f"{k}: {v}\r\n" for k, v in hdrs.items())
        return ["-headers", header_str]

    if requested_url:
        input_hdr = video_headers or audio_headers
        ffmpeg_cmd = [ffmpeg_exe, "-y"] + make_http_header_opts(input_hdr) + ["-i", requested_url] + ["-c:v", "copy", "-c:a", "copy", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "pipe:1"]
    else:
        ffmpeg_cmd = [ffmpeg_exe, "-y"]
        if video_cdn_url:
            ffmpeg_cmd += make_http_header_opts(video_headers) + ["-i", video_cdn_url]
        if audio_cdn_url:
            ffmpeg_cmd += make_http_header_opts(audio_headers) + ["-i", audio_cdn_url]
        ffmpeg_cmd += ["-c:v", "copy", "-c:a", "copy", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "pipe:1"]

    print(f"Spawning ffmpeg with command length: {len(' '.join(ffmpeg_cmd))}")
    try:
        ffmpeg_proc = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        print("Spawn successful! Reading first 100KB of stdout...")
        # Read a chunk of data to verify streaming works
        chunk = await asyncio.wait_for(ffmpeg_proc.stdout.read(102400), timeout=30.0)
        print(f"Successfully read {len(chunk)} bytes from stdout!")
        
        # Kill the process
        ffmpeg_proc.kill()
        await ffmpeg_proc.wait()
        print("Test passed successfully!")
    except Exception as e:
        print(f"Spawn failed: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
