const { Innertube } = require("youtubei.js");

async function main() {
  const yt = await Innertube.create({
    generate_session_locally: true,
    client_type: "WEB",
  });
  
  const videoId = "dQw4w9WgXcQ"; // Rickroll
  const info = await yt.getBasicInfo(videoId, "WEB");
  console.log("Keys in info.basic_info:", Object.keys(info.basic_info));
  console.log("Duration in basic_info:", info.basic_info.duration);
}

main().catch(console.error);
