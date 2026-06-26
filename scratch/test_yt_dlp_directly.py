import subprocess
import sys
import shutil

video_id = "dQw4w9WgXcQ"
url = f"https://www.youtube.com/watch?v={video_id}"

print(f"Testing yt-dlp download for: {url}")
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-f", "bestaudio/best",
        "--ffmpeg-location", ffmpeg_exe,
        "-x", "--audio-format", "mp3",
        "--no-check-certificate",
        "--js-runtimes", "deno",
        "--js-runtimes", "node",
        url
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("Return code:", res.returncode)
    print("STDOUT:", res.stdout)
    print("STDERR:", res.stderr)
except Exception as e:
    print("Execution failed:", e)
