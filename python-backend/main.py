import sys

# Force UTF-8 output on Windows so yt-dlp Unicode titles never crash with
# 'charmap codec can't encode character' UnicodeEncodeError → HTTP 500
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

class SafeStreamWrapper:
    def __init__(self, stream):
        self.stream = stream

    def write(self, data):
        try:
            self.stream.write(data)
        except UnicodeEncodeError:
            try:
                encoding = getattr(self.stream, 'encoding', 'utf-8') or 'utf-8'
                safe_data = data.encode(encoding, errors='replace').decode(encoding)
                self.stream.write(safe_data)
            except Exception:
                try:
                    safe_data = data.encode('ascii', errors='replace').decode('ascii')
                    self.stream.write(safe_data)
                except Exception:
                    pass

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    def flush(self):
        try:
            self.stream.flush()
        except Exception:
            pass

    def __getattr__(self, attr):
        return getattr(self.stream, attr)

# Wrap sys.stdout and sys.stderr with the safe stream wrappers to capture and suppress 
# any UnicodeEncodeError raised by Uvicorn, FastAPI, or logging handlers.
if sys.stdout is not None:
    sys.stdout = SafeStreamWrapper(sys.stdout)
if sys.stderr is not None:
    sys.stderr = SafeStreamWrapper(sys.stderr)

_original_print = print
def print(*args, **kwargs):
    try:
        _original_print(*args, **kwargs)
    except UnicodeEncodeError:
        new_args = []
        for arg in args:
            if isinstance(arg, str):
                new_args.append(arg.encode('ascii', errors='replace').decode('ascii'))
            else:
                new_args.append(arg)
        _original_print(*new_args, **kwargs)

import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uuid
import os
import shutil
import asyncio
import imageio
import zipfile
import re
import urllib.parse
import tempfile
import yt_dlp
import imageio_ffmpeg

try:
    import requests as _requests_lib
    requests_available = True
except ImportError:
    requests_available = False

try:
    from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, error as ID3Error
    from mutagen.mp3 import MP3
    mutagen_available = True
except ImportError:
    mutagen_available = False
    print("[Warning] mutagen not available. Cover art will not be embedded into MP3 files.")

try:
    import cv2
    cv_available = True
except ImportError:
    cv_available = False
    print("[Warning] OpenCV (cv2) not available. Video background removal features are disabled.")

# rembg is lazy-loaded to prevent importing heavy dependencies (PyTorch/ONNX) at startup,
# which can exceed the 512MB RAM limit on free hosting tiers (Render/Railway) and cause OOM-kills.
rembg_available = True

def get_cookie_file():
    import base64
    # 1. Check if YOUTUBE_COOKIES env var is present
    cookies_env = os.environ.get("YOUTUBE_COOKIES")
    if cookies_env:
        try:
            cookies_content = cookies_env.strip()
            # Detect base64-encoded cookies (no tabs = not Netscape format)
            if cookies_content and "\t" not in cookies_content and "\n" not in cookies_content:
                try:
                    decoded = base64.b64decode(cookies_content).decode("utf-8")
                    if "\t" in decoded:
                        print("[Cookies] Decoded base64-encoded YOUTUBE_COOKIES")
                        cookies_content = decoded
                except Exception:
                    pass
            # Normalize Windows CRLF → LF so yt-dlp can parse on Linux
            cookies_content = cookies_content.replace("\r\n", "\n").replace("\r", "\n")
            temp_dir = tempfile.gettempdir()
            cookies_file_path = os.path.join(temp_dir, "youtube_cookies_env.txt")
            with open(cookies_file_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(cookies_content)
            line_count = cookies_content.count("\n")
            print(f"[Cookies] Wrote YOUTUBE_COOKIES to {cookies_file_path} ({line_count} lines)")
            return cookies_file_path
        except Exception as e:
            print(f"[Warning] Failed to write YOUTUBE_COOKIES env to file: {e}")

    # 2. Check for local cookies files (check multiple possible locations)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    candidates = [
        "cookies.txt",
        "../cookies.txt",
        "youtube_cookies.txt",
        os.path.join(script_dir, "cookies.txt"),
        os.path.join(project_root, "cookies.txt"),
        os.path.join(project_root, "youtube_cookies.txt"),
    ]
    for cookies_file in candidates:
        if os.path.exists(cookies_file):
            print(f"[Cookies] Found cookie file: {os.path.abspath(cookies_file)}")
            return os.path.abspath(cookies_file)

    print("[Cookies] WARNING: No cookies.txt found — YouTube will serve LOW QUALITY streams!")
    return None

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    # If the request path starts with /api (as it does when run as a Vercel Serverless Function),
    # strip /api from the path so FastAPI's standard routes match perfectly!
    path = request.scope.get("path", "")
    if path.startswith("/api"):
        request.scope["path"] = path[4:] or "/"
        if "raw_path" in request.scope:
            request.scope["raw_path"] = request.scope["raw_path"][4:] or b"/"
    return await call_next(request)


@app.get("/health")
async def health():
    """Simple health endpoint to verify the backend is reachable from the frontend."""
    import os, time
    try:
        mtime = os.path.getmtime(__file__)
        mtime_str = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(mtime))
    except Exception:
        mtime_str = "unknown"
    return {"ok": True, "mtime": mtime_str, "version": "1.0.1-logging"}

# Global session placeholder for lazy loading
session = None

def get_rembg_session():
    global session
    if session is None:
        try:
            from rembg import new_session
        except ImportError:
            raise RuntimeError("rembg is not installed in the Python environment.")
        # Load u2net (standard, 175MB) for highly accurate background removal
        session = new_session("u2net")
    return session

# Global job dictionary
jobs = {}

@app.post("/remove-video-bg")
async def remove_video_bg(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    format: str = Form("mp4-transparent")  # mp4-transparent, mov-transparent, webm, mp4-green, mp4-black, mp4-white, zip
):
    job_id = str(uuid.uuid4())
    
    # Determine correct input extension from the file's original name (default to .mp4)
    orig_ext = os.path.splitext(file.filename)[1].lower() if file.filename else ".mp4"
    if orig_ext not in (".gif", ".mp4", ".webm", ".mov", ".mkv", ".avi"):
        orig_ext = ".mp4"
    input_path = f"temp_in_{job_id}{orig_ext}"
    
    # Set correct output extension based on requested format
    if format == "zip":
        ext = "zip"
    elif format in ("webm", "mp4-transparent"):
        ext = "webm"
    elif format == "mov-transparent":
        ext = "mov"
    elif format == "gif":
        ext = "gif"
    else:
        ext = "mp4"
    output_path = f"temp_out_{job_id}.{ext}"
    
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        model_session = get_rembg_session()
    except Exception as e:
        if os.path.exists(input_path):
            os.remove(input_path)
        raise HTTPException(status_code=500, detail=f"Failed to load AI model: {str(e)}")

    # Initialize job state
    jobs[job_id] = {
        "status": "processing",
        "progress": 0,
        "error": None,
        "input_path": input_path,
        "output_path": output_path
    }

    # Start the async processing task on the main event loop
    async def process_video_async():
        temp_frames_dir = None
        gif_reader = None
        cap = None
        try:
            is_gif_input = (orig_ext == ".gif")
            if is_gif_input:
                import imageio
                gif_reader = imageio.get_reader(input_path)
                fps = gif_reader.get_meta_data().get('fps', 10)
                total_frames = gif_reader.get_length()
                if total_frames <= 0:
                    total_frames = 1
                # Read first frame to get dimensions
                first_frame = gif_reader.get_data(0)
                height, width = first_frame.shape[:2]
            else:
                cap = cv2.VideoCapture(input_path)
                fps = cap.get(cv2.CAP_PROP_FPS)
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                if total_frames <= 0:
                    total_frames = 1
                
            # DOWN-SCALE to 320px (optimal native resolution for u2net to ensure max accuracy and high speed)
            max_dim = 320
            scale = 1.0
            if max(width, height) > max_dim:
                scale = max_dim / max(width, height)
                
            new_width = int(width * scale)
            new_height = int(height * scale)
            
            # Setup the writer based on the format
            writer = None
            zip_file = None
            
            if format == "zip":
                zip_file = zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED)
            elif format in ("webm", "mov-transparent", "mp4-transparent", "gif"):
                temp_frames_dir = f"temp_frames_{job_id}"
                os.makedirs(temp_frames_dir, exist_ok=True)
            else:
                # Standard high-compatibility MP4 - optimized with medium preset and crf 16 for high-quality, crisp borders (best MP4)
                writer = imageio.get_writer(
                    output_path,
                    fps=fps,
                    codec="libx264",
                    pixelformat="yuv420p",
                    ffmpeg_params=["-preset", "medium", "-crf", "16"]
                )
            
            processed_frames = 0
            last_mask = None
            
            while True:
                if is_gif_input:
                    if processed_frames >= total_frames:
                        break
                    try:
                        frame_rgb = gif_reader.get_data(processed_frames)
                    except IndexError:
                        break
                    frame = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
                else:
                    if cap is None or not cap.isOpened():
                        break
                    ret, frame = cap.read()
                    if not ret:
                        break
                
                # Resize if needed
                if scale < 1.0:
                    frame_resized = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
                else:
                    frame_resized = frame
                
                # For GIFs reuse mask every 2nd frame (GIFs have similar adjacent frames) to halve processing time.
                # For video, process every single frame for best accuracy.
                if is_gif_input and processed_frames % 2 != 0 and last_mask is not None:
                    pass  # reuse last_mask
                else:
                    from rembg import remove
                    mask = remove(frame_resized, session=model_session, only_mask=True)
                    last_mask = cv2.GaussianBlur(mask, (3, 3), 0)
                
                # Process and write the frame depending on output format
                if format == "zip":
                    # Black out background pixels in BGR channels to optimize PNG compression and prevent color bleeding
                    mask_3d = np.repeat(last_mask[:, :, np.newaxis], 3, axis=2) / 255.0
                    clean_bgr = (frame_resized * mask_3d).astype(np.uint8)
                    b, g, r = cv2.split(clean_bgr)
                    rgba = cv2.merge([b, g, r, last_mask])
                    _, png_data = cv2.imencode('.png', rgba)
                    zip_file.writestr(f"frame_{processed_frames:05d}.png", png_data.tobytes())
                elif format in ("webm", "mov-transparent", "mp4-transparent"):
                    # Save frames as temporary PNGs with alpha channel
                    mask_3d = np.repeat(last_mask[:, :, np.newaxis], 3, axis=2) / 255.0
                    clean_bgr = (frame_resized * mask_3d).astype(np.uint8)
                    b, g, r = cv2.split(clean_bgr)
                    rgba = cv2.merge([b, g, r, last_mask])
                    cv2.imwrite(os.path.join(temp_frames_dir, f"frame_{processed_frames:05d}.png"), rgba)
                else:
                    # Blend onto solid background for standard MP4
                    bg = np.zeros_like(frame_resized)
                    if format == "mp4-green":
                        bg[:] = [0, 255, 0]  # Green screen
                    elif format == "mp4-white":
                        bg[:] = [255, 255, 255]  # White background
                    else:
                        bg[:] = [0, 0, 0]  # Black background
                    
                    mask_3d = np.repeat(last_mask[:, :, np.newaxis], 3, axis=2) / 255.0
                    blended = (frame_resized * mask_3d + bg * (1.0 - mask_3d)).astype(np.uint8)
                    
                    # Convert BGR to RGB for imageio
                    rgb = cv2.cvtColor(blended, cv2.COLOR_BGR2RGB)
                    writer.append_data(rgb)
                
                processed_frames += 1
                
                # Update progress
                progress_pct = min(99, int((processed_frames / total_frames) * 100))
                jobs[job_id]["progress"] = progress_pct
                
                # Yield control to the FastAPI event loop every 5 frames to reduce scheduler overhead
                if processed_frames % 5 == 0:
                    await asyncio.sleep(0.001)
                
            if is_gif_input:
                if gif_reader is not None:
                    gif_reader.close()
            else:
                if cap is not None:
                    cap.release()
            if zip_file is not None:
                zip_file.close()
            if writer is not None:
                writer.close()
                
            # Compile transparent formats using direct FFmpeg subprocess for 100% correct alpha modes
            if temp_frames_dir is not None and processed_frames > 0:
                import imageio_ffmpeg
                import subprocess
                ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
                
                if format in ("webm", "mp4-transparent"):
                    cmd = [
                        ffmpeg_exe,
                        "-y",
                        "-framerate", str(fps),
                        "-i", os.path.join(temp_frames_dir, "frame_%05d.png"),
                        "-c:v", "libvpx-vp9",
                        "-pix_fmt", "yuva420p",
                        "-lossless", "1",
                        "-deadline", "realtime",
                        "-cpu-used", "8",
                        output_path
                    ]
                elif format == "mov-transparent":
                    cmd = [
                        ffmpeg_exe,
                        "-y",
                        "-framerate", str(fps),
                        "-i", os.path.join(temp_frames_dir, "frame_%05d.png"),
                        "-c:v", "qtrle",
                        "-pix_fmt", "argb",
                        output_path
                    ]
                elif format == "gif":
                    # Generate an optimal 256-color palette with transparency reserved, then apply it
                    cmd = [
                        ffmpeg_exe,
                        "-y",
                        "-framerate", str(fps),
                        "-i", os.path.join(temp_frames_dir, "frame_%05d.png"),
                        "-filter_complex", "split[s0][s1];[s0]palettegen=reserve_transparent=on[p];[s1][p]paletteuse=alpha_threshold=128",
                        output_path
                    ]
                
                subprocess.run(cmd, capture_output=True, text=True, check=True)
                shutil.rmtree(temp_frames_dir)
                temp_frames_dir = None
                
            jobs[job_id]["status"] = "completed"
            jobs[job_id]["progress"] = 100
        except Exception as ex:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(ex)
        finally:
            if gif_reader is not None:
                try:
                    gif_reader.close()
                except:
                    pass
            if cap is not None:
                try:
                    cap.release()
                except:
                    pass
            if os.path.exists(input_path):
                try:
                    os.remove(input_path)
                except:
                    pass
            if temp_frames_dir is not None and os.path.exists(temp_frames_dir):
                try:
                    shutil.rmtree(temp_frames_dir)
                except:
                    pass

    # Schedule the task on the main event loop
    asyncio.create_task(process_video_async())
    
    return {"job_id": job_id}

@app.get("/video-progress/{job_id}")
async def get_video_progress(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.get("/video-download/{job_id}")
async def get_video_download(job_id: str, background_tasks: BackgroundTasks):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job is not completed yet")
        
    output_path = job["output_path"]
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Processed output file not found")
        
    # Clean up output path after the download response finishes
    background_tasks.add_task(os.remove, output_path)
    # Clean up job dictionary
    background_tasks.add_task(lambda: jobs.pop(job_id, None))
    
    # Determine the file type and output filename dynamically
    _, ext = os.path.splitext(output_path)
    ext = ext.lower().lstrip('.')
    
    if ext == "zip":
        media_type = "application/zip"
        filename = "processed_frames.zip"
    elif ext == "webm":
        media_type = "video/webm"
        filename = "processed_video.webm"
    elif ext == "mov":
        media_type = "video/quicktime"
        filename = "transparent_video.mov"
    else:
        # Transparent MP4 or other MP4 configurations
        media_type = "video/mp4"
        filename = "transparent_video.mp4"
        
    return FileResponse(output_path, media_type=media_type, filename=filename)

# --- YouTube Downloader Endpoints ---

# Global progress storage for yt-dlp
yt_progress = {}

# Global active yt-dlp processes: filename -> asyncio.subprocess.Process.
# Each quality variant has a different filename, so they can run together.
active_procs: dict = {}

def safe_filename(name: str, fallback="download") -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\r\n]+', '_', name or '').strip()
    return cleaned or fallback

def make_ytdlp_hook(progress_key: str):
    def hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            if total > 0:
                percent = int((downloaded / total) * 100)
                # Map 0-100 to 15-90 to account for startup and merging
                mapped = 15 + int((percent / 100) * 75)
            else:
                mapped = 50
                total = 0
                downloaded = 0
            yt_progress[progress_key] = {
                'progress': mapped,
                'downloaded_bytes': downloaded,
                'total_bytes': total,
            }
        elif d['status'] == 'finished':
            prev = yt_progress.get(progress_key) or {}
            yt_progress[progress_key] = {
                'progress': 95,
                'downloaded_bytes': prev.get('total_bytes', 0) if isinstance(prev, dict) else 0,
                'total_bytes': prev.get('total_bytes', 0) if isinstance(prev, dict) else 0,
            }
    return hook

@app.post("/youtube/info")
async def youtube_info(data: dict):
    raise HTTPException(
        status_code=503,
        detail="YouTube downloader is temporarily paused for maintenance. Please use other active platforms."
    )

    
    try:
        if is_playlist and mode not in ("video", "short"):
            # Playlist Mode
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
                'socket_timeout': 10,
                'cookiefile': get_cookie_file(),
            }
            is_cloud = "RENDER" in os.environ or "RAILWAY_STATIC_URL" in os.environ or os.path.exists("/.dockerenv")
            if is_cloud:
                cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".cache", "yt-dlp"))
                ydl_opts.update({
                    'js_runtimes': {
                        'deno': {'path': None},
                        'node': {'path': None}
                    },
                    'remote_components': ['ejs:github'],
                    'cache_dir': cache_dir,
                    'extractor_args': {
                        'youtube': {
                            'player_client': ['ios', 'web']
                        }
                    },
                    'nocheckcertificate': True
                })
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
            
            playlist_title = info.get("title", "YouTube Playlist")
            playlist_author = info.get("uploader") or info.get("author") or None
            
            entries = info.get("entries", [])
            items = []
            
            for entry in entries[:50]: # Limit to first 50 items like original code
                v_id = entry.get("id")
                if not v_id:
                    continue
                v_title = entry.get("title") or f"Video {v_id}"
                v_thumb = f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"
                
                downloads = []
                qualities = [
                    {"height": 1080, "label": "Full HD (1080p)"},
                    {"height": 720,  "label": "HD (720p)"},
                    {"height": 480,  "label": "SD (480p)"},
                    {"height": 360,  "label": "Low Quality (360p)"},
                ]
                for q in qualities:
                    ytdlp_format = f"bestvideo[height<={q['height']}]+bestaudio[ext=m4a]/bestvideo[height<={q['height']}]+bestaudio/best[height<={q['height']}]"
                    downloads.append({
                        "label": q["label"],
                        "url": f"ytdlp:{v_id}:{urllib.parse.quote(ytdlp_format)}",
                        "filename": f"{safe_filename(v_title)}_{q['height']}p.mp4",
                        "mimeType": "video/mp4",
                        "quality": q["height"],
                        "hasAudio": True,
                        "functionName": "youtube-download"
                    })

                # Audio
                downloads.append({
                    "label": "Audio Only (MP3 / M4A)",
                    "url": f"ytdlp:{v_id}:{urllib.parse.quote('bestaudio[ext=m4a]/bestaudio')}",
                    "filename": f"{safe_filename(v_title)}.m4a",
                    "mimeType": "audio/mp4",
                    "quality": 0,
                    "hasAudio": True,
                    "functionName": "youtube-download"
                })
                
                items.append({
                    "id": v_id,
                    "type": "video",
                    "title": v_title,
                    "thumbnail": v_thumb,
                    "downloads": downloads
                })
                
            playlist_thumb = items[0]["thumbnail"] if items else None
            
            return {
                "platform": "youtube",
                "id": url.split("list=")[-1].split("&")[0],
                "sourceType": "playlist",
                "title": playlist_title,
                "authorName": playlist_author,
                "cover": playlist_thumb,
                "items": items
            }
        else:
            # Single Video / Short Mode
            # Parse video ID
            video_id = None
            vid_match = re.search(r'(?:v=|v\/|vi\/|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})', url)
            if vid_match:
                video_id = vid_match.group(1)
            elif len(url) == 11:
                video_id = url
                
            if not video_id:
                raise HTTPException(status_code=400, detail="Could not parse YouTube video ID")
                
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'socket_timeout': 10,
                'cookiefile': get_cookie_file(),
            }
            is_cloud = "RENDER" in os.environ or "RAILWAY_STATIC_URL" in os.environ or os.path.exists("/.dockerenv")
            if is_cloud:
                cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".cache", "yt-dlp"))
                ydl_opts.update({
                    'js_runtimes': {
                        'deno': {'path': None},
                        'node': {'path': None}
                    },
                    'remote_components': ['ejs:github'],
                    'cache_dir': cache_dir,
                    'extractor_args': {
                        'youtube': {
                            'player_client': ['ios', 'web']
                        }
                    },
                    'nocheckcertificate': True
                })
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                
            title = info.get("title", "YouTube Video")
            author_name = info.get("uploader", "Unknown")
            cover = info.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
            
            formats = info.get("formats", [])
            has_heights = {f.get("height") for f in formats if f.get("height")}
            
            downloads = []
            qualities = [
                {"height": 1080, "label": "Full HD (1080p)"},
                {"height": 720,  "label": "HD (720p)"},
                {"height": 480,  "label": "SD (480p)"},
                {"height": 360,  "label": "Low Quality (360p)"},
            ]

            # Detect live streams — they use HLS, not DASH (bestvideo+bestaudio fails on live)
            is_live = bool(info.get("is_live") or info.get("was_live"))

            for q in qualities:
                is_standard = q["height"] in (1080, 720, 480, 360)
                has_quality = q["height"] in has_heights
                if not has_quality and q["height"] >= 1440:
                    lo, hi = q["height"] * 0.8, q["height"] * 1.2
                    has_quality = any(lo <= h <= hi and h > 1280 for h in has_heights)
                if not is_standard and not has_quality:
                    continue

                if is_live:
                    # Live streams: use HLS-compatible selector
                    ytdlp_format = f"best[height<={q['height']}]/best"
                else:
                    ytdlp_format = f"bestvideo[height<={q['height']}]+bestaudio[ext=m4a]/bestvideo[height<={q['height']}]+bestaudio/best[height<={q['height']}]"
                downloads.append({
                    "label": q["label"],
                    "url": f"ytdlp:{video_id}:{urllib.parse.quote(ytdlp_format)}",
                    "filename": f"{safe_filename(title)}_{q['height']}p.mp4",
                    "mimeType": "video/mp4",
                    "quality": q["height"],
                    "hasAudio": True,
                    "functionName": "youtube-download"
                })

            # Audio download
            downloads.append({
                "label": "Audio Only (MP3 / M4A)",
                "url": f"ytdlp:{video_id}:{urllib.parse.quote('bestaudio[ext=m4a]/bestaudio')}",
                "filename": f"{safe_filename(title)}.m4a",
                "mimeType": "audio/mp4",
                "quality": 0,
                "hasAudio": True,
                "functionName": "youtube-download"
            })
            
            return {
                "platform": "youtube",
                "id": video_id,
                "sourceType": mode,
                "title": title,
                "authorName": author_name,
                "cover": cover,
                "items": [
                    {
                        "id": video_id,
                        "type": "audio" if mode == "audio" else "video",
                        "title": title,
                        "downloads": downloads
                    }
                ]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/youtube/progress")
async def get_youtube_progress(filename: str):
    entry = yt_progress.get(filename)
    if isinstance(entry, dict):
        return {
            "progress": entry.get('progress', 0),
            "downloaded_bytes": entry.get('downloaded_bytes', 0),
            "total_bytes": entry.get('total_bytes', 0),
        }
    # Fallback for legacy int values or missing keys
    return {"progress": entry or 0, "downloaded_bytes": 0, "total_bytes": 0}

@app.post("/youtube/cancel")
async def cancel_youtube_download(data: dict):
    """Kill one running yt-dlp download. Called by the frontend Cancel button."""
    video_id = data.get("video_id", "")
    filename = data.get("filename", "")
    killed = []
    
    # 1. Try by exact filename key first (most specific)
    if filename and filename in active_procs:
        proc = active_procs.pop(filename, None)
        if proc:
            try:
                proc.kill()
                killed.append(filename)
                print(f"[Cancel] Killed yt-dlp for filename={filename}")
            except Exception as e:
                print(f"[Cancel] Error killing process: {e}")
    
    # 2. Fallback: kill any process whose key (filename) contains the video_id
    if video_id:
        for key in list(active_procs.keys()):
            if video_id in key:
                proc = active_procs.pop(key, None)
                if proc:
                    try:
                        proc.kill()
                        killed.append(key)
                        print(f"[Cancel] Killed yt-dlp (fallback) for key={key}")
                    except Exception as e:
                        print(f"[Cancel] Error killing process (fallback): {e}")
    
    # Clean up progress keys
    keys_to_remove = [k for k in list(yt_progress.keys())
                      if (video_id and video_id in k) or (filename and filename in k)]
    for k in keys_to_remove:
        yt_progress.pop(k, None)
    return {"cancelled": len(killed) > 0, "killed": killed}

def download_in_chunks_with_range(url, dest_path, progress_callback=None, headers=None):
    import urllib.request
    import ssl
    import time
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    req_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
    }
    if headers:
        for k, v in headers.items():
            req_headers[k] = v
            
    total_size = 0
    req = urllib.request.Request(url, headers=req_headers, method='HEAD')
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            total_size = int(resp.info().get('Content-Length', 0))
    except Exception as e:
        try:
            req = urllib.request.Request(url, headers=req_headers)
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                total_size = int(resp.info().get('Content-Length', 0))
        except Exception as e2:
            print(f"[Fallback] Error getting stream size: {e2}")
            
    chunk_size = 5 * 1024 * 1024 # 5MB chunks
    downloaded = 0
    
    if total_size <= 0:
        req = urllib.request.Request(url, headers=req_headers)
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            total_size = int(resp.info().get('Content-Length', 0)) or 1
            with open(dest_path, 'wb') as f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback:
                        progress_callback(downloaded, total_size)
        return

    with open(dest_path, 'wb') as f:
        while downloaded < total_size:
            start = downloaded
            end = min(downloaded + chunk_size - 1, total_size - 1)
            
            chunk_headers = req_headers.copy()
            chunk_headers['Range'] = f'bytes={start}-{end}'
            
            max_retries = 3
            for retry in range(max_retries):
                try:
                    req = urllib.request.Request(url, headers=chunk_headers)
                    with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
                        chunk_data = resp.read()
                        if len(chunk_data) == 0:
                            raise Exception("Empty chunk read")
                        f.write(chunk_data)
                        downloaded += len(chunk_data)
                        break
                except Exception as chunk_err:
                    if retry == max_retries - 1:
                        raise chunk_err
                    time.sleep(1)
                    
@app.get("/youtube/download")
async def youtube_download(
    request: Request,
    file: str,
    filename: str,
    background_tasks: BackgroundTasks
):
    import urllib.parse
    import urllib.request
    import ssl
    import json
    
    file_decoded = urllib.parse.unquote(file)
    
    # 0. Passthrough for direct HTTP download links
    if file_decoded.startswith("http"):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        req = urllib.request.Request(file_decoded, headers=headers)
        try:
            head_req = urllib.request.Request(file_decoded, headers=headers, method='HEAD')
            content_length = None
            try:
                with urllib.request.urlopen(head_req, context=ctx, timeout=5) as head_res:
                    content_length = head_res.info().get('Content-Length')
            except Exception:
                pass
                
            async def file_sender():
                with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
                    while True:
                        if await request.is_disconnected():
                            break
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        yield chunk
            safe_filename = filename.encode("ascii", errors="replace").decode("ascii")
            headers_response = {
                "Content-Disposition": f"attachment; filename=\"{safe_filename}\"",
                "Content-Type": "audio/mpeg" if filename.lower().endswith((".m4a", ".mp3", ".webm", ".wav")) else "video/mp4"
            }
            if content_length:
                headers_response["Content-Length"] = str(content_length)
            return StreamingResponse(file_sender(), headers=headers_response)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    if not file_decoded.startswith("ytdlp:"):
        print("[Stream] ERROR: Invalid YouTube download file source:", file_decoded)
        raise HTTPException(status_code=400, detail="Invalid YouTube download file source")
        
    parts = file_decoded.split(":")
    if len(parts) < 2:
        print("[Stream] ERROR: Invalid ytdlp URI format:", file_decoded)
        raise HTTPException(status_code=400, detail="Invalid ytdlp URI format")
        
    video_id = parts[1]
    
    # 1. Try DavidCyrilTech API first to bypass yt-dlp slow download/restrictions
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        is_audio_only = filename.lower().endswith((".m4a", ".mp3", ".webm", ".wav"))
        api_endpoint = "ytmp3" if is_audio_only else "ytmp4"
        yt_url = f"https://www.youtube.com/watch?v={video_id}"
        api_url = f"https://apis.davidcyriltech.my.id/download/{api_endpoint}?url={urllib.parse.quote(yt_url)}"
        print(f"[Stream] Trying DavidCyrilTech API: {api_url}")
        
        api_req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(api_req, context=ctx, timeout=15) as api_res:
            api_res_data = json.loads(api_res.read().decode('utf-8'))
            
        if api_res_data.get("success"):
            res_obj = api_res_data.get("result", {})
            download_url = (
                res_obj.get("download_url") or
                res_obj.get("downloadUrl") or
                res_obj.get("url") or
                api_res_data.get("url") or
                api_res_data.get("link")
            )
            if download_url:
                print(f"[Stream] Resolved download link from DavidCyrilTech API: {download_url}")
                dl_headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                dl_req = urllib.request.Request(download_url, headers=dl_headers)
                
                content_length = None
                try:
                    head_req = urllib.request.Request(download_url, headers=dl_headers, method='HEAD')
                    with urllib.request.urlopen(head_req, context=ctx, timeout=5) as head_res:
                        content_length = head_res.info().get('Content-Length')
                except Exception as head_err:
                    print(f"[Stream] HEAD request failed for API link: {head_err}")
                
                async def file_sender():
                    with urllib.request.urlopen(dl_req, context=ctx, timeout=30) as resp:
                        while True:
                            if await request.is_disconnected():
                                break
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            yield chunk
                            
                safe_filename = filename.encode("ascii", errors="replace").decode("ascii")
                headers_response = {
                    "Content-Disposition": f"attachment; filename=\"{safe_filename}\"",
                    "Content-Type": "audio/mpeg" if is_audio_only else "video/mp4"
                }
                if content_length:
                    headers_response["Content-Length"] = str(content_length)
                
                print(f"[Stream] Streaming from DavidCyrilTech API link")
                return StreamingResponse(file_sender(), headers=headers_response)
    except Exception as api_err:
        print(f"[Stream] DavidCyrilTech API failed: {api_err}. Falling back to yt-dlp.")
        
    format_selector = ":".join(parts[2:])
    format_selector = urllib.parse.unquote(format_selector)

    video_url = f"https://www.youtube.com/watch?v={video_id}"

    progress_key = filename

    yt_progress[progress_key] = {"progress": 1, "downloaded_bytes": 0, "total_bytes": 0}

    # Create temp downloads folder inside workspace Cwd
    temp_dir = os.path.join(os.getcwd(), "temp_downloads")
    os.makedirs(temp_dir, exist_ok=True)
    unique_id = str(uuid.uuid4())
    # Use %(id)s instead of %(title)s — video titles may contain Unicode characters
    # (e.g. full-width ｜) that crash os.stat() on Windows when the filesystem
    # encoding is cp1252.  The UUID prefix guarantees uniqueness; the video ID
    # makes the temp name recognisable while staying 100% ASCII-safe.
    outtmpl = os.path.join(temp_dir, f"{unique_id}_%(id)s.%(ext)s")

    proc = None

    try:
        ffmpeg_exe = shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()
        is_audio_only = filename.lower().endswith((".m4a", ".mp3", ".webm", ".wav"))
        ext = "m4a" if is_audio_only else "mp4"

        # Do NOT pass cookies — ios/android clients use hardcoded device auth.
        # Expired/rotated cookies actively cause "Sign in to confirm not a bot" errors.
        cookie_args = []

        # Detect live format: live streams use best[height<=X]/best (HLS), not bestvideo+bestaudio
        is_live_format = format_selector.startswith("best[height") and "+bestaudio" not in format_selector

        # Check if we are running in the production cloud container (e.g. Render, Railway)
        is_cloud = "RENDER" in os.environ or "RAILWAY_STATIC_URL" in os.environ or os.path.exists("/.dockerenv")

        # Spawn yt-dlp as a subprocess with parallel fragments enabled
        # --newline forces yt-dlp to emit \n after every progress line (default is \r)
        # Without this, readline() blocks forever because it waits for \n
        # Pass -u to Python to unbuffer stdout/stderr of yt-dlp for real-time progress parsing
        yt_args = [
            sys.executable, "-u", "-m", "yt_dlp",
            "-f", format_selector,
            "--ffmpeg-location", ffmpeg_exe,
            "--no-check-certificate",           # Skip SSL verify to avoid TLS errors
            "--newline",                        # Forces newlines in progress output for parsing
            "--no-colors",                      # Cleaner output for parsing
            "--retries", "5",                   # Retry failed requests up to 5 times
            "--fragment-retries", "5",          # Retry individual fragments up to 5 times
            "--sleep-requests", "1",            # 1-second pause between requests to avoid 429
            "--js-runtimes", "deno",            # Try Deno (faster, system-wide) first
            "--js-runtimes", "node",            # fallback to Node
        ]

        yt_args.extend([
            "--extractor-args", "youtube:player_client=ios,web"
        ])

        if is_cloud:
            # On Render/Railway/Docker (datacenter IPs), we must prioritize the ios client to bypass bot checks.
            # EJS challenge scripts are pre-baked in the Docker image cache directory.
            cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".cache", "yt-dlp"))
            yt_args.extend([
                "--cache-dir", cache_dir,
                "--remote-components", "ejs:github",
            ])

        yt_args += cookie_args + [
            "-o", outtmpl,
            video_url
        ]

        # Parallel fragments only work for DASH (regular videos), not HLS live streams
        if not is_live_format:
            yt_args[5:5] = ["--concurrent-fragments", "4"]

        print(f"[Stream] Spawning yt-dlp: {' '.join(yt_args)}")

        proc = await asyncio.create_subprocess_exec(
            *yt_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        # Register so Cancel button can kill it
        active_procs[filename] = proc
        # Start at 2% so user sees something immediately
        yt_progress[progress_key] = {"progress": 2, "downloaded_bytes": 0, "total_bytes": 0}

        video_total = 0
        video_downloaded = 0
        audio_total = 0
        audio_downloaded = 0
        current_dest = 0  # 0 = video / first stream, 1 = audio / second stream
        is_dual_stream = "+" in format_selector
        # Buffer for partial lines (handles \r-terminated lines with no \n)
        line_buf = ""

        # Read output in small chunks so we don't block on readline()
        # yt-dlp progress lines end with \r (overwrite) even with --newline
        # Reading raw chunks + splitting on both \r and \n handles all cases
        while True:
            if await request.is_disconnected():
                print("[Stream] Client disconnected during download — killing yt-dlp")
                try:
                    proc.kill()
                except Exception:
                    pass
                # Cleanup temp files starting with unique_id
                for f in os.listdir(temp_dir):
                    if f.startswith(unique_id):
                        try:
                            os.remove(os.path.join(temp_dir, f))
                        except Exception:
                            pass
                yt_progress.pop(progress_key, None)
                from fastapi import Response
                return Response("Cancelled", status_code=499)

            try:
                raw = await asyncio.wait_for(proc.stdout.read(4096), timeout=0.5)
            except asyncio.TimeoutError:
                # No data yet — check if process finished
                if proc.returncode is not None:
                    break
                continue

            if not raw:
                break

            # Decode and add to buffer, then split on \r or \n
            line_buf += raw.decode("utf-8", errors="replace")
            # Split on both CR and LF
            parts = re.split(r'[\r\n]+', line_buf)
            # Last element may be incomplete — keep in buffer
            line_buf = parts[-1]
            lines = parts[:-1]

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # Safe-print: strip any char the console can't render
                try:
                    print(f"[yt-dlp] {line}")
                except UnicodeEncodeError:
                    print(f"[yt-dlp] {line.encode('ascii', errors='replace').decode('ascii')}")

                if "[download] Destination:" in line:
                    if current_dest == 0 and (video_total > 0 or video_downloaded > 0):
                        current_dest = 1

                # Match: [download]  12.3% of  ~3.48GiB  or  [download] 100% of 512.00MiB
                m = re.search(
                    r'\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+(?:~\s*)?(\d+(?:\.\d+)?)\s*([kKmMgGtT]?i?[Bb])',
                    line
                )
                if m:
                    pct = float(m.group(1))
                    size_val = float(m.group(2))
                    size_unit = m.group(3).lower()

                    mult = 1
                    if 'k' in size_unit:
                        mult = 1024
                    elif 'm' in size_unit:
                        mult = 1024 * 1024
                    elif 'g' in size_unit:
                        mult = 1024 * 1024 * 1024
                    elif 't' in size_unit:
                        mult = 1024 * 1024 * 1024 * 1024

                    total_bytes = int(size_val * mult)
                    downloaded_bytes = int(total_bytes * (pct / 100.0))

                    if is_dual_stream:
                        if current_dest == 0:
                            video_total = total_bytes
                            video_downloaded = downloaded_bytes
                            # Video download: map pct 0-100 → overall 5-85
                            overall_pct = 5 + int(pct * 0.8)
                        else:
                            audio_total = total_bytes
                            audio_downloaded = downloaded_bytes
                            # Audio download: map pct 0-100 → overall 85-95
                            overall_pct = 85 + int(pct * 0.10)
                    else:
                        video_total = total_bytes
                        video_downloaded = downloaded_bytes
                        # Single stream: map pct 0-100 → overall 5-95
                        overall_pct = 5 + int(pct * 0.90)

                    yt_progress[progress_key] = {
                        "progress": min(95, overall_pct),
                        "downloaded_bytes": video_downloaded + audio_downloaded,
                        "total_bytes": video_total + audio_total,
                    }
                elif "[Merger] Merging formats" in line or "Merging formats" in line:
                    yt_progress[progress_key] = {
                        "progress": 98,
                        "downloaded_bytes": video_downloaded + audio_downloaded,
                        "total_bytes": video_total + audio_total,
                    }
                elif is_live_format:
                    # Live stream: ffmpeg outputs  size=  9216KiB time=00:01:14.96 speed=0.63x
                    m_live = re.search(
                        r'size=\s*(\d+)([KkMmGg]i?[Bb])\s+time=(\d+):(\d+):(\d+(?:\.\d+)?)',
                        line
                    )
                    if m_live:
                        size_num  = int(m_live.group(1))
                        size_unit = m_live.group(2).lower()
                        h = int(m_live.group(3))
                        mn = int(m_live.group(4))
                        s  = float(m_live.group(5))
                        total_secs = h * 3600 + mn * 60 + s

                        size_mult = 1024
                        if 'm' in size_unit:
                            size_mult = 1024 * 1024
                        elif 'g' in size_unit:
                            size_mult = 1024 * 1024 * 1024
                        live_bytes = size_num * size_mult

                        # Fake pct: 5% per minute, capped at 90 so bar keeps moving
                        live_pct = max(5, min(90, int(total_secs / 60 * 5)))
                        yt_progress[progress_key] = {
                            "progress": live_pct,
                            "downloaded_bytes": live_bytes,
                            "total_bytes": 0,   # unknown for live streams
                        }

        code = await proc.wait()
        if code != 0:
            raise HTTPException(status_code=500, detail=f"yt-dlp process exited with code {code}")

        # Locate output file starting with unique_id
        output_file = None
        for f in os.listdir(temp_dir):
            if f.startswith(unique_id):
                output_file = os.path.join(temp_dir, f)
                break

        if not output_file or not os.path.exists(output_file):
            raise HTTPException(status_code=500, detail="Downloaded output file was not found")

        stat = os.stat(output_file)
        final_size = stat.st_size

        # Pre-compute a safe ASCII representation of output_file for logging
        # so print() never triggers UnicodeEncodeError inside the generator
        _safe_output_path = output_file.encode('ascii', errors='replace').decode('ascii')

        async def file_sender():
            try:
                with open(output_file, "rb") as f:
                    while True:
                        if await request.is_disconnected():
                            print("[Stream] Client disconnected during file transfer")
                            break
                        chunk = f.read(65536)
                        if not chunk:
                            break
                        yield chunk
            finally:
                # Clean up local temporary file
                if os.path.exists(output_file):
                    try:
                        os.remove(output_file)
                        print(f"[Stream] Cleaned up temporary file: {_safe_output_path}")
                    except Exception as e:
                        print(f"[Stream] Error deleting temporary file {_safe_output_path}: {e}")
                # Ensure progress is set to 100
                yt_progress[progress_key] = {
                    "progress": 100,
                    "downloaded_bytes": video_downloaded + audio_downloaded,
                    "total_bytes": video_total + audio_total,
                }

        media_type = "audio/mp4" if is_audio_only else "video/mp4"
        safe_filename = filename.encode("ascii", errors="replace").decode("ascii")

        # Clean up progress and active_procs after some time
        async def _cleanup_progress():
            await asyncio.sleep(60)  # Give frontend 60s to poll the final 100% value
            yt_progress.pop(progress_key, None)
            active_procs.pop(filename, None)  # Remove from active tracker

        background_tasks.add_task(_cleanup_progress)

        return StreamingResponse(
            file_sender(),
            media_type=media_type,
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{safe_filename}"; '
                    f"filename*=UTF-8''{urllib.parse.quote(filename)}"
                ),
                "Content-Length": str(final_size),
                "Cache-Control": "no-cache, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except Exception as ex:
        # Cleanup any temporary files starting with unique_id on error
        for f in os.listdir(temp_dir):
            if f.startswith(unique_id):
                try:
                    os.remove(os.path.join(temp_dir, f))
                except Exception:
                    pass
        yt_progress.pop(progress_key, None)
        active_procs.pop(filename, None)  # Remove from active tracker on error
        if isinstance(ex, HTTPException):
            raise ex
        raise HTTPException(status_code=500, detail=str(ex))


@app.get("/youtube/test_bypass")
async def youtube_test_bypass():
    video_url = "https://www.youtube.com/watch?v=2xWkATdMQms"
    clients_to_test = [
        {"name": "ios", "client": ["ios"]},
        {"name": "ios,web", "client": ["ios", "web"]},
        {"name": "default, -android_sdkless", "client": ["default", "-android_sdkless"]},
        {"name": "web_safari", "client": ["web_safari"]},
        {"name": "web_creator", "client": ["web_creator"]},
        {"name": "tv", "client": ["tv"]},
        {"name": "android", "client": ["android"]},
        {"name": "web", "client": ["web"]},
        {"name": "default (no overrides)", "client": None}
    ]
    
    results = {}
    cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".cache", "yt-dlp"))
    
    for c in clients_to_test:
        name = c["name"]
        client_list = c["client"]
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'socket_timeout': 8,
            'js_runtimes': {
                'deno': {'path': None},
                'node': {'path': None}
            },
            'remote_components': ['ejs:github'],
            'cache_dir': cache_dir,
            'nocheckcertificate': True,
        }
        if client_list is not None:
            ydl_opts['extractor_args'] = {
                'youtube': {
                    'player_client': client_list
                }
            }
            
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
            results[name] = {"success": True, "title": info.get("title", "Unknown")}
        except Exception as err:
            err_str = str(err)
            if len(err_str) > 200:
                err_str = err_str[:200] + "..."
            results[name] = {"success": False, "error": err_str}
            
    return results


# --- MediaFire Downloader Endpoints ---

@app.post("/mediafire/info")
async def mediafire_info(data: dict):
    url = data.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL")
    
    import urllib.request
    import urllib.parse
    import ssl
    import re
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            content_disp = response.info().get('Content-Disposition', '')
            if content_disp:
                filename = "download"
                m = re.search(r'filename="([^"]+)"', content_disp)
                if m:
                    filename = m.group(1)
                else:
                    parsed = urllib.parse.urlparse(url)
                    filename = os.path.basename(parsed.path) or "download"
                direct_link = url
                size = int(response.info().get('Content-Length', 0))
                mime_type = response.info().get('Content-Type', 'application/octet-stream')
            else:
                html = response.read().decode('utf-8', errors='ignore')
                match = re.search(r'href="((?:https?:)?//download[^"]+)"', html)
                if not match:
                    match = re.search(r'href="((?:https?:)?//[^"]*mediafire\.com/download/[^"]+)"', html)
                
                if not match:
                    raise Exception("Could not find direct download link on the MediaFire page.")
                
                direct_link = match.group(1)
                if direct_link.startswith('//'):
                    direct_link = 'https:' + direct_link
                
                head_req = urllib.request.Request(direct_link, headers=headers, method='HEAD')
                try:
                    with urllib.request.urlopen(head_req, context=ctx, timeout=10) as head_res:
                        head_info = head_res.info()
                        content_disp = head_info.get('Content-Disposition', '')
                        filename = "download"
                        m = re.search(r'filename="([^"]+)"', content_disp)
                        if m:
                            filename = m.group(1)
                        else:
                            parsed_dl = urllib.parse.urlparse(direct_link)
                            filename = os.path.basename(parsed_dl.path) or "download"
                        size = int(head_info.get('Content-Length', 0))
                        mime_type = head_info.get('Content-Type', 'application/octet-stream')
                except Exception:
                    parsed_dl = urllib.parse.urlparse(direct_link)
                    filename = os.path.basename(parsed_dl.path) or "download"
                    size = 0
                    mime_type = "application/octet-stream"
        
        ext = os.path.splitext(filename.lower())[1]
        media_type = "link"
        if ext in (".mp3", ".wav", ".m4a", ".ogg", ".flac"):
            media_type = "audio"
        elif ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
            media_type = "image"
        elif ext in (".mp4", ".mkv", ".avi", ".mov", ".webm"):
            media_type = "video"
            
        return {
            "platform": "mediafire",
            "mode": "file",
            "title": filename,
            "media": [
                {
                    "url": direct_link,
                    "filename": filename,
                    "quality": "Direct Download",
                    "type": media_type
                }
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/mediafire/download")
async def mediafire_download(
    request: Request,
    file: str,
    filename: str,
    background_tasks: BackgroundTasks
):
    import urllib.request
    import ssl
    import urllib.parse
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    file_url = urllib.parse.unquote(file)
    if not file_url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")
        
    req = urllib.request.Request(file_url, headers=headers)
    try:
        head_req = urllib.request.Request(file_url, headers=headers, method='HEAD')
        content_length = None
        try:
            with urllib.request.urlopen(head_req, context=ctx, timeout=5) as head_res:
                content_length = head_res.info().get('Content-Length')
        except Exception:
            pass
            
        async def file_sender():
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                    while True:
                        if await request.is_disconnected():
                            break
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        yield chunk
            except Exception as e:
                print(f"[MediaFire] Error during download stream: {e}")
                
        safe_name = filename.encode("ascii", errors="replace").decode("ascii")
        headers_response = {
            "Content-Disposition": f"attachment; filename=\"{safe_name}\"",
            "Content-Type": "application/octet-stream"
        }
        if content_length:
            headers_response["Content-Length"] = str(content_length)
            
        return StreamingResponse(file_sender(), headers=headers_response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream MediaFire file: {str(e)}")


# --- Spotify Downloader Endpoints ---

def _embed_cover_art_into_mp3(mp3_path: str, cover_url: str, title: str = "", artists: str = "", album: str = ""):
    """Download the cover image and embed it as an ID3 APIC frame into the MP3 file."""
    if not mutagen_available:
        print("[Spotify] mutagen not available, skipping cover art embedding.")
        return
    try:
        import urllib.request, ssl, io
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(cover_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            image_data = resp.read()
            content_type = resp.info().get_content_type() or "image/jpeg"

        try:
            audio = ID3(mp3_path)
        except ID3Error:
            audio = ID3()

        audio.add(APIC(
            encoding=3,          # UTF-8
            mime=content_type,
            type=3,              # Cover (front)
            desc="Cover",
            data=image_data
        ))
        if title:
            audio.add(TIT2(encoding=3, text=title))
        if artists:
            audio.add(TPE1(encoding=3, text=artists))
        if album:
            audio.add(TALB(encoding=3, text=album))
        audio.save(mp3_path)
        print(f"[Spotify] Embedded cover art ({len(image_data)} bytes) into {mp3_path}")
    except Exception as e:
        print(f"[Spotify] Failed to embed cover art: {e}")


def _spotify_fetch_embed(path_or_url: str, retries: int = 2):
    """Fetch Spotify embed page HTML, returning (html, error_msg)."""
    import urllib.request, time
    # Keep headers minimal — no Accept-Encoding so we always get plain text back
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    url = path_or_url if path_or_url.startswith("http") else f"https://open.spotify.com/embed{path_or_url}"
    if "?" not in url:
        url += "?utm_source=oembed"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read().decode("utf-8", errors="ignore"), None
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
            else:
                return None, str(e)
    return None, "Unknown error"


def _parse_spotify_embed_json(html: str):
    """Extract the __NEXT_DATA__ JSON from a Spotify embed HTML page."""
    import json
    m = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)</script>', html)
    if not m:
        return None, "Could not find __NEXT_DATA__ script in embed page"
    try:
        return json.loads(m.group(1)), None
    except Exception as e:
        return None, f"JSON parse error: {e}"


def _extract_cover_url(images):
    """Return highest-resolution cover URL from a Spotify images list."""
    if not images:
        return None
    sorted_imgs = sorted(images, key=lambda x: x.get("maxWidth", x.get("width", 0)), reverse=True)
    return sorted_imgs[0].get("url")


def _extract_artists_str(artists_data) -> str:
    """Extract a comma-joined artist string from Spotify embed data.

    Handles both:
    - Old Web API format:  [{"name": "Artist"}]
    - New embed format:    {"items": [{"profile": {"name": "Artist"}}]}
    """
    if not artists_data:
        return ""
    items = artists_data.get("items", artists_data) if isinstance(artists_data, dict) else artists_data
    if not isinstance(items, list):
        return ""
    names = []
    for a in items:
        name = (a.get("profile") or {}).get("name") or a.get("name") or ""
        if name:
            names.append(name)
    return ", ".join(names)


def _extract_track_cover(track_data: dict, fallback: str | None) -> str | None:
    """Extract cover art URL from a Spotify embed track entry.

    Handles both:
    - New embed format:  albumOfTrack.coverArt.sources[{url,width}]
    - Old Web API format: album.images[{url,width}]
    """
    # New format
    sources = track_data.get("albumOfTrack", {}).get("coverArt", {}).get("sources", [])
    if sources:
        best = max(sources, key=lambda s: s.get("width", 0))
        url = best.get("url")
        if url:
            return url
    # Old format
    images = track_data.get("album", {}).get("images", [])
    return _extract_cover_url(images) or fallback


def _extract_track_album_name(track_data: dict, fallback: str) -> str:
    """Extract album name from a Spotify embed track entry."""
    return (
        track_data.get("albumOfTrack", {}).get("name")
        or track_data.get("album", {}).get("name")
        or fallback
    )

def _spotify_get_token() -> str | None:
    """Fetch an anonymous Spotify access token from the web player endpoint."""
    import urllib.request, ssl, json as _json
    EMBED_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    for url in [
        "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
        "https://open.spotify.com/get_access_token?reason=transport&productType=web-player",
    ]:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": EMBED_UA,
                "Accept": "application/json",
                "Referer": "https://open.spotify.com/",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                d = _json.loads(resp.read().decode())
                tok = d.get("accessToken") or d.get("access_token")
                if tok:
                    return tok
        except Exception as e:
            print(f"[Spotify] token fetch {url}: {e}")
    return None


def _spotify_api_track(track_id: str, token: str) -> dict | None:
    """Fetch track metadata via Spotify Web API using an anonymous token."""
    import urllib.request, ssl, json as _json
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(
            f"https://api.spotify.com/v1/tracks/{track_id}?market=US",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"}
        )
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            return _json.loads(resp.read().decode())
    except Exception as e:
        print(f"[Spotify] API track fetch: {e}")
        return None


@app.post("/spotify/info")
async def spotify_info(data: dict):
    url = data.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL")

    match = re.search(r'(?:spotify:track:|https?://open\.spotify\.com/(?:[a-zA-Z]{2,5}/)?track/)([a-zA-Z0-9]+)', url)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid Spotify track URL. Make sure it's a song link (contains /track/ID).")

    track_id = match.group(1)

    try:
        import urllib.request as _urlreq, json as _json
        _EMBED_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

        title = ""
        artists = ""
        cover_url = ""
        preview_url = None

        # Strategy 0: oEmbed — fastest, always works, gives title + thumbnail
        try:
            oembed_req = _urlreq.Request(
                f"https://open.spotify.com/oembed?url=https://open.spotify.com/track/{track_id}",
                headers={"User-Agent": _EMBED_UA, "Accept": "application/json"}
            )
            with _urlreq.urlopen(oembed_req, timeout=10) as r:
                oe = _json.loads(r.read().decode())
                title = oe.get("title", "")
                cover_url = oe.get("thumbnail_url", "")
        except Exception as e:
            print(f"[Spotify] oEmbed: {e}")

        # Strategy 1: Embed page → parse __NEXT_DATA__ for artists (+ fill any missing title/cover)
        html, err = _spotify_fetch_embed(f"/track/{track_id}")
        if html:
            embed_data, _ = _parse_spotify_embed_json(html)
            if embed_data:
                entity = embed_data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {})
                if entity:
                    if not title:
                        title = entity.get("name") or entity.get("title") or ""
                    artists_list = entity.get("artists", [])
                    artists = ", ".join(a.get("name") for a in artists_list if a.get("name"))
                    if not cover_url:
                        images = entity.get("visualIdentity", {}).get("image", [])
                        cover_url = _extract_cover_url(images) or ""
                    preview_url = entity.get("audioPreview", {}).get("url")
        else:
            print(f"[Spotify] Embed page failed: {err}")

        if not title:
            raise HTTPException(status_code=502, detail="Could not fetch track metadata from Spotify. The track may be unavailable.")

        # Strategy 3: YouTube search → yt-dlp download
        search_query = f"{artists} - {title}" if artists else title
        yt_id = None
        try:
            ydl_opts = {'quiet': True, 'no_warnings': True, 'extract_flat': True, 'playlist_items': '1'}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                search_res = ydl.extract_info(f"ytsearch1:{search_query}", download=False)
                if search_res and 'entries' in search_res and search_res['entries']:
                    yt_id = search_res['entries'][0].get("id")
        except Exception as search_err:
            print(f"[Spotify] YouTube search error: {search_err}")

        if not yt_id:
            raise HTTPException(status_code=404, detail="Could not find a matching YouTube track to download.")

        cover_param = urllib.parse.quote(cover_url, safe='') if cover_url else ""
        file_url = f"ytdlp:{yt_id}:bestaudio:{cover_param}"

        media_list = [{
            "url": file_url,
            "filename": f"{safe_filename(artists)} - {safe_filename(title)}.mp3",
            "quality": "Download MP3",
            "type": "audio"
        }]
        if preview_url:
            media_list.append({
                "url": preview_url,
                "filename": f"{safe_filename(artists)} - {safe_filename(title)} (Preview).mp3",
                "quality": "30s Track Preview",
                "type": "audio"
            })

        return {
            "platform": "spotify",
            "mode": "track",
            "title": title,
            "username": artists,
            "authorName": artists,
            "cover": cover_url,
            "media": media_list
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Spotify track metadata: {str(e)}")


async def _spotify_yt_search(query: str) -> str | None:
    """Async YouTube search for a query string, returns video ID or None."""
    try:
        ydl_opts = {'quiet': True, 'no_warnings': True, 'extract_flat': True, 'playlist_items': '1'}
        loop = asyncio.get_event_loop()
        def _search():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                res = ydl.extract_info(f"ytsearch1:{query}", download=False)
                if res and 'entries' in res and res['entries']:
                    return res['entries'][0].get('id')
            return None
        return await loop.run_in_executor(None, _search)
    except Exception as e:
        print(f"[Spotify] YT search failed for '{query}': {e}")
        return None


@app.post("/spotify/collection-info")
async def spotify_collection_info(data: dict):
    """Resolve a Spotify playlist, album, single, or track URL and return all tracks."""
    import json
    url = data.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL")

    # Detect collection type
    playlist_m = re.search(r'open\.spotify\.com/(?:[a-z]{2,5}/)?playlist/([A-Za-z0-9]+)', url)
    album_m    = re.search(r'open\.spotify\.com/(?:[a-z]{2,5}/)?album/([A-Za-z0-9]+)', url)
    track_m    = re.search(r'open\.spotify\.com/(?:[a-z]{2,5}/)?track/([A-Za-z0-9]+)', url)

    if not (playlist_m or album_m or track_m):
        raise HTTPException(status_code=400, detail="URL must be a Spotify track, album, or playlist link.")

    collection_type = "track"
    collection_id = ""
    if playlist_m:
        collection_type = "playlist"
        collection_id = playlist_m.group(1)
    elif album_m:
        collection_type = "album"
        collection_id = album_m.group(1)
    else:
        collection_type = "track"
        collection_id = track_m.group(1)

    print(f"[Spotify] Fetching {collection_type} {collection_id}")

    # Fetch embed page
    embed_path = f"/{collection_type}/{collection_id}"
    html, err = _spotify_fetch_embed(embed_path)
    if err or not html:
        raise HTTPException(status_code=502, detail=f"Could not reach Spotify embed: {err}")

    embed_data, parse_err = _parse_spotify_embed_json(html)
    if parse_err or not embed_data:
        raise HTTPException(status_code=502, detail=f"Could not parse Spotify embed JSON: {parse_err}")

    pageProps = embed_data.get("props", {}).get("pageProps", {})
    if pageProps.get("status") == 404:
        raise HTTPException(status_code=404, detail=f"Spotify {collection_type} not found")

    state = pageProps.get("state", {})
    entity = state.get("data", {}).get("entity", {})

    # ---------- Parse tracks from embed entity ----------
    tracks_raw = []
    collection_title = entity.get("name") or entity.get("title") or collection_type.title()
    collection_cover = _extract_cover_url(
        entity.get("visualIdentity", {}).get("image", []) or
        entity.get("images", [])
    )
    collection_author = ""

    if collection_type == "track":
        artists = _extract_artists_str(entity.get("artists"))
        tracks_raw = [{
            "title": entity.get("name") or entity.get("title") or "Track",
            "artists": artists,
            "cover_url": collection_cover,
            "album": collection_title,
            "preview_url": entity.get("audioPreview", {}).get("url"),
        }]
        collection_author = artists

    elif collection_type == "album":
        collection_author = _extract_artists_str(entity.get("artists"))
        # Album tracks may be at entity.tracks.items (new) or entity.trackList (alt)
        album_tracks = entity.get("tracks", {}).get("items", []) or entity.get("trackList", [])
        for item in album_tracks:
            t = item.get("track", item)
            t_artists = _extract_artists_str(t.get("artists")) or collection_author
            tracks_raw.append({
                "title": t.get("name") or t.get("title") or "Track",
                "artists": t_artists,
                "cover_url": _extract_track_cover(t, collection_cover),
                "album": _extract_track_album_name(t, collection_title),
                "preview_url": (t.get("audioPreview") or {}).get("url"),
            })

    elif collection_type == "playlist":
        # Playlist entity uses "authors" list (not "owner")
        authors_list = entity.get("authors") or []
        if isinstance(authors_list, list) and authors_list:
            collection_author = ", ".join(
                a.get("name") or a.get("displayName") or ""
                for a in authors_list if isinstance(a, dict)
            )
        else:
            collection_author = ""

        for item in entity.get("trackList", []):
            # In the new Spotify embed format, each item IS the track —
            # keys: uri, uid, title, subtitle, audioPreview, isPlayable, ...
            # "title" = song name, "subtitle" = artist(s) as a pre-formatted string
            t = item.get("track", item)  # handle both wrapped and flat
            if not t or not isinstance(t, dict):
                continue
            t_name = t.get("title") or t.get("name") or ""
            if not t_name:
                continue
            # subtitle is a plain string like "Chris Brown,\u00a0Tyga" (Spotify uses non-breaking spaces)
            raw_subtitle = t.get("subtitle") or ""
            t_artists = raw_subtitle.replace("\u00a0", " ").replace("\xa0", " ").strip()
            if not t_artists:
                t_artists = _extract_artists_str(t.get("artists"))
            t_cover = _extract_track_cover(t, collection_cover) or collection_cover
            t_album = _extract_track_album_name(t, collection_title)
            t_preview = (t.get("audioPreview") or {}).get("url")
            tracks_raw.append({
                "title": t_name,
                "artists": t_artists,
                "cover_url": t_cover,
                "album": t_album,
                "preview_url": t_preview,
            })
            print(f"[Spotify] Playlist track: '{t_name}' by '{t_artists}'")

    if not tracks_raw:
        raise HTTPException(status_code=404, detail=f"No tracks found in this Spotify {collection_type}.")

    # ---------- YouTube search for each track (async, concurrent) ----------
    MAX_CONCURRENT = 5
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def search_one(track):
        async with semaphore:
            q = f"{track['artists']} - {track['title']}"
            yt_id = await _spotify_yt_search(q)
            return {**track, "yt_id": yt_id}

    searched = await asyncio.gather(*[search_one(t) for t in tracks_raw])

    # ---------- Build one MediaItem per track ----------
    items_list = []
    for idx, t in enumerate(searched):
        yt_id = t.get("yt_id")
        if not yt_id:
            continue
        cover_param = urllib.parse.quote(t["cover_url"], safe='') if t.get("cover_url") else ""
        track_title   = t.get("title", "Track")
        track_artists = t.get("artists", "")
        track_album   = t.get("album", collection_title)
        safe_name     = f"{safe_filename(track_artists)} - {safe_filename(track_title)}"

        downloads = [
            {
                "label": "Download MP3",
                "url": f"ytdlp:{yt_id}:bestaudio:{cover_param}",
                "filename": f"{safe_name}.mp3",
                "functionName": "spotify-download",
                "quality": "Download MP3",
                "mimeType": "audio",
                # pass metadata so the download endpoint can embed tags
                "tag_title":  track_title,
                "tag_artist": track_artists,
                "tag_album":  track_album,
                "cover_url":  t.get("cover_url", ""),
            }
        ]
        if t.get("preview_url"):
            downloads.append({
                "label": "30s Preview",
                "url": t["preview_url"],
                "filename": f"{safe_name} (Preview).mp3",
                "functionName": "spotify-download",
                "quality": "30s Preview",
                "mimeType": "audio",
            })

        items_list.append({
            "id": f"track-{idx}",
            "type": "audio",
            "title": track_title,
            "description": track_artists,
            "thumbnail": t.get("cover_url") or collection_cover,
            "downloads": downloads,
        })

    return {
        "platform": "spotify",
        "mode": collection_type,
        "title": collection_title,
        "username": collection_author,
        "authorName": collection_author,
        "cover": collection_cover,
        "trackCount": len(tracks_raw),
        "resolvedCount": len(items_list),
        "items": items_list,
    }

@app.get("/spotify/progress")
async def get_spotify_progress(filename: str):
    entry = yt_progress.get(filename)
    if isinstance(entry, dict):
        return {
            "progress": entry.get('progress', 0),
            "downloaded_bytes": entry.get('downloaded_bytes', 0),
            "total_bytes": entry.get('total_bytes', 0),
        }
    return {"progress": entry or 0, "downloaded_bytes": 0, "total_bytes": 0}

@app.post("/spotify/cancel")
async def cancel_spotify_download(data: dict):
    filename = data.get("filename", "")
    killed = []
    if filename and filename in active_procs:
        proc = active_procs.pop(filename, None)
        if proc:
            try:
                proc.kill()
                killed.append(filename)
            except Exception:
                pass
    return {"cancelled": len(killed) > 0, "killed": killed}

@app.get("/spotify/download")
async def spotify_download(
    request: Request,
    file: str,
    filename: str,
    background_tasks: BackgroundTasks
):
    import urllib.parse
    
    file_decoded = urllib.parse.unquote(file)
    
    if file_decoded.startswith("http"):
        import urllib.request
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        req = urllib.request.Request(file_decoded, headers=headers)
        try:
            head_req = urllib.request.Request(file_decoded, headers=headers, method='HEAD')
            content_length = None
            try:
                with urllib.request.urlopen(head_req, context=ctx, timeout=5) as head_res:
                    content_length = head_res.info().get('Content-Length')
            except Exception:
                pass
                
            async def file_sender():
                with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
                    while True:
                        if await request.is_disconnected():
                            break
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        yield chunk
            safe_filename = filename.encode("ascii", errors="replace").decode("ascii")
            headers_response = {
                "Content-Disposition": f"attachment; filename=\"{safe_filename}\"",
                "Content-Type": "audio/mpeg"
            }
            if content_length:
                headers_response["Content-Length"] = str(content_length)
            return StreamingResponse(file_sender(), headers=headers_response)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    if not file_decoded.startswith("ytdlp:"):
        print("[Spotify] ERROR: Invalid Spotify download file source:", file_decoded)
        raise HTTPException(status_code=400, detail="Invalid Spotify download file source")
        
    parts = file_decoded.split(":")
    if len(parts) < 2:
        print("[Spotify] ERROR: Invalid ytdlp URI format:", file_decoded)
        raise HTTPException(status_code=400, detail="Invalid ytdlp URI format")
        
    video_id = parts[1]
    # Cover URL is the 4th+ segment joined back with ":" because the decoded HTTPS
    # URL contains its own colons: ytdlp:{id}:bestaudio:https://...
    embedded_cover_url = ":".join(parts[3:]) if len(parts) >= 4 else None
    # Track title/artist from query params for ID3 tagging
    req_params = dict(request.query_params)
    tag_title   = req_params.get("title", "")
    tag_artist  = req_params.get("artist", "")
    tag_album   = req_params.get("album", "")
    
    # ── 1. DavidCyrilTech API  (primary fast path — no bot-check, high-speed CDN) ──────────────
    try:
        import json
        import ssl
        import urllib.request
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        yt_url = f"https://www.youtube.com/watch?v={video_id}"
        api_url = f"https://apis.davidcyriltech.my.id/download/ytmp3?url={urllib.parse.quote(yt_url)}"
        print(f"[Spotify] Trying DavidCyrilTech API: {api_url}")
        
        api_req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(api_req, context=ctx, timeout=15) as api_res:
            api_res_data = json.loads(api_res.read().decode('utf-8'))
            
        if api_res_data.get("success"):
            res_obj = api_res_data.get("result", {})
            download_url = (
                res_obj.get("download_url") or
                res_obj.get("downloadUrl") or
                res_obj.get("url") or
                api_res_data.get("url") or
                api_res_data.get("link")
            )
            if download_url:
                print(f"[Spotify] Resolved download link from DavidCyrilTech API: {download_url}")
                dl_headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }

                # Initialise progress so the frontend immediately sees activity
                yt_progress[filename] = {"progress": 5, "downloaded_bytes": 0, "total_bytes": 0}

                # Download to a temp file so we can embed cover art before streaming
                temp_dir = os.path.join(os.getcwd(), "temp_downloads")
                os.makedirs(temp_dir, exist_ok=True)
                dc_temp_path = os.path.join(temp_dir, f"dc_{uuid.uuid4().hex}.mp3")

                dl_req = urllib.request.Request(download_url, headers=dl_headers)
                print(f"[Spotify] Downloading DavidCyrilTech audio to temp file for cover-art embedding...")
                downloaded_bytes = 0
                total_bytes = 0
                with urllib.request.urlopen(dl_req, context=ctx, timeout=60) as dl_resp:
                    cl = dl_resp.info().get("Content-Length")
                    total_bytes = int(cl) if cl else 0
                    yt_progress[filename] = {"progress": 10, "downloaded_bytes": 0, "total_bytes": total_bytes}
                    with open(dc_temp_path, "wb") as tmp_f:
                        while True:
                            chunk = dl_resp.read(65536)
                            if not chunk:
                                break
                            tmp_f.write(chunk)
                            downloaded_bytes += len(chunk)
                            if total_bytes > 0:
                                pct = int(10 + (downloaded_bytes / total_bytes) * 80)
                            else:
                                pct = min(85, yt_progress[filename].get("progress", 10) + 2)
                            yt_progress[filename] = {"progress": pct, "downloaded_bytes": downloaded_bytes, "total_bytes": total_bytes}

                yt_progress[filename] = {"progress": 92, "downloaded_bytes": downloaded_bytes, "total_bytes": total_bytes}

                # Embed cover art + ID3 tags
                if embedded_cover_url:
                    _embed_cover_art_into_mp3(dc_temp_path, embedded_cover_url, title=tag_title, artists=tag_artist, album=tag_album)

                yt_progress[filename] = {"progress": 99, "downloaded_bytes": downloaded_bytes, "total_bytes": total_bytes}

                dc_size = os.path.getsize(dc_temp_path)
                safe_fn = filename.encode("ascii", errors="replace").decode("ascii")

                async def dc_file_sender():
                    try:
                        with open(dc_temp_path, "rb") as f:
                            while True:
                                if await request.is_disconnected():
                                    break
                                chunk = f.read(65536)
                                if not chunk:
                                    break
                                yield chunk
                    finally:
                        try:
                            os.remove(dc_temp_path)
                        except Exception:
                            pass

                print(f"[Spotify] Streaming {dc_size} bytes from DavidCyrilTech (with cover art)")
                return StreamingResponse(dc_file_sender(), media_type="audio/mpeg", headers={
                    "Content-Disposition": f'attachment; filename="{safe_fn}"',
                    "Content-Length": str(dc_size),
                })
    except Exception as api_err:
        print(f"[Spotify] DavidCyrilTech API failed: {api_err}. Falling back to yt-dlp.")


    format_selector = "bestaudio/best"
    
    progress_key = filename
    yt_progress[progress_key] = {"progress": 1, "downloaded_bytes": 0, "total_bytes": 0}
    
    temp_dir = os.path.join(os.getcwd(), "temp_downloads")
    os.makedirs(temp_dir, exist_ok=True)
    unique_id = str(uuid.uuid4())
    outtmpl = os.path.join(temp_dir, f"{unique_id}_%(id)s.%(ext)s")
    
    ffmpeg_exe = shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()
    
    is_cloud = "RENDER" in os.environ or "RAILWAY_STATIC_URL" in os.environ or os.path.exists("/.dockerenv")
    
    yt_args = [
        sys.executable, "-u", "-m", "yt_dlp",
        "-f", format_selector,
        "--ffmpeg-location", ffmpeg_exe,
        "-x", "--audio-format", "mp3",
        "--audio-quality", "0",
        "--no-check-certificate",
        "--newline",
        "--no-colors",
        "--retries", "5",
        "--fragment-retries", "5",
        "--sleep-requests", "1",
        "--js-runtimes", "deno",
        "--js-runtimes", "node",
        "--extractor-args", "youtube:player_client=ios,web",
    ]
    
    if is_cloud:
        # On Render/Railway/Docker (datacenter IPs), we must prioritize the ios client to bypass bot checks.
        # EJS challenge scripts are pre-baked in the Docker image cache directory.
        cache_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".cache", "yt-dlp"))
        yt_args.extend([
            "--cache-dir", cache_dir,
            "--remote-components", "ejs:github",
        ])
        
    yt_args.extend([
        "-o", outtmpl,
        f"https://www.youtube.com/watch?v={video_id}"
    ])
    
    print(f"[Spotify] Download request received for video_id={video_id}, outtmpl={outtmpl}")
    print(f"[Spotify] Spawning yt-dlp: {' '.join(yt_args)}")
    
    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            *yt_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        active_procs[filename] = proc
        print("[Spotify] Subprocess spawned successfully, PID:", proc.pid)
    except Exception as e:
        print("[Spotify] Failed to start downloader process:", e)
        yt_progress[progress_key] = {"progress": 0, "error": str(e)}
        raise HTTPException(status_code=500, detail=f"Failed to start downloader process: {str(e)}")
        
    downloader_output = []
    async def parse_output():
        try:
            while True:
                line_bytes = await proc.stdout.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode('utf-8', errors='ignore').strip()
                print(f"[Spotify] [yt-dlp] {line}")
                downloader_output.append(line)
                if len(downloader_output) > 30:
                    downloader_output.pop(0)
                
                m_pct = re.search(r'\[download\]\s+(\d+\.\d+)%\s+of\s+([~]?\d+\.\d+)([KkMmGg]i?[Bb])', line)
                if m_pct:
                    pct = float(m_pct.group(1))
                    size_val = float(m_pct.group(2))
                    size_unit = m_pct.group(3).lower()
                    
                    mult = 1024
                    if 'm' in size_unit:
                        mult = 1024 * 1024
                    elif 'g' in size_unit:
                        mult = 1024 * 1024 * 1024
                    elif 't' in size_unit:
                        mult = 1024 * 1024 * 1024 * 1024
                        
                    total_bytes = int(size_val * mult)
                    downloaded_bytes = int(total_bytes * (pct / 100.0))
                    
                    overall_pct = 5 + int(pct * 0.8)
                    yt_progress[progress_key] = {
                        "progress": min(85, overall_pct),
                        "downloaded_bytes": downloaded_bytes,
                        "total_bytes": total_bytes,
                    }
                elif "Extracting audio" in line or "destination" in line:
                    yt_progress[progress_key] = {
                        "progress": 90,
                        "downloaded_bytes": 0,
                        "total_bytes": 0,
                    }
                elif "Post-process" in line or "Adding metadata" in line:
                    yt_progress[progress_key] = {
                        "progress": 95,
                        "downloaded_bytes": 0,
                        "total_bytes": 0,
                    }
        except Exception as pe:
            print(f"[Spotify] Progress parser error: {pe}")
            
    asyncio.create_task(parse_output())
    
    code = await proc.wait()
    print(f"[Spotify] Downloader exited with code: {code}")
    active_procs.pop(filename, None)
    
    if code != 0:
        error_details = "\n".join(downloader_output)
        raise HTTPException(status_code=500, detail=f"Downloader failed with exit code {code}. Log:\n{error_details}")
        
    output_file = None
    for f in os.listdir(temp_dir):
        if f.startswith(unique_id) and f.endswith(".mp3"):
            output_file = os.path.join(temp_dir, f)
            break
            
    if not output_file or not os.path.exists(output_file):
        raise HTTPException(status_code=500, detail="Audio extraction failed or file not found")

    # Embed cover art + ID3 tags into the downloaded MP3
    if embedded_cover_url:
        yt_progress[progress_key] = {"progress": 97, "downloaded_bytes": 0, "total_bytes": 0}
        _embed_cover_art_into_mp3(output_file, embedded_cover_url, title=tag_title, artists=tag_artist, album=tag_album)
        
    stat = os.stat(output_file)
    final_size = stat.st_size
    
    async def file_sender():
        try:
            with open(output_file, "rb") as f:
                while True:
                    if await request.is_disconnected():
                        print("[Spotify] Client disconnected during audio stream")
                        break
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    yield chunk
        finally:
            if os.path.exists(output_file):
                try:
                    os.remove(output_file)
                except Exception:
                    pass
            yt_progress[progress_key] = {
                "progress": 100,
                "downloaded_bytes": final_size,
                "total_bytes": final_size,
            }
            
    safe_filename = filename.encode("ascii", errors="replace").decode("ascii")
    
    async def _cleanup_progress():
        await asyncio.sleep(60)
        yt_progress.pop(progress_key, None)
        
    background_tasks.add_task(_cleanup_progress)
    
    return StreamingResponse(
        file_sender(),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f"attachment; filename=\"{safe_filename}\"",
            "Content-Length": str(final_size)
        }
    )


# --- Jamendo Free Music Search ---

@app.post("/jamendo/search")
async def jamendo_search(data: dict):
    """Search Jamendo for CC-licensed free music tracks."""
    import urllib.request, ssl, json as _json
    query = (data.get("query") or "").strip()
    limit = min(int(data.get("limit", 20)), 50)
    if not query:
        raise HTTPException(status_code=400, detail="Missing search query")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    params = urllib.parse.urlencode({
        "client_id": "b6747d04",
        "format": "json",
        "limit": limit,
        "search": query,
        "audioformat": "mp31",
        "include": "musicinfo",
        "order": "relevance",
    })
    url = f"https://api.jamendo.com/v3.0/tracks/?{params}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            result = _json.loads(resp.read().decode())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Jamendo API error: {e}")

    tracks = []
    for t in result.get("results", []):
        download_url = t.get("audiodownload") or t.get("audio") or ""
        tracks.append({
            "id": str(t.get("id", "")),
            "title": t.get("name", ""),
            "artist": t.get("artist_name", ""),
            "album": t.get("album_name", ""),
            "cover": t.get("image", ""),
            "audio": t.get("audio", ""),
            "download_url": download_url,
            "duration": int(t.get("duration", 0)),
            "license": t.get("license_ccurl", ""),
        })

    return {"tracks": tracks, "total": len(tracks)}


# --- Podcast RSS Downloader ---

@app.post("/podcast/info")
async def podcast_info(data: dict):
    """Parse a podcast RSS feed and return episode list with audio URLs."""
    import urllib.request, ssl
    from xml.etree import ElementTree as ET

    url = (data.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="Missing RSS URL")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; PodcastFetcher/1.0)",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        })
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            xml_data = resp.read()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch RSS feed: {e}")

    try:
        root = ET.fromstring(xml_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid RSS XML: {e}")

    ns = {"itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd"}
    channel = root.find("channel")
    if channel is None:
        raise HTTPException(status_code=400, detail="No channel element found in feed")

    pod_title = channel.findtext("title") or ""
    pod_desc = (channel.findtext("description") or "")[:300]

    # Cover image
    image_url = ""
    img_el = channel.find("image")
    if img_el is not None:
        image_url = img_el.findtext("url") or ""
    if not image_url:
        itunes_img = channel.find("itunes:image", ns)
        if itunes_img is not None:
            image_url = itunes_img.get("href", "")

    episodes = []
    for item in channel.findall("item")[:50]:
        ep_title = item.findtext("title") or ""
        ep_desc = (item.findtext("description") or "")[:250]
        pub_date = item.findtext("pubDate") or ""

        # Audio enclosure
        enclosure = item.find("enclosure")
        audio_url = ""
        if enclosure is not None:
            audio_url = enclosure.get("url", "")

        # Duration from itunes
        duration = ""
        dur_el = item.find("itunes:duration", ns)
        if dur_el is not None and dur_el.text:
            duration = dur_el.text.strip()

        if audio_url:
            episodes.append({
                "title": ep_title,
                "description": ep_desc,
                "date": pub_date,
                "audio_url": audio_url,
                "duration": duration,
                "filename": safe_filename(ep_title) + ".mp3",
            })

    return {
        "title": pod_title,
        "description": pod_desc,
        "image": image_url,
        "episodes": episodes,
        "episode_count": len(episodes),
    }


# Serve static files and React single-page app if build directory exists
from fastapi.staticfiles import StaticFiles

# TanStack Start / Vite builds to dist/client/ — fall back to dist/ for plain Vite builds
_base_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))
dist_dir = os.path.join(_base_dist, "client") if os.path.isdir(os.path.join(_base_dist, "client")) else _base_dist

if os.path.exists(dist_dir):
    # Mount the assets directory so browser can load JS/CSS/fonts
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Catch-all: serve individual public files (favicon, robots.txt, og-image …)
    # and fall back to index.html for all React client-side routes.
    @app.get("/{file_path:path}")
    async def serve_spa(file_path: str):
        # Never shadow API endpoints
        if file_path.startswith(("health", "remove-video-bg", "video-progress", "video-download", "youtube", "mediafire", "spotify", "jamendo", "podcast")):
            raise HTTPException(status_code=404, detail="Not found")

        # Serve exact public files if they exist (favicon.ico, robots.txt, manifest.json …)
        full_path = os.path.join(dist_dir, file_path)
        if file_path and os.path.exists(full_path) and os.path.isfile(full_path):
            return FileResponse(full_path)

        # Fallback: serve index.html so React Router handles the path client-side
        index_path = os.path.join(dist_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Static index.html not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)



