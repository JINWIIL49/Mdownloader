const fs = require('fs');
const path = require('path');

async function testDownload() {
  const fileParam = "ytdlp:2xWkATdMQms:bestvideo%5Bheight%3C%3D1080%5D%2Bbestaudio%5Bext%3Dm4a%5D/bestvideo%5Bheight%3C%3D1080%5D%2Bbestaudio/best%5Bheight%3C%3D1080%5D";
  const filename = "Test_Video_1080p.mp4";
  const destPath = path.join(__dirname, 'test_output_1080p.mp4');

  console.log(`Starting test download from backend...`);
  const url = `http://localhost:8000/youtube/download?file=${fileParam}&filename=${encodeURIComponent(filename)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buffer);
    console.log(`Successfully downloaded merged video to: ${destPath}`);
    console.log(`Downloaded file size: ${buffer.length} bytes`);
  } catch (err) {
    console.error('Download failed:', err);
  }
}

testDownload();
