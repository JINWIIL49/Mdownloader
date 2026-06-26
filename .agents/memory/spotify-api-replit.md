---
name: Spotify API access in Replit sandbox
description: Which Spotify endpoints work vs. are blocked in the Replit environment
---

## Rule
`https://open.spotify.com/get_access_token` → HTTP 403 (URL blocked by Replit sandbox).
`https://api.spotifydown.com/` → DNS failure (also blocked).

## What works
- `https://open.spotify.com/oembed?url=...` — returns title, thumbnail_url
- `https://open.spotify.com/embed/track/{id}?utm_source=oembed` — returns full __NEXT_DATA__ with entity (name, artists, audioPreview)
- `https://apis.davidcyriltech.my.id/download/ytmp3?url=...` — works, returns result.download_url

## Why
The Replit sandbox blocks certain Spotify auth endpoints; embed/oembed endpoints are public CDN pages and pass through.

**How to apply:** In any Spotify metadata fetch on this Replit instance, skip the token approach and go straight to oEmbed + embed page.
