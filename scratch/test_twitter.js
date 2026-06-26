async function run() {
  const url = 'https://mdeaizzwijbnarzqrlbh.supabase.co/functions/v1/twitter-download';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kZWFpenp3aWpibmFyenFybGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTI5NjksImV4cCI6MjA5MjM4ODk2OX0.QqjYI5_Zzr7jTceLxH7lWY5nJGBHOLoS3WkNQ5Lgpdo';

  const twitterUrl = 'https://x.com/AneleAndTheClub/status/2054446670696304665?s=20';
  console.log('Sending request to Supabase twitter-download edge function...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({ url: twitterUrl })
    });
    console.log('Status:', res.status, res.statusText);
    const text = await res.text();
    console.log('Body:', text.slice(0, 1000));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
run();
