---
  name: yt-dlp YouTube player clients (2025)
  description: Which YouTube player clients work without PO tokens for full quality downloads
  ---

  # yt-dlp YouTube Player Clients — What Works in 2025

  ## The Rule
  Use `android_vr` and `android_creator` as the primary YouTube player clients.
  Add `android` as a plain fallback. Always include `player_skip=webpage`.

  **Why:** YouTube now requires GVS PO Tokens for `ios` and `mweb` clients. Without
  them, those clients return zero formats → "Requested format is not available".
  `android_vr` and `android_creator` work without any PO tokens and return full
  quality up to 4K (heights: 2160, 1440, 1080, 720, 480, 360).

  **How to apply:**
  - extractor_args: `{'youtube': {'player_client': ['android_vr', 'android_creator', 'android'], 'player_skip': ['webpage']}}`
  - subprocess flag: `--extractor-args "youtube:player_client=android_vr,android_creator,android;player_skip=webpage"`
  - User-Agent: `com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip`

  ## Clients That Fail (as of June 2025)
  - `ios`: Requires GVS PO Token → formats skipped
  - `mweb`: Requires GVS PO Token → formats skipped  
  - `tv_embedded`: Not supported in current yt-dlp version
  - `web_creator`: Requires sign-in
  