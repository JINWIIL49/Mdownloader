import sys
import os
import asyncio

# Add python-backend to sys.path
sys.path.append(os.path.abspath("python-backend"))
from main import youtube_download, yt_progress

class DummyRequest:
    def __init__(self):
        self.headers = {}
        self.scope = {"type": "http"}
    async def is_disconnected(self):
        return False

class DummyBackgroundTasks:
    def add_task(self, func, *args, **kwargs):
        pass

async def main():
    # Rick Astley video ID (dQw4w9WgXcQ)
    file_param = "ytdlp:dQw4w9WgXcQ:bestvideo%5Bheight%3C%3D1080%5D%2Bbestaudio%5Bext%3Dm4a%5D/bestvideo%5Bheight%3C%3D1080%5D%2Bbestaudio/best%5Bheight%3C%3D1080%5D"
    filename = "Rick_Astley_1080p.mp4"
    
    req = DummyRequest()
    bg = DummyBackgroundTasks()
    
    try:
        response = await youtube_download(request=req, file=file_param, filename=filename, background_tasks=bg)
        print("Success! Got response type:", type(response))
        
        bytes_received = 0
        async for chunk in response.body_iterator:
            bytes_received += len(chunk)
            prog = yt_progress.get(filename)
            print(f"Read chunk: {len(chunk)} bytes. Total so far: {bytes_received} bytes. Current progress: {prog}")
            if bytes_received > 5 * 1024 * 1024:
                print("Received 5MB, stopping test.")
                break
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
