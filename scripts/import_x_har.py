#!/usr/bin/env python3
"""Import sanitized Chrome HAR captures from x.com into JSON and XLSX."""
from __future__ import annotations

import argparse
import base64
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo


HEADERS = [
    "record_id", "platform", "text", "author", "handle", "url", "domain",
    "published_at", "saved_at", "content_type", "topics", "language",
    "summary", "has_media", "media_urls", "capture_source", "raw_file",
    "status", "classification_status",
]


def decode_content(entry: dict) -> dict | None:
    content = entry.get("response", {}).get("content", {})
    text = content.get("text")
    if not text:
        return None
    try:
        if content.get("encoding") == "base64":
            text = base64.b64decode(text).decode("utf-8", "replace")
        return json.loads(text)
    except (ValueError, UnicodeError):
        return None


def walk_tweets(value):
    if isinstance(value, dict):
        tr = value.get("tweet_results")
        result = tr.get("result") if isinstance(tr, dict) else None
        if isinstance(result, dict) and result.get("rest_id"):
            yield result
        for child in value.values():
            yield from walk_tweets(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_tweets(child)


def iso_date(value: str | None) -> str:
    if not value:
        return ""
    for fmt in ("%a %b %d %H:%M:%S %z %Y", "%Y-%m-%dT%H:%M:%S.%fZ"):
        try:
            return datetime.strptime(value, fmt).astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    return value


def expanded_urls(legacy: dict) -> list[str]:
    urls = []
    entities = legacy.get("entities", {})
    for item in entities.get("urls", []) or []:
        url = item.get("expanded_url") or item.get("url")
        if url and url not in urls:
            urls.append(url)
    return urls


def media_urls(legacy: dict) -> list[str]:
    urls = []
    media = (legacy.get("extended_entities") or {}).get("media", [])
    if not media:
        media = legacy.get("entities", {}).get("media", []) or []
    for item in media:
        url = item.get("media_url_https") or item.get("media_url") or item.get("video_info", {}).get("variants", [{}])[0].get("url")
        if url and url not in urls:
            urls.append(url)
    return urls


def record_from_tweet(tweet: dict, raw_file: str) -> dict:
    legacy = tweet.get("legacy", {}) or {}
    user = (((tweet.get("core") or {}).get("user_results") or {}).get("result") or {})
    user_core = user.get("core", {}) or {}
    handle = user_core.get("screen_name", "")
    text = legacy.get("full_text", "")
    note = (((tweet.get("note_tweet") or {}).get("note_tweet_results") or {}).get("result") or {})
    if note.get("text"):
        text = note["text"]
    urls = expanded_urls(legacy)
    media = media_urls(legacy)
    canonical = f"https://x.com/{handle}/status/{tweet['rest_id']}" if handle else f"https://x.com/i/status/{tweet['rest_id']}"
    source_url = urls[0] if urls else canonical
    domain = urlparse(source_url).netloc.lower().removeprefix("www.")
    return {
        "record_id": f"x:{tweet['rest_id']}",
        "platform": "X",
        "text": text,
        "author": user_core.get("name", ""),
        "handle": f"@{handle}" if handle else "",
        "source": f"@{handle}" if handle else user_core.get("name", "X"),
        "url": canonical,
        "external_urls": urls,
        "domain": domain,
        "published_at": iso_date(legacy.get("created_at")),
        "saved_at": "",
        "content_type": "video" if any("video" in str(m).lower() for m in media) else ("media" if media else "post"),
        "collections": [],
        "topics": [],
        "subtopics": [],
        "entities": [],
        "language": legacy.get("lang", ""),
        "summary": "",
        "has_media": bool(media),
        "media_status": "referenced" if media else "not_requested",
        "media_paths": [],
        "media_urls": media,
        "capture_source": "x_har",
        "raw_file": raw_file,
        "status": "captured",
        "classification_status": "pending",
        "classification_matches": {},
        "confidence": "",
        "error": "",
    }


def import_har(har_path: Path) -> tuple[list[dict], int]:
    data = json.loads(har_path.read_text(encoding="utf-8"))
    records: dict[str, dict] = {}
    bookmark_requests = 0
    for entry in data.get("log", {}).get("entries", []):
        url = entry.get("request", {}).get("url", "")
        if "/Bookmarks?" not in url:
            continue
        payload = decode_content(entry)
        if not payload:
            continue
        bookmark_requests += 1
        for tweet in walk_tweets(payload):
            record = record_from_tweet(tweet, str(har_path))
            records.setdefault(record["record_id"], record)
    return list(records.values()), bookmark_requests


def style_sheet(ws, table_name: str | None = None):
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="4F46E5")
        cell.alignment = Alignment(vertical="top")
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    widths = {1: 18, 2: 12, 3: 70, 4: 24, 5: 20, 6: 48, 7: 28, 8: 25, 9: 20, 10: 15, 11: 24, 12: 12, 13: 45, 14: 12, 15: 55, 16: 18, 17: 48, 18: 14, 19: 22}
    for idx, width in widths.items():
        ws.column_dimensions[get_column_letter(idx)].width = width
    if table_name and ws.max_row >= 2:
        table = Table(displayName=table_name, ref=ws.dimensions)
        table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
        ws.add_table(table)


def write_outputs(records: list[dict], har_path: Path, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "x_bookmarks.normalized.json"
    json_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    wb = Workbook()
    ws = wb.active
    ws.title = "Resumen"
    summary = [
        ["Atlas de Guardados - importación X", "Valor"],
        ["Registros únicos", len(records)],
        ["Solicitudes Bookmarks en HAR", "ver Manifest"],
        ["Pendientes de clasificación", sum(r["classification_status"] == "pending" for r in records)],
        ["Con media", sum(r["has_media"] for r in records)],
    ]
    for row in summary:
        ws.append(row)
    ws["A1"].font = Font(bold=True, color="FFFFFF")
    ws["B1"].font = Font(bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor="4F46E5")
    ws["B1"].fill = PatternFill("solid", fgColor="4F46E5")
    ws.column_dimensions["A"].width = 34
    ws.column_dimensions["B"].width = 24

    all_ws = wb.create_sheet("Todos")
    all_ws.append(HEADERS)
    for record in records:
        values = []
        for header in HEADERS:
            value = record[header]
            if isinstance(value, (list, dict)):
                value = json.dumps(value, ensure_ascii=False) if isinstance(value, dict) else " | ".join(map(str, value))
            values.append(value)
        all_ws.append(values)
    style_sheet(all_ws, "TodosLosGuardados")

    source_ws = wb.create_sheet("Por fuente")
    source_ws.append(["handle", "autor", "guardados"])
    counts = {}
    authors = {}
    for r in records:
        key = r["handle"] or "(sin autor)"
        counts[key] = counts.get(key, 0) + 1
        authors[key] = r["author"]
    for handle, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        source_ws.append([handle, authors[handle], count])
    style_sheet(source_ws, "GuardadosPorFuente")

    errors_ws = wb.create_sheet("Errores")
    errors_ws.append(["archivo", "detalle"])
    style_sheet(errors_ws, "ErroresImportacion")

    manifest_ws = wb.create_sheet("Manifest")
    manifest_ws.append(["campo", "valor"])
    manifest_ws.append(["har", str(har_path)])
    manifest_ws.append(["importado_at", datetime.now(timezone.utc).isoformat()])
    manifest_ws.append(["registros_unicos", len(records)])
    manifest_ws.append(["schema", "x_bookmarks_v1"])
    style_sheet(manifest_ws, "ManifestImportacion")

    xlsx_path = out_dir / "atlas_x_test.xlsx"
    wb.save(xlsx_path)
    return json_path, xlsx_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("har", type=Path)
    parser.add_argument("--out-dir", type=Path, default=Path("exports"))
    args = parser.parse_args()
    records, requests = import_har(args.har)
    json_path, xlsx_path = write_outputs(records, args.har, args.out_dir)
    print(json.dumps({"bookmark_requests": requests, "unique_records": len(records), "json": str(json_path), "xlsx": str(xlsx_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
