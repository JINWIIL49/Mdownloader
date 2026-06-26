import imageio
import numpy as np
import sys

# Try writing with the different formats
rgba_frame = np.zeros((256, 256, 4), dtype=np.uint8)

print("Testing webm writer:")
try:
    writer = imageio.get_writer(
        "test_out.webm",
        fps=30,
        codec="libvpx-vp9",
        pixelformat="yuva420p",
        format="webm",
        ffmpeg_params=["-lossless", "1", "-deadline", "realtime", "-cpu-used", "8"]
    )
    print("Created writer. Appending data...")
    writer.append_data(rgba_frame)
    print("Appended data successfully.")
    writer.close()
except Exception as e:
    print("Error with webm:", e)

print("\nTesting mov writer:")
try:
    writer = imageio.get_writer(
        "test_out.mov",
        fps=30,
        codec="qtrle",
        pixelformat="argb",
        format="mov"
    )
    print("Created writer. Appending data...")
    writer.append_data(rgba_frame)
    print("Appended data successfully.")
    writer.close()
except Exception as e:
    print("Error with mov:", e)
