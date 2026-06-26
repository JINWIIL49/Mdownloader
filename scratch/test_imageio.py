import imageio

try:
    writer = imageio.get_writer("test.webm", fps=30, codec="libvpx-vp9", pixelformat="yuva420p", format="webm")
    print("Writer type:", type(writer))
    print("Writer format:", writer.format)
    print("Writer plugin:", getattr(writer, "_plugin", "no plugin attr"))
    writer.close()
except Exception as e:
    print("Error:", e)
