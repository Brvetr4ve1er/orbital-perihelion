import os
import subprocess
import webbrowser
import time
import sys

def main():
    print("⚡ PKOS Intelligence Engine Launcher")
    print("===================================")
    print("Starting development server...")
    
    # Run npm run dev in a background process
    # We use shell=True to allow npm to be found in the PATH
    try:
        server_process = subprocess.Popen(
            "npm run dev", 
            shell=True, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT,
            text=True
        )
        
        print("Waiting for server to spin up...")
        time.sleep(3) # Give Vite a few seconds to boot
        
        url = "http://localhost:5173"
        print(f"Opening browser at {url}...")
        webbrowser.open(url)
        
        print("\nPKOS is running! Close this window to stop the server.")
        
        # Keep process alive and print server output
        for line in server_process.stdout:
            print(line, end="")
            
    except KeyboardInterrupt:
        print("\nShutting down launcher...")
    except Exception as e:
        print(f"\nError: {e}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    main()
