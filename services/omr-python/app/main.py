from __future__ import annotations

import os
import json
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .config import SETTINGS
from .pipeline import run_pipeline


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class HealthResponse(BaseModel):
    status: str
    mode: str
    version: str
    timestamp: str


class ScanResponse(BaseModel):
    ok: bool
    result: dict


app = FastAPI(title="OMR Service")
OMR_VERSION = os.getenv("LMS_OMR_VERSION", "0.1.0")

def _parse_manual_corners(value: str | None) -> tuple[list[list[float]] | None, bool]:
    """
    Returns (manual_corners, was_invalid).
    manual_corners is a 4x2 list: [[x,y],[x,y],[x,y],[x,y]]
    """
    if not value:
        return None, False

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None, True

    if not isinstance(parsed, list) or len(parsed) != 4:
        return None, True

    corners: list[list[float]] = []
    for point in parsed:
        if (
            not isinstance(point, (list, tuple))
            or len(point) != 2
            or not isinstance(point[0], (int, float))
            or not isinstance(point[1], (int, float))
        ):
            return None, True
        corners.append([float(point[0]), float(point[1])])

    return corners, False


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        mode=SETTINGS.mode,
        version=OMR_VERSION,
        timestamp=_now_iso()
    )


@app.get("/version")
def version() -> dict:
    return {
        "name": "OMR Service",
        "version": OMR_VERSION,
        "mode": SETTINGS.mode,
        "timestamp": _now_iso()
    }


@app.post("/scan", response_model=ScanResponse)
async def scan(
    file: UploadFile = File(...),
    answerKey: str | None = Form(None),
    threshold: float | None = Form(None),
    xOffset: float | None = Form(None),
    yOffset: float | None = Form(None),
    debug: bool | None = Form(None),
    smartAlign: bool | str | None = Form(None),
    skipWarp: bool | str | None = Form(None),  # NEW: Skip perspective correction
    manualCorners: str | None = Form(None),
    corners: str | None = Form(None),  # Backward-compat alias from some clients
) -> ScanResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty_file")

    answer_key_payload = None
    if answerKey:
        try:
            parsed = json.loads(answerKey)
            if isinstance(parsed, dict):
                answer_key_payload = parsed
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="invalid_answer_key") from exc

    # Parse smartAlign (can be bool or string "true")
    smart_align_value = False
    if smartAlign is True or smartAlign == "true":
        smart_align_value = True

    # Parse skipWarp
    skip_warp_value = False
    if skipWarp is True or skipWarp == "true":
        skip_warp_value = True

    manual_corners_payload, manual_corners_invalid = _parse_manual_corners(manualCorners or corners)

    try:
        result = run_pipeline(
            content,
            options={
                "answer_key": answer_key_payload,
                "threshold": threshold,
                "x_offset": xOffset,
                "y_offset": yOffset,
                "debug": debug,
                "smart_align": smart_align_value,
                "skip_warp": skip_warp_value,
                "manual_corners": manual_corners_payload,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if manual_corners_invalid:
        warnings = result.get("warnings")
        if isinstance(warnings, list):
            warnings.append("invalid_manual_corners")
        else:
            result["warnings"] = ["invalid_manual_corners"]

    return ScanResponse(ok=True, result=result)
