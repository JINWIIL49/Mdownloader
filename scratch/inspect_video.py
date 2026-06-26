import imageio
import numpy as np

output_path = "test_transparency.webm"
fps = 30
width, height = 256, 256

# Write a 10-frame video where each frame has a transparent circle in the middle
try:
    writer = imageio.get_writer(
        output_path,
        fps=fps,
        codec="libvpx-vp9",
        pixelformat="yuva420p",
        format="webm",
        ffmpeg_params=["-lossless", "1", "-deadline", "realtime", "-cpu-used", "8"]
    )
    
    for i in range(10):
        # Create an RGBA frame: red background with 100 alpha, and a fully opaque green circle
        frame = np.zeros((height, width, 4), dtype=np.uint8)
        frame[:, :, 0] = 255  # Red channel
        frame[:, :, 3] = 128  # Semitransparent background
        
        # Opaque square in the center
        frame[64:192, 64:192, 1] = 255  # Green channel
        frame[64:192, 64:192, 3] = 255  # Fully opaque
        
        writer.append_data(frame)
    writer.close()
    print("Video written successfully.")
except Exception as e:
    print("Error writing video:", e)
    sys.exit(1)

# Now read the video back and inspect the channels
try:
    reader = imageio.get_reader(output_path)
    meta = reader.get_meta_data()
    print("Metadata:", meta)
    
    first_frame = reader.get_data(0)
    print("First frame shape:", first_frame.shape)
    if first_frame.shape[2] == 4:
        alpha = first_frame[:, :, 3]
        print("Alpha unique values:", np.unique(alpha))
        print("Alpha min:", alpha.min(), "max:", alpha.max(), "mean:", alpha.mean())
    else:
        print("Error: Read frame does not have 4 channels! Shape:", first_frame.shape)
except Exception as e:
    print("Error reading video:", e)
