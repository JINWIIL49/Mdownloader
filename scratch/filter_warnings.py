import os

log_path = r"c:\Users\Jinwiil Onginjo\Desktop\sweet-sync-vault-main\python-backend\server.log"
if os.path.exists(log_path):
    with open(log_path, "r", encoding="utf-16le") as f:
        lines = f.readlines()
    
    warnings = [line.strip() for line in lines if "WARN" in line or "expected 3 channels" in line]
    print(f"Total warning lines found: {len(warnings)}")
    for w in warnings[-30:]:
        print(w)
else:
    print("No log file found.")
