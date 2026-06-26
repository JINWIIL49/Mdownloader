"""
Test script: upload test.mp4, wait for processing, download, and inspect
the alpha channel of the result WITHOUT deleting the file.
"""
import requests
import time
import subprocess
import os
import imageio_ffmpeg

BACKEND_URL = "http://localhost:8000"
TEST_VIDEO = "test.mp4"  # must exist in cwd
FORMAT = "mp4-transparent"

def main():
    # 1. Upload video
    print("Uploading test video...")
    with open(TEST_VIDEO, "rb") as f:
        resp = requests.post(
            f"{BACKEND_URL}/remove-video-bg",
            files={"file": ("test.mp4", f, "video/mp4")},
            data={"format": FORMAT},
            timeout=30
        )
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    print(f"Job ID: {job_id}")

    # 2. Poll for completion
    print("Waiting for processing...")
    while True:
        time.sleep(2)
        prog = requests.get(f"{BACKEND_URL}/video-progress/{job_id}").json()
        status = prog["status"]
        progress = prog.get("progress", 0)
        print(f"  Status: {status}, Progress: {progress}%")
        if status == "completed":
            break
        elif status == "failed":
            print("ERROR:", prog.get("error"))
            return

    # 3. Download result
    print("Downloading result...")
    dl = requests.get(f"{BACKEND_URL}/video-download/{job_id}", stream=True)
    dl.raise_for_status()
    content_type = dl.headers.get("content-type", "")
    print(f"Content-Type: {content_type}")
    
    out_file = "test_result.webm"
    with open(out_file, "wb") as f:
        for chunk in dl.iter_content(8192):
            f.write(chunk)
    
    size = os.path.getsize(out_file)
    print(f"Downloaded to {out_file} ({size} bytes)")

    # 4. Inspect with FFmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    print("\nFFmpeg inspection:")
    res = subprocess.run([ffmpeg, "-i", out_file], capture_output=True, text=True)
    for line in res.stderr.splitlines():
        if "Stream" in line or "Error" in line or "alpha" in line or "pix_fmt" in line or "codec" in line.lower():
            print(" ", line.strip())

if __name__ == "__main__":
    main()
