from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os

from dotenv import load_dotenv


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def _parse_int(name: str) -> int:
    raw = _require_env(name)
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc


def load_env() -> Path:
    env_file = os.environ.get("LMS_ENV_FILE")
    if not env_file:
        raise RuntimeError(
            "LMS_ENV_FILE is required. Run scripts/detect_env.ps1 to generate env files."
        )

    path = Path(env_file)
    if not path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / env_file

    if not path.exists():
        raise RuntimeError(f"LMS_ENV_FILE not found: {path}")

    load_dotenv(path)
    return path


@dataclass(frozen=True)
class Settings:
    mode: str
    omr_port: int
    base_url_local: str | None
    base_url_docker: str | None


def load_settings() -> Settings:
    load_env()
    mode = _require_env("LMS_MODE")
    if mode not in ("local", "docker"):
        raise RuntimeError("LMS_MODE must be 'local' or 'docker'.")

    base_url_local = os.getenv("LMS_OMR_BASE_URL_LOCAL")
    base_url_docker = os.getenv("LMS_OMR_BASE_URL_DOCKER")

    if mode == "local" and not base_url_local:
        raise RuntimeError("LMS_OMR_BASE_URL_LOCAL is required for local mode.")
    if mode == "docker" and not base_url_docker:
        raise RuntimeError("LMS_OMR_BASE_URL_DOCKER is required for docker mode.")

    return Settings(
        mode=mode,
        omr_port=_parse_int("LMS_OMR_PORT"),
        base_url_local=base_url_local,
        base_url_docker=base_url_docker
    )


SETTINGS = load_settings()
