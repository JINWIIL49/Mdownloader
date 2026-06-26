const base = 'https://sweet-sync-vault.onrender.com';

async function poll() {
  console.log(`[Poll] Starting to monitor ${base}/youtube/test_bypass ...`);
  let attempt = 0;
  while (true) {
    attempt++;
    const timeStr = new Date().toLocaleTimeString();
    console.log(`[${timeStr}] [Attempt #${attempt}] Fetching test_bypass ...`);
    try {
      const res = await fetch(`${base}/youtube/test_bypass`);
      console.log(`[Poll] Status: ${res.status}`);
      const text = await res.text();
      if (res.status !== 404 && !text.includes("Not found")) {
        console.log(`[Poll] SUCCESS! The endpoint is now LIVE!`);
        console.log(`Response:`, text);
        break;
      } else {
        console.log(`[Poll] Still 404/Not Found. Waiting for deploy...`);
      }
    } catch (e) {
      console.error('[Poll Error]', e.message);
    }
    // Wait 20 seconds
    await new Promise(r => setTimeout(r, 20000));
  }
}

poll();
