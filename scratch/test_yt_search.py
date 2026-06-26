import yt_dlp
import json

def main():
    query = "Pink Floyd - Speak To Me"
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'playlist_items': '1', # just get first search result
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            print("Searching YouTube for:", query)
            info = ydl.extract_info(f"ytsearch1:{query}", download=False)
            if info and 'entries' in info and len(info['entries']) > 0:
                entry = info['entries'][0]
                print("Found matched entry:")
                print(json.dumps(entry, indent=2))
            else:
                print("No results found")
        except Exception as e:
            print("Error during yt-dlp search:", e)

if __name__ == "__main__":
    main()
