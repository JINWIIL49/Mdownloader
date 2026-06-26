import imageio
import numpy as np

# Test if using pix_fmt="yuva420p" instead of pixelformat="yuva420p" works!
output_path = "test_transparency_pixfmt.webm"
fps = 30
width, height = 256, 256

try:
    # Use pix_fmt as the argument
    writer = imageio.get_writer(
        output_path,
        fps=fps,
        codec="libvpx-vp9",
        pix_fmt="yuva420p",
        format="webm",
        ffmpeg_params=["-lossless", "1", "-deadline", "realtime", "-cpu-used", "8"]
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
    print("Video with pix_fmt written successfully.")
except Exception as e:
    print("Error writing with pix_fmt:", e)

# Read it back and inspect
try:
    reader = imageio.get_reader(output_path)
    meta = reader.get_meta_data()
    print("Metadata with pix_fmt:", meta)
    
    first_frame = reader.get_data(0)
    print("First frame shape:", first_frame.shape)
    if first_frame.shape[2] == 4:
        alpha = first_frame[:, :, 3]
        print("Alpha unique values:", np.unique(alpha))
    else:
        # Check if reader has an argument to force alpha/RGBA
        print("Reader first frame does not have 4 channels by default.")
        # Try reading it with forcing pixel format
        try:
            reader_rgba = imageio.get_reader(output_path, pixelformat="rgba")
            frame_rgba = reader_rgba.get_data(0)
            print("Forced RGBA frame shape:", frame_rgba.shape)
            if frame_rgba.shape[2] == 4:
                print("Forced RGBA Alpha unique values:", np.unique(frame_rgba[:, :, 3]))
        except Exception as ex:
            print("Error forcing RGBA reader:", ex)
except Exception as e:
    print("Error reading video:", e)
