import os

log_path = r"c:\Users\Jinwiil Onginjo\Desktop\sweet-sync-vault-main\python-backend\server.log"
if os.path.exists(log_path):
    try:
        with open(log_path, "r", encoding="utf-16le") as f:
            lines = f.readlines()
            print("".join(lines[-100:]))
    except Exception as e:
        print("Error reading with utf-16le:", e)
        # Try utf-8
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
                print("".join(lines[-100:]))
        except Exception as e2:
            print("Error reading with utf-8:", e2)
else:
    print("Log file not found.")
