// Using global fetch

async function test() {
  const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Me at the zoo
  try {
    const res = await fetch('http://localhost:8000/youtube/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, mode: 'video' })
    });
    const json = await res.json();
    console.log('PYTHON BACKEND INFO RESULT:');
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error fetching python backend info:', err);
  }
}

test();
