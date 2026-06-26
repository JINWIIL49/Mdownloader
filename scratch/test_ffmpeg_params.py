import imageio
import numpy as np

output_path = "test_transparency_params.webm"
fps = 30
width, height = 256, 256

try:
    # Set -pix_fmt yuva420p inside ffmpeg_params!
    writer = imageio.get_writer(
        output_path,
        fps=fps,
        codec="libvpx-vp9",
        format="webm",
        ffmpeg_params=["-pix_fmt", "yuva420p", "-lossless", "1", "-deadline", "realtime", "-cpu-used", "8"]
    )
    
    for i in range(10):
        frame = np.zeros((height, width, 4), dtype=np.uint8)
        frame[:, :, 0] = 255  # Red
        frame[:, :, 3] = 128  # Semi-transparent alpha
        
        # Center opaque square
        frame[64:192, 64:192, 1] = 255  # Green
        frame[64:192, 64:192, 3] = 255  # Opaque
        
        writer.append_data(frame)
    writer.close()
    print("Video written successfully.")
except Exception as e:
    print("Error writing video:", e)

# Read it back and check the channels
try:
    reader_rgba = imageio.get_reader(output_path, pixelformat="rgba")
    meta = reader_rgba.get_meta_data()
    print("Metadata:", meta)
    
    rgba_frame = reader_rgba.get_data(0)
    print("RGBA frame shape:", rgba_frame.shape)
    alpha = rgba_frame[:, :, 3]
    print("Alpha values unique:", np.unique(alpha))
    print("Alpha min/max/mean:", alpha.min(), alpha.max(), alpha.mean())
    reader_rgba.close()
except Exception as e:
    print("Error reading video:", e)
