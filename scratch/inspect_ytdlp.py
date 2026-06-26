import yt_dlp
import json

# A normal YouTube video ID (e.g. dQw4w9WgXcQ - Rick Astley)
video_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
format_selector = "bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]"

ydl_opts = {
    "quiet": True,
    "no_warnings": True,
    "socket_timeout": 15,
    "format": format_selector,
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info_dict = ydl.extract_info(video_url, download=False)

print("info_dict root keys having url or formats:")
print("url in info_dict:", "url" in info_dict)
print("info_dict.get('url'):", info_dict.get('url')[:60] if info_dict.get('url') else None)
print("requested_formats in info_dict:", "requested_formats" in info_dict)

req_formats = info_dict.get('requested_formats')
if req_formats:
    print(f"Number of requested formats: {len(req_formats)}")
    for i, fmt in enumerate(req_formats):
        print(f"  Format {i}: id={fmt.get('format_id')}, vcodec={fmt.get('vcodec')}, acodec={fmt.get('acodec')}, height={fmt.get('height')}, filesize={fmt.get('filesize') or fmt.get('filesize_approx')}")
else:
    print("No requested_formats. Root format id:", info_dict.get('format_id'), "height:", info_dict.get('height'))
