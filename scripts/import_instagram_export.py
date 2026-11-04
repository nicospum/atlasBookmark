#!/usr/bin/env python3
"""Parse official Instagram saved-content exports without login automation."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

URL_RE = re.compile(r"https?://(?:www\.)?instagram\.com/(?:p|reel|tv)/[A-Za-z0-9_-]+/?", re.I)
ID_RE = re.compile(r"instagram\.com/(?:p|reel|tv)/([A-Za-z0-9_-]+)", re.I)


def iso_timestamp(value):
    if not value:
        return ""
    try:
        return datetime.fromtimestamp(float(value), timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError):
        return str(value)


def canonical_url(url: str) -> str:
    return url.rstrip("/") + "/"


def record_for(url: str, data: dict, collections: list[str], raw_file: str) -> dict:
    url = canonical_url(url)
    match = ID_RE.search(url)
    shortcode = match.group(1) if match else hashlib.sha256(url.encode()).hexdigest()[:16]
    path = urlparse(url).path.lower()
    kind = "reel" if "/reel/" in path else "video" if "/tv/" in path else "post"
    text = str(data.get("caption") or data.get("text") or data.get("title") or data.get("description") or "")
    author = str(data.get("author") or data.get("username") or data.get("user") or "")
    return {
        "record_id": f"instagram:{shortcode}",
        "platform": "Instagram",
        "text": text,
        "author": author,
        "handle": f"@{author.lstrip('@')}" if author else "",
        "source": "Instagram",
        "url": url,
        "external_urls": [],
        "domain": "instagram.com",
        "published_at": iso_timestamp(data.get("published_at") or data.get("taken_at")),
        "saved_at": iso_timestamp(data.get("timestamp") or data.get("saved_at")),
        "content_type": kind,
        "collections": sorted(set(collections)),
        "topics": [],
        "subtopics": [],
        "entities": [],
        "language": "",
        "summary": "",
        "has_media": True,
        "media_status": "not_in_export",
        "media_paths": [],
        "capture_source": "instagram_export",
        "raw_file": raw_file,
        "status": "captured",
        "classification_status": "pending",
        "error": "",
    }


def extract_json(value, raw_file: str, collections=None):
    collections = list(collections or [])
    records = []
    errors = []
    if isinstance(value, dict):
        current = collections
        for key in ("collection", "collection_name", "collectionName", "folder"):
            if value.get(key) and isinstance(value[key], str):
                current = [*current, value[key]]
        name = value.get("name")
        if isinstance(name, str) and isinstance(value.get("items"), list):
            current = [*current, name]
        url = value.get("href") or value.get("url") or value.get("uri")
        if isinstance(url, str) and "instagram.com/" in url.lower():
            records.append(record_for(url, value, current, raw_file))
        for child in value.values():
            child_records, child_errors = extract_json(child, raw_file, current)
            records.extend(child_records); errors.extend(child_errors)
    elif isinstance(value, list):
        for child in value:
            child_records, child_errors = extract_json(child, raw_file, collections)
            records.extend(child_records); errors.extend(child_errors)
    return records, errors


def parse_file(path: Path):
    if path.suffix.lower() in {".html", ".htm"}:
        text = path.read_text(encoding="utf-8", errors="replace")
        return [record_for(url, {}, [], str(path)) for url in URL_RE.findall(text)], []
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return [], [{"file": str(path), "error": str(exc)}]
    return extract_json(value, str(path))


def import_path(path: Path):
    all_records = []
    errors = []
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            for name in archive.namelist():
                if not name.lower().endswith((".json", ".html", ".htm")):
                    continue
                temp = Path(name)
                try:
                    raw = archive.read(name)
                    if name.lower().endswith((".html", ".htm")):
                        records = [record_for(url, {}, [], f"{path}!{name}") for url in URL_RE.findall(raw.decode("utf-8", "replace"))]
                        file_errors = []
                    else:
                        records, file_errors = extract_json(json.loads(raw.decode("utf-8")), f"{path}!{name}")
                    all_records.extend(records); errors.extend(file_errors)
                except Exception as exc:
                    errors.append({"file": f"{path}!{name}", "error": str(exc)})
    else:
        all_records, errors = parse_file(path)
    unique = {}
    for record in all_records:
        if record["record_id"] in unique:
            unique[record["record_id"]]["collections"] = sorted(set(unique[record["record_id"]]["collections"] + record["collections"]))
        else:
            unique[record["record_id"]] = record
    return list(unique.values()), errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    records, errors = import_path(args.path)
    print(json.dumps({"records": records, "errors": errors}, ensure_ascii=False))


if __name__ == "__main__":
    main()
