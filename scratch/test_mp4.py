import imageio
import numpy as np

# Test MP4 writer default plugin
try:
    writer = imageio.get_writer("test.mp4", fps=30)
    print("MP4 Writer type:", type(writer))
    writer.close()
except Exception as e:
    print("MP4 Writer error:", e)
