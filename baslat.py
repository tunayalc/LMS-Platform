import os
import subprocess
import time
from pathlib import Path

ROOT_DIR = Path(__file__).parent.resolve()
DEFAULT_ENV_FILE = ".env.local"


def start_service(title: str, command: str, working_dir: Path, delay: float = 2.0) -> None:
    print(f"[{title}] starting...")
    env = os.environ.copy()
    env.setdefault("LMS_ENV_FILE", DEFAULT_ENV_FILE)

    cmd_command = f"title {title} && {command}"
    subprocess.Popen(
        ["start", title, "cmd", "/k", cmd_command],
        cwd=str(working_dir),
        shell=True,
        env=env,
    )
    time.sleep(delay)


def start_tunnel(title: str, tunnel_path: Path, token_env: str) -> None:
    token = os.environ.get(token_env, "").strip()
    if not token:
        print(f"[{title}] skip: {token_env} not set")
        return
    if not tunnel_path.exists():
        print(f"[{title}] skip: cloudflared not found at {tunnel_path}")
        return
    start_service(title, f'"{tunnel_path}" tunnel run --token {token}', ROOT_DIR)


def main() -> None:
    print("=== LMS LAUNCHER ===")
    print(f"Working dir: {ROOT_DIR}")

    try:
        subprocess.check_call("docker ps >nul 2>&1", shell=True)
        print("Docker is running.")
        subprocess.call("docker-compose up -d", shell=True)
    except Exception:
        print("Docker not available. Continuing without docker...")

    tunnel_path = ROOT_DIR / "cloudflared-windows-amd64.exe"

    start_tunnel("LMS API Tunnel", tunnel_path, "LMS_TUNNEL_API_TOKEN")
    start_tunnel("LMS Web Tunnel", tunnel_path, "LMS_TUNNEL_WEB_TOKEN")

    start_service("LMS Python OMR", f'"{ROOT_DIR}\\omr.bat"', ROOT_DIR)
    start_service("LMS API Server", "npm run dev", ROOT_DIR / "apps" / "api")
    start_service("LMS Web Server", "npm run dev", ROOT_DIR / "apps" / "web")

    print("All services triggered.")
    input("Press Enter to exit...")


if __name__ == "__main__":
    main()
