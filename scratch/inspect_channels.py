import imageio
import numpy as np

output_path = "test_transparency.webm"

try:
    # Try reading the video with imageio.get_reader
    print("Reading with default reader...")
    reader = imageio.get_reader(output_path)
    meta = reader.get_meta_data()
    print("Metadata:", meta)
    
    first_frame = reader.get_data(0)
    print("Default frame shape:", first_frame.shape)
    reader.close()
    
    # Try reading with pixelformat='rgba'
    print("\nReading with pixelformat='rgba'...")
    reader_rgba = imageio.get_reader(output_path, pixelformat="rgba")
    rgba_frame = reader_rgba.get_data(0)
    print("RGBA frame shape:", rgba_frame.shape)
    alpha = rgba_frame[:, :, 3]
    print("Alpha values unique:", np.unique(alpha))
    print("Alpha min/max/mean:", alpha.min(), alpha.max(), alpha.mean())
    reader_rgba.close()
    
except Exception as e:
    print("Error:", e)
