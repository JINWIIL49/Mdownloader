import yt_dlp
import imageio_ffmpeg

video_url = "https://www.youtube.com/watch?v=LXb3EKWsInQ" # Costa Rica 4K
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

ydl_opts = {
    'ffmpeg_location': ffmpeg_exe,
    'quiet': True,
    'no_warnings': True,
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info = ydl.extract_info(video_url, download=False)
    formats = info.get("formats", [])
    heights = sorted(list({f.get("height") for f in formats if f.get("height")}), reverse=True)
    print("YT-DLP available heights:", heights)
