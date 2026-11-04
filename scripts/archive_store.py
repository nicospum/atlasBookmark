"""Local archive merge, backup, history and atomic persistence helpers."""
from __future__ import annotations

import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

LIST_FIELDS = {"topics", "subtopics", "entities", "collections", "external_urls", "media_paths", "media_urls"}
MANUAL_PROTECTED_FIELDS = {"topics", "classification_status", "classification_matches", "confidence"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _merge_list_values(left, right):
    result = []
    for value in [*(left or []), *(right or [])]:
        if value not in result:
            result.append(value)
    return result


def canonicalize_record(record: dict) -> dict:
    """Fill optional MVP fields so JSON/XLSX/TS can rely on one shape."""
    item = dict(record)
    defaults = {
        "record_id": "",
        "platform": "",
        "text": "",
        "author": "",
        "handle": "",
        "source": "",
        "url": "",
        "domain": "",
        "published_at": "",
        "saved_at": "",
        "content_type": "post",
        "language": "",
        "summary": "",
        "has_media": False,
        "media_status": "not_requested",
        "capture_source": "",
        "raw_file": "",
        "status": "captured",
        "classification_status": "pending",
        "classification_matches": {},
        "confidence": "",
        "error": "",
    }
    for key, value in defaults.items():
        item.setdefault(key, value)
    for key in LIST_FIELDS:
        value = item.get(key)
        if value is None:
            item[key] = []
        elif not isinstance(value, list):
            item[key] = [value]
    if not item.get("source"):
        item["source"] = item.get("handle") or item.get("author") or item.get("domain") or item.get("platform") or "Sin fuente"
    if item.get("media_urls") and not item.get("has_media"):
        item["has_media"] = True
    return item


def _merge_record(old: dict, new: dict) -> dict:
    merged = canonicalize_record(old)
    incoming = canonicalize_record(new)
    manual = merged.get("classification_status") == "manual"
    for key, value in incoming.items():
        if manual and key in MANUAL_PROTECTED_FIELDS:
            continue
        if key in LIST_FIELDS:
            merged[key] = _merge_list_values(merged.get(key), value)
        elif key == "classification_matches":
            existing = merged.get(key) if isinstance(merged.get(key), dict) else {}
            incoming_matches = value if isinstance(value, dict) else {}
            merged[key] = {**existing, **incoming_matches}
        elif not merged.get(key) and value not in (None, "", []):
            merged[key] = value
    return canonicalize_record(merged)


def merge_records(existing: Iterable[dict], incoming: Iterable[dict]):
    records = []
    positions = {}
    errors = 0
    for item in existing:
        item = canonicalize_record(item)
        record_id = item.get("record_id")
        if not record_id or record_id in positions:
            errors += 1
            continue
        positions[record_id] = len(records)
        records.append(item)

    duplicates = 0
    unique_added = 0
    incoming_count = 0
    for item in incoming:
        incoming_count += 1
        item = canonicalize_record(item)
        record_id = item.get("record_id")
        if not record_id:
            errors += 1
            continue
        if record_id in positions:
            duplicates += 1
            index = positions[record_id]
            records[index] = _merge_record(records[index], item)
        else:
            positions[record_id] = len(records)
            records.append(item)
            unique_added += 1

    stats = {
        "incoming": incoming_count,
        "unique_added": unique_added,
        "duplicates": duplicates,
        "total": len(records),
    }
    if errors:
        stats["invalid_or_skipped"] = errors
    return records, stats


def load_records(path: Path) -> list[dict]:
    if not path.exists():
        return []
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError(f"Archive must be a JSON list: {path}")
    return [canonicalize_record(item) for item in value if isinstance(item, dict)]


def save_records_atomic(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f"{path.stem}-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump([canonicalize_record(item) for item in records], handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def backup_file(path: Path, backup_dir: Path | None = None) -> Path | None:
    if not path.exists():
        return None
    backup_dir = backup_dir or path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = backup_dir / f"{path.stem}.{stamp}{path.suffix}"
    target.write_bytes(path.read_bytes())
    return target


def write_manifest(path: Path, manifest: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f"{path.stem}-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(manifest, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def append_import_history(path: Path, event: dict) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "event_id": str(uuid.uuid4()),
        "created_at": utc_now(),
        **event,
    }
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")
    return payload


def read_import_history(path: Path, limit: int | None = None) -> list[dict]:
    if not path.exists():
        return []
    events = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    if limit is not None:
        return events[-limit:]
    return events
