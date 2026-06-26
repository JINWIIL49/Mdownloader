async function run() {
  const res = await fetch('https://mdownloader.onginjokelvin31.workers.dev/');
  console.log('Status:', res.status);
  console.log('Headers:', Object.fromEntries(res.headers.entries()));
  const html = await res.text();
  console.log('HTML length:', html.length);
  console.log('HTML slice:', html.slice(0, 1000));
}

run().catch(console.error);
