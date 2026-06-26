import subprocess
import imageio_ffmpeg

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
print("FFmpeg executable:", ffmpeg_exe)

# Check if VP9 support is there and if yuva420p is supported
try:
    res = subprocess.run([ffmpeg_exe, "-pix_fmts"], capture_output=True, text=True, check=True)
    supported_formats = [line for line in res.stdout.splitlines() if "yuva420p" in line]
    print("yuva420p support in formats:", supported_formats)
except Exception as e:
    print("Error checking pix_fmts:", e)

try:
    res = subprocess.run([ffmpeg_exe, "-encoders"], capture_output=True, text=True, check=True)
    vp9_encoders = [line for line in res.stdout.splitlines() if "vp9" in line or "vpx" in line]
    print("VP9 encoders:", vp9_encoders)
except Exception as e:
    print("Error checking encoders:", e)
