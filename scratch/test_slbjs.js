async function run() {
  try {
    const res = await fetch('https://tdownv4.sl-bjs.workers.dev/?down=https://www.tiktok.com/@khaby.lame/video/7376781293223218465');
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch (err) {
    console.error(err);
  }
}
run();
