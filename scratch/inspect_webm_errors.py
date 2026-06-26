import subprocess
import imageio_ffmpeg

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
video_path = "test_transparency_params.webm"
output_png = "test_extracted_frame.png"

cmd = [
    ffmpeg_exe,
    "-y",
    "-i", video_path,
    "-vframes", "1",
    "-pix_fmt", "rgba",
    output_png
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("Return code:", res.returncode)
print("Stdout:", res.stdout)
print("Stderr:", res.stderr)
