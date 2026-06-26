async function test() {
  const trackId = '4PTG3Z6ehGkBF3zIqYQGS3'; // Never Gonna Give You Up
  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${trackId}`);
    const html = await res.text();
    // Search for the JSON state in the embed HTML.
    // It's usually inside a script tag with id="initial-state" or similar, or inside a JS variable.
    const match = html.match(/<script[^>]+id="initial-state"[^>]*>([\s\S]+?)<\/script>/i) ||
                  html.match(/<script[^>]*>[\s\S]*?__initialState[\s\S]*?=\{([\s\S]+?)\};[\s\S]*?<\/script>/i) ||
                  html.match(/resource\s*:\s*(\{[\s\S]+?\})\s*,/);

    if (match) {
      console.log('Match found!');
      console.log(match[0].slice(0, 500));
    } else {
      console.log('No direct match. Let\'s look for any script containing track metadata.');
      const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
      for (const script of scripts) {
        if (script.includes('Never Gonna Give You Up') || script.includes('Rick Astley')) {
          console.log('Found script containing metadata:');
          console.log(script.slice(0, 1000));
          break;
        }
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
