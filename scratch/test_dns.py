import socket

domains = ["spotifydown.com", "api.spotifydown.com", "apis.davidcyriltech.my.id", "rapid.dlapi.app"]

for domain in domains:
    try:
        ip = socket.gethostbyname(domain)
        print(f"{domain} -> {ip}")
    except Exception as e:
        print(f"{domain} -> FAILED: {e}")
