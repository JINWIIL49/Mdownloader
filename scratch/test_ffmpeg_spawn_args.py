import asyncio
import imageio_ffmpeg

async def main():
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    
    # Passing -headers with newlines to see if it causes WinError or other issues
    headers_str = "User-Agent: Mozilla/5.0\r\nAccept: */*\r\n"
    ffmpeg_cmd = [
        ffmpeg_exe,
        "-y",
        "-headers", headers_str,
        "-i", "https://www.google.com",
        "-f", "null",
        "-"
    ]
    
    print(f"Spawning: {ffmpeg_cmd}")
    try:
        proc = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        print("Spawn successful! Waiting for process...")
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        print("Communicate successful!")
        print("stderr output:", stderr.decode('utf-8', errors='replace')[:200])
    except Exception as e:
        print(f"Spawn failed with exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
