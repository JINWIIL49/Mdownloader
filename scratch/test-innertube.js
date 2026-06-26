const { Innertube } = require("youtubei.js");

const COMMON_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function test() {
  const videoId = "2xWkATdMQms"; // A test video (has 1080p, etc.)
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
    console.log(`Found ${formats.length} formats via ANDROID`);
    
    // Web
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
    console.log(`Found ${formatsW.length} formats via WEB`);
    
    // Let's merge and check heights
    const allFormats = [...formats];
    const existingItags = new Set(allFormats.map(f => f.itag));
    for (const f of formatsW) {
      if (!existingItags.has(f.itag)) {
        allFormats.push(f);
      }
    }
    
    console.log("Unique formats:", allFormats.map(f => ({
      itag: f.itag,
      height: f.height,
      width: f.width,
      has_video: f.has_video,
      has_audio: f.has_audio,
      mime_type: f.mime_type
    })));
    
    // Run selectDirectFormats logic
    const targetHeight = 1080;
    const videoFormats = allFormats.filter(f => f.has_video);
    const candidates = videoFormats.filter(f => f.height && f.height <= targetHeight);
    candidates.sort((a, b) => {
      if (b.height !== a.height) return b.height - a.height;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });

    let bestVideo = candidates.find(f => (f.mime_type || '').includes('video/mp4') && (f.mime_type || '').includes('avc1'));
    if (!bestVideo) {
      bestVideo = candidates[0];
    }
    
    console.log("Selected best video format:", bestVideo ? {
      itag: bestVideo.itag,
      height: bestVideo.height,
      width: bestVideo.width,
      mime_type: bestVideo.mime_type
    } : "None");
    
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
