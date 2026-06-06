import json
import os
import urllib.request
import urllib.error

from fastapi import APIRouter, Depends

from app.auth import get_current_active_user
from app.models.user import User

router = APIRouter(prefix="/ai", tags=["ai"])

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


@router.get("/ollama-models")
def list_ollama_models(current_user: User = Depends(get_current_active_user)):
    """Return locally available Ollama models, or an empty list if Ollama is not running."""
    try:
        with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=5) as resp:
            data = json.loads(resp.read().decode())
        models = [
            {"name": m["name"], "size": m.get("size")}
            for m in data.get("models", [])
        ]
        return {"models": models}
    except Exception:
        return {"models": []}
