import subprocess
import os
import cv2
import imageio_ffmpeg

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
video_path = "test_transparency_params.webm"
output_png = "test_extracted_frame.png"

if os.path.exists(output_png):
    os.remove(output_png)

try:
    # Run ffmpeg to extract the first frame as a PNG with RGBA pixel format
    cmd = [
        ffmpeg_exe,
        "-y",
        "-i", video_path,
        "-vframes", "1",
        "-pix_fmt", "rgba",
        output_png
    ]
    print("Running command:", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    
    if os.path.exists(output_png):
        img = cv2.imread(output_png, cv2.IMREAD_UNCHANGED)
        print("Extracted image shape:", img.shape)
        if img.shape[2] == 4:
            alpha = img[:, :, 3]
            print("Alpha channel values unique:", np.unique(alpha))
            print("Alpha min:", alpha.min(), "max:", alpha.max(), "mean:", alpha.mean())
        else:
            print("Extracted image does not have 4 channels!")
        os.remove(output_png)
    else:
        print("Failed to extract image file.")
except Exception as e:
    print("Error:", e)
