async function test() {
  const trackId = '6rqhFgbbKwnb9MLmUQDhG6'; // Valid Spotify track ID
  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${trackId}`);
    const html = await res.text();
    const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/i);
    if (match) {
      console.log('Found __NEXT_DATA__!');
      const data = JSON.parse(match[1]);
      console.log(JSON.stringify(data.props, null, 2).slice(0, 3000));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
