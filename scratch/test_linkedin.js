
async function getLinkedInVideoUrl() {
  const activityId = '7132039144865103872';
  const embedUrl = `https://www.linkedin.com/embed/feed/update/urn:li:activity:${activityId}`;
  
  console.log('Fetching embed page HTML...');
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  const html = await res.text();
  
  // Extract JSON-LD
  const re = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const obj = JSON.parse(match[1]);
      if (obj?.contentUrl) return obj.contentUrl;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item?.contentUrl) return item.contentUrl;
        }
      }
    } catch (e) {}
  }
  
  // Fallback regex for progressiveUrl or progressiveUrl inside json
  const progRe = /"progressiveUrl"\s*:\s*"([^"]+)"/;
  const pm = html.match(progRe);
  if (pm) return pm[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");

  // Fallback 2: mp4 search
  const mp4Re = /https:\/\/media\.licdn\.com\/[^\s"'<>\\&]+?\.mp4(?:\?[^\s"'<>\\&]*)?/gi;
  const mm = html.match(mp4Re);
  if (mm) return mm[0].replace(/\\u0026/g, "&").replace(/\\&/g, "&");

  throw new Error('Could not find video URL in HTML');
}

async function testFetch(videoUrl, label, headers) {
  console.log(`\n--- Testing: ${label} ---`);
  try {
    const res = await fetch(videoUrl, { headers });
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log('Headers:');
    for (const [k, v] of res.headers.entries()) {
      if (k.toLowerCase().startsWith('content-') || k.toLowerCase() === 'access-control-allow-origin') {
        console.log(`  ${k}: ${v}`);
      }
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

async function run() {
  try {
    const videoUrl = await getLinkedInVideoUrl();
    console.log('Found video URL:', videoUrl);
    
    // Test 1: No headers (only Node default)
    await testFetch(videoUrl, 'No extra headers', {});
    
    // Test 2: Standard Referer and User-Agent
    await testFetch(videoUrl, 'Referer + User-Agent only', {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.linkedin.com/'
    });
    
    // Test 3: The exact headers used in tiktok-download.ts (without Cookie)
    await testFetch(videoUrl, 'tiktok-download headers (without Cookie)', {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.linkedin.com/',
      'Origin': 'https://www.linkedin.com',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    });

    // Test 4: The exact headers used in tiktok-download.ts (with Cookie)
    await testFetch(videoUrl, 'tiktok-download headers (with Cookie)', {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.linkedin.com/',
      'Origin': 'https://www.linkedin.com',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Cookie': 'lang=v=2&lang=en-us;'
    });

  } catch (err) {
    console.error('Run failed:', err);
  }
}

run();
