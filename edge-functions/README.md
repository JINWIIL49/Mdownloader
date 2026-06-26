# Edge Functions — copy & paste guide

For each function below:

1. Open Supabase dashboard → **Edge Functions** → click the function name (or "Create function" if it doesn't exist) using the **exact** name listed.
2. Replace the entire `index.ts` with the file in this folder.
3. **Settings tab → toggle "Verify JWT" OFF** (required — browser `<a download>` clicks don't send `Authorization` headers).
4. Click **Deploy**.

Functions:

| Folder | Supabase function name | Verify JWT |
|---|---|---|
| `tiktok-download/index.ts` | `tiktok-download` | OFF |
| `linkedin-download/index.ts` | `linkedin-download` | OFF |
| `youtube-download/index.ts` | `youtube-download` | OFF |
| `spotify-download/index.ts` | `spotify-download` | OFF |

### Optional secret for YouTube

`youtube-download` uses public Invidious mirrors. If the default mirror is slow or down, set a secret:

- Key: `INVIDIOUS_BASES`
- Value: comma-separated list, e.g. `https://iv.melmac.space,https://invidious.nerdvpn.de,https://invidious.privacyredirect.com`

The first one is used to proxy media; the rest are used as API fallbacks.

No other secrets are required.
