from typing import Any, Dict, List, Optional

from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials


def _ensure_headers(
    service: Any,
    spreadsheet_id: str,
    sheet_tab: str,
    headers: List[str],
) -> None:
    header_range = f"{sheet_tab}!1:1"
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=header_range)
        .execute()
    )
    existing = result.get("values", [])
    if existing:
        return
    body = {"values": [headers]}
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"{sheet_tab}!A1",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body=body,
    ).execute()


def append_form_submission(
    creds: Credentials,
    spreadsheet_id: str,
    sheet_tab: Optional[str],
    row: List[Any],
    headers: List[str],
) -> Dict[str, Any]:
    service = build("sheets", "v4", credentials=creds)
    tab = sheet_tab or "Sheet1"
    _ensure_headers(service, spreadsheet_id, tab, headers)
    body = {"values": [row]}
    return (
        service.spreadsheets()
        .values()
        .append(
            spreadsheetId=spreadsheet_id,
            range=f"{tab}!A1",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body=body,
        )
        .execute()
    )
