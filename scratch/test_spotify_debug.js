async function test() {
  const trackId = '4PTG3Z6ehGkBF3zIqYQGS3'; // Never Gonna Give You Up
  const headers = {
    'Origin': 'https://spotifydown.com',
    'Referer': 'https://spotifydown.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    console.log('Fetching track metadata...');
    const metaRes = await fetch(`https://api.spotifydown.com/metadata/track/${trackId}`, { headers });
    console.log('Metadata status:', metaRes.status);
    const metaData = await metaRes.json();
    console.log('Metadata result:', JSON.stringify(metaData, null, 2));
  } catch (e) {
    console.error('Error Stack:', e);
  }
}

test();
