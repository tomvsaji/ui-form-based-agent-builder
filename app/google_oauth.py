import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict, Optional, Tuple

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow


GOOGLE_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"


def _get_client_config() -> Dict[str, Dict[str, str]]:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("Google OAuth client credentials are not configured.")
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": GOOGLE_AUTH_URI,
            "token_uri": GOOGLE_TOKEN_URI,
        }
    }


def build_google_flow(redirect_uri: str) -> Flow:
    flow = Flow.from_client_config(_get_client_config(), scopes=GOOGLE_SCOPES)
    flow.redirect_uri = redirect_uri
    return flow


def _get_state_secret() -> str:
    secret = os.getenv("OAUTH_STATE_SECRET")
    if not secret:
        raise RuntimeError("OAUTH_STATE_SECRET is not configured.")
    return secret


def build_oauth_state(tenant_id: str, agent_id: str) -> str:
    payload = {"tenant_id": tenant_id, "agent_id": agent_id, "ts": int(time.time())}
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    encoded = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    signature = hmac.new(_get_state_secret().encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def parse_oauth_state(state: str, max_age_seconds: int = 600) -> Tuple[str, str]:
    try:
        encoded, signature = state.split(".", 1)
    except ValueError as exc:
        raise RuntimeError("Invalid OAuth state.") from exc
    expected = hmac.new(_get_state_secret().encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise RuntimeError("OAuth state signature mismatch.")
    padded = encoded + "=" * (-len(encoded) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
    ts = int(payload.get("ts", 0))
    if time.time() - ts > max_age_seconds:
        raise RuntimeError("OAuth state expired.")
    return payload["tenant_id"], payload["agent_id"]


def credentials_to_token(creds: Credentials) -> Dict[str, Any]:
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri or GOOGLE_TOKEN_URI,
        "scopes": " ".join(creds.scopes or []),
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
        "token_type": creds.token_type,
    }


def token_to_credentials(token: Dict[str, Any]) -> Credentials:
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("Google OAuth client credentials are not configured.")
    return Credentials(
        token=token.get("access_token"),
        refresh_token=token.get("refresh_token"),
        token_uri=token.get("token_uri") or GOOGLE_TOKEN_URI,
        client_id=client_id,
        client_secret=client_secret,
        scopes=(token.get("scopes") or "").split(),
    )


def refresh_credentials_if_needed(creds: Credentials) -> Optional[Dict[str, Any]]:
    if not creds.expired:
        return None
    if not creds.refresh_token:
        raise RuntimeError("Google OAuth token expired and no refresh token available.")
    creds.refresh(Request())
    return credentials_to_token(creds)
