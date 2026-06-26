async function test() {
  try {
    console.log("Fetching v.gd...");
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://v.gd/create.php?format=json&url=https%3A%2F%2Fexample.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      signal: controller.signal
    });
    clearTimeout(id);
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (err) {
    console.error("Error fetching v.gd:", err);
  }
}

test();
