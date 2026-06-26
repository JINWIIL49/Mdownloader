async function test() {
  const trackId = '4PTG3Z6ehGkBF3zIqYQGS3'; // Never Gonna Give You Up
  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${trackId}`);
    const html = await res.text();
    console.log('HTML length:', html.length);
    console.log(html.slice(0, 3000));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
