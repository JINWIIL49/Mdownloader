import re

print("Searching log for Spotify requests...")
with open("dev-server.out.log", "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        if "spotify" in line.lower() or "track" in line.lower() or "went" in line.lower():
            # Check if it has track ID
            if "/info" in line or "/download" in line:
                print(line.strip())
