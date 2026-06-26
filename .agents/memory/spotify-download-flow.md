---
name: Spotify download working flow
description: End-to-end flow for Spotify track download that works in this Replit environment
---

## Flow (Python backend /spotify/info)
1. oEmbed (`open.spotify.com/oembed?url=...`) → title, thumbnail_url
2. Embed page (`open.spotify.com/embed/track/{id}?utm_source=oembed`) → artists, audioPreview
3. yt-dlp `ytsearch1:"{artists} - {title}"` → YouTube video ID
4. Return `ytdlp:{videoId}:bestaudio:{cover_param}` URI

## Download step (functions.v1.spotify-download.ts GET handler)
- davidcyriltech `apis.davidcyriltech.my.id/download/ytmp3?url=youtube.com/watch?v={id}` → result.download_url → stream

## Critical: _spotify_fetch_embed header fix
Must NOT include `Accept-Encoding: gzip, deflate, br` — causes brotli response Python can't decompress.
Use minimal headers: User-Agent + Accept text/html + Accept-Language only.
