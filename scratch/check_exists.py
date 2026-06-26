import os

print("Current working directory:", os.getcwd())
print("Files in current directory:")
for f in os.listdir("."):
    if f.endswith(".webm") or f.endswith(".mp4") or "test" in f:
        print(f" - {f}: {os.path.getsize(f) if os.path.isfile(f) else 'dir'}")
