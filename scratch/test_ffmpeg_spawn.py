import asyncio
import imageio_ffmpeg

async def main():
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    
    # Try spawning a simple ffmpeg command to test subprocess execution
    ffmpeg_cmd = [ffmpeg_exe, "-version"]
    
    print(f"Spawning: {ffmpeg_cmd}")
    try:
        proc = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        print("Spawn successful!")
        print(f"Stdout first line: {stdout.decode('utf-8', errors='replace').splitlines()[0]}")
    except Exception as e:
        print(f"Spawn failed with exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
