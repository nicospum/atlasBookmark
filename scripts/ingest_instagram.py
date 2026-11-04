#!/usr/bin/env python3
"""Ingest official Instagram JSON/ZIP exports into the local archive."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from archive_store import append_import_history, backup_file, load_records, merge_records, save_records_atomic, utc_now, write_manifest
from import_instagram_export import import_path


def ingest(path: Path, archive: Path, manifest_path: Path, history_path: Path, checkpoint_dir: Path):
    existing = load_records(archive)
    backup = backup_file(archive)
    incoming, errors = import_path(path)
    if not incoming and not errors:
        raise RuntimeError(f"No se detectaron guardados de Instagram en: {path}")
    merged, stats = merge_records(existing, incoming)
    save_records_atomic(archive, merged)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = checkpoint_dir / "instagram-import.last.json"
    checkpoint_payload = {
        "kind": "instagram",
        "updated_at": utc_now(),
        "file": str(path),
        "records": len(incoming),
        "errors": errors,
        "record_ids": sorted(record["record_id"] for record in incoming),
    }
    write_manifest(checkpoint, checkpoint_payload)
    manifest = {
        "schema": "atlas-v1",
        "updated_at": utc_now(),
        "sources": [{"file": str(path), "records": len(incoming), "errors": len(errors)}],
        "merge": stats,
        "total_records": len(merged),
        "errors": errors,
        "backup": str(backup) if backup else "",
        "checkpoint": str(checkpoint),
    }
    event = append_import_history(history_path, {"kind": "instagram", "status": "ok", "input": str(path), **manifest})
    manifest["history_event_id"] = event["event_id"]
    write_manifest(manifest_path, manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("export", type=Path)
    parser.add_argument("--archive", type=Path, default=Path("data/normalized/archive.json"))
    parser.add_argument("--manifest", type=Path, default=Path("data/normalized/manifest.json"))
    parser.add_argument("--history", type=Path, default=Path("data/logs/imports.jsonl"))
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("data/checkpoints"))
    args = parser.parse_args()
    try:
        manifest = ingest(args.export, args.archive, args.manifest, args.history, args.checkpoint_dir)
        print(json.dumps(manifest, ensure_ascii=False))
    except Exception as exc:
        append_import_history(args.history, {"kind": "instagram", "status": "error", "input": str(args.export), "error": str(exc)})
        raise


if __name__ == "__main__":
    main()
