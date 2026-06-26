const { Innertube } = require("youtubei.js");

async function main() {
  const yt = await Innertube.create({
    generate_session_locally: true,
    client_type: "WEB",
  });
  
  // A popular public playlist ID
  const playlistId = "PLMC9KNkIncVtDpax24C4h5Ux_DPhIhxVp";
  const playlist = await yt.getPlaylist(playlistId);
  const vids = playlist.videos || playlist.items || [];
  if (vids.length > 0) {
    const first = vids[0];
    console.log("Keys in playlist video:", Object.keys(first));
    console.log("Duration keys/value:", first.duration);
  } else {
    console.log("No videos in playlist");
  }
}

main().catch(console.error);
