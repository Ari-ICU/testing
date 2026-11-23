#!/usr/bin/env python3
"""Cross-platform launcher for KhmerVoice AI (Backend + Frontend).

Usage:
    python run.py
"""

from __future__ import annotations

import os
from pathlib import Path
import signal
import subprocess
import sys
import time

PROJECT_ROOT = Path(__file__).resolve().parent

# Color codes
GREEN = "\033[92m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"


def main():
    print(f"{CYAN}{BOLD}")
    print("=" * 72)
    print("   🇰🇭 KhmerVoice AI — Speech Studio & Movie Dubbing System")
    print("   FastAPI (Port 8000) + Next.js (Port 3000)")
    print("=" * 72)
    print(f"{RESET}")

    # 1. Resolve Python
    venv_py = PROJECT_ROOT / ".venv" / "bin" / "python"
    py_bin = str(venv_py) if venv_py.exists() else sys.executable
    print(f"{GREEN}[✓] Python:{RESET} {py_bin}")

    # 2. Check Node
    frontend_dir = PROJECT_ROOT / "frontend"
    node_modules = frontend_dir / "node_modules"
    if not node_modules.exists():
        print(f"{YELLOW}[*] Installing frontend dependencies...{RESET}")
        subprocess.run(["npm", "install"], cwd=str(frontend_dir), check=True)

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    # 3. Launch Backend
    print(f"{CYAN}[*] Starting Backend API on http://127.0.0.1:8000 ...{RESET}")
    backend_proc = subprocess.Popen(
        [py_bin, "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"],
        cwd=str(PROJECT_ROOT),
        env=env,
    )

    time.sleep(1.5)

    # 4. Launch Frontend
    print(f"{CYAN}[*] Starting Next.js Studio on http://localhost:3000 ...{RESET}")
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(frontend_dir),
    )

    print(f"\n{GREEN}{BOLD}" + "=" * 72)
    print("  🚀 KhmerVoice AI is running!")
    print(f"  🎬 Web Studio & Movie Dubbing:  {CYAN}http://localhost:3000{GREEN}")
    print(f"  ⚙️  FastAPI Backend API:         {CYAN}http://localhost:8000{GREEN}")
    print(f"  📚 Interactive API Docs:        {CYAN}http://localhost:8000/docs{GREEN}")
    print("=" * 72 + f"{RESET}")
    print(f"{YELLOW}Press [Ctrl + C] to stop both servers.{RESET}\n")

    def signal_handler(sig, frame):
        print(f"\n{YELLOW}[*] Stopping servers cleanly...{RESET}")
        backend_proc.terminate()
        frontend_proc.terminate()
        backend_proc.wait()
        frontend_proc.wait()
        print(f"{GREEN}[✓] Stopped.{RESET}")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print(f"[!] Backend exited with code {backend_proc.returncode}")
                frontend_proc.terminate()
                break
            if frontend_proc.poll() is not None:
                print(f"[!] Frontend exited with code {frontend_proc.returncode}")
                backend_proc.terminate()
                break
    except KeyboardInterrupt:
        signal_handler(None, None)


if __name__ == "__main__":
    main()
