const { Innertube } = require("youtubei.js");
const ytDlp = require("child_process");

const COMMON_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function test() {
  const videoId = "LXb3EKWsInQ"; // COSTA RICA IN 4K
  console.log(`Testing video: ${videoId}`);
  try {
    const yt = await Innertube.create({
      generate_session_locally: true,
      client_type: "ANDROID",
      user_agent: COMMON_USER_AGENT,
    });
    const info = await yt.getBasicInfo(videoId, "ANDROID");
    const formats = [
      ...(info.streaming_data?.formats || []),
      ...(info.streaming_data?.adaptive_formats || []),
    ];
    console.log(`Innertube ANDROID found ${formats.length} formats.`);
    
    const ytW = await Innertube.create({
      generate_session_locally: true,
      client_type: "WEB",
      user_agent: COMMON_USER_AGENT,
    });
    const infoW = await ytW.getBasicInfo(videoId, "WEB");
    const formatsW = [
      ...(infoW.streaming_data?.formats || []),
      ...(infoW.streaming_data?.adaptive_formats || []),
    ];
    console.log(`Innertube WEB found ${formatsW.length} formats.`);
    
    const allHeights = new Set();
    [...formats, ...formatsW].forEach(f => {
      if (f.height) allHeights.add(f.height);
    });
    console.log("Innertube available heights:", Array.from(allHeights).sort((a,b)=>b-a));

  } catch (err) {
    console.error("Innertube test failed:", err);
  }
}

test();
