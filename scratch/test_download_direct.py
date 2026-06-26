import yt_dlp
import imageio_ffmpeg
import os

video_url = "https://www.youtube.com/watch?v=2xWkATdMQms"
ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

ydl_opts = {
    'format': 'bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    'ffmpeg_location': ffmpeg_exe,
    'outtmpl': 'scratch/test_direct_download.%(ext)s',
    'quiet': False,
    'no_warnings': False,
    'js_runtimes': {'node': {}},
    'merge_output_format': 'mp4',
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info_dict = ydl.extract_info(video_url, download=True)
    filename = ydl.prepare_filename(info_dict)
    print("Downloaded file:", filename)
