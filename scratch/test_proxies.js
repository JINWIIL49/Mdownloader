async function run() {
  const targetUrl = 'https://www.tikwm.com/api/?url=https://www.tiktok.com/@khaby.lame/video/7376781293223218465';
  const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl);
  
  try {
    const res = await fetch(proxyUrl);
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text.slice(0, 500));
  } catch (err) {
    console.error(err);
  }
}
run();
