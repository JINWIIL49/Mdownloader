async function testYoutube() {
  console.log('--- Testing YouTube Downloader ---');
  try {
    const res = await fetch('https://mdownloader.onginjokelvin31.workers.dev/functions/v1/youtube-download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=2xWkATdMQms' })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch (err) {
    console.error(err);
  }
}

async function testTiktok() {
  console.log('\n--- Testing TikTok Downloader ---');
  try {
    const res = await fetch('https://mdownloader.onginjokelvin31.workers.dev/functions/v1/tiktok-download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: 'https://www.tiktok.com/@khaby.lame/video/7376781293223218465' })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch (err) {
    console.error(err);
  }
}

async function run() {
  await testYoutube();
  await testTiktok();
}
run();
