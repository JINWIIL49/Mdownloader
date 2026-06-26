import subprocess
import os
import shutil
import numpy as np
import cv2
import imageio_ffmpeg

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
temp_dir = "temp_frames"
os.makedirs(temp_dir, exist_ok=True)

# 1. Write 10 transparent PNG frames
print("Writing 10 PNG frames with alpha...")
for i in range(10):
    frame = np.zeros((256, 256, 4), dtype=np.uint8)
    # Red with transparent background
    frame[:, :, 2] = 255  # Red channel in BGRA
    frame[:, :, 3] = 128  # Semi-transparent alpha
    
    # Opaque green square in the center
    frame[64:192, 64:192, 1] = 255  # Green channel in BGRA
    frame[64:192, 64:192, 3] = 255  # Fully opaque
    
    cv2.imwrite(os.path.join(temp_dir, f"frame_{i:03d}.png"), frame)

output_video = "test_direct_cli.webm"
if os.path.exists(output_video):
    os.remove(output_video)

# 2. Run FFmpeg CLI directly to encode WebM with VP9 and yuva420p
print("\nRunning FFmpeg CLI...")
cmd = [
    ffmpeg_exe,
    "-y",
    "-framerate", "30",
    "-i", os.path.join(temp_dir, "frame_%03d.png"),
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuva420p",
    output_video
]

print("Command:", " ".join(cmd))
res = subprocess.run(cmd, capture_output=True, text=True)
print("FFmpeg stdout:", res.stdout)
print("FFmpeg stderr:", res.stderr)

# 3. Clean up temp frames
shutil.rmtree(temp_dir)

# 4. Check if the output file has transparency by running ffmpeg -i on it
print("\nInspecting the output video metadata using FFmpeg...")
res_inspect = subprocess.run([ffmpeg_exe, "-i", output_video], capture_output=True, text=True)
print(res_inspect.stderr)
