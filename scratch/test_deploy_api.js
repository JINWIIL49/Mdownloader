// Using built-in fetch of Node.js 18+

const base = 'https://sweet-sync-vault.onrender.com';
const videoUrl = 'https://www.youtube.com/watch?v=2xWkATdMQms';

async function test() {
  console.log(`[Test] Started polling ${base}/youtube/info ...`);
  let attempt = 0;
  while (true) {
    attempt++;
    const timeStr = new Date().toLocaleTimeString();
    console.log(`[${timeStr}] [Attempt #${attempt}] Querying video info ...`);
    try {
      const infoRes = await fetch(`${base}/youtube/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl, mode: 'video' })
      });

      console.log(`[Test] Info response status: ${infoRes.status}`);
      const infoData = await infoRes.json();
      if (infoRes.ok) {
        console.log(`[Test] SUCCESS! Info data:`, JSON.stringify(infoData, null, 2));
        break;
      } else {
        console.log(`[Test] Failed:`, infoData.detail || infoData);
      }
    } catch (error) {
      console.error('[Test Error]', error.message);
    }
    // Wait 15 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}

test();
