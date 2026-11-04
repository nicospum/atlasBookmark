#!/usr/bin/env python3
"""Ingest one or more X HAR captures into the local canonical archive."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from archive_store import (
    append_import_history,
    backup_file,
    load_records,
    merge_records,
    save_records_atomic,
    utc_now,
    write_manifest,
)
from import_x_har import import_har


def write_checkpoint(path: Path, payload: dict) -> None:
    write_manifest(path, payload)


def ingest(paths: list[Path], archive: Path, manifest_path: Path, history_path: Path, checkpoint_dir: Path):
    existing = load_records(archive)
    backup = backup_file(archive)
    incoming = []
    source_stats = []
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    started_at = utc_now()

    for index, path in enumerate(paths, start=1):
        records, requests = import_har(path)
        if requests == 0 or not records:
            raise RuntimeError(f"El archivo no contiene una respuesta Bookmarks válida: {path}")
        incoming.extend(records)
        source = {"file": str(path), "bookmark_requests": requests, "records": len(records), "processed_at": utc_now()}
        source_stats.append(source)
        write_checkpoint(checkpoint_dir / "x-import.last.json", {
            "kind": "x",
            "started_at": started_at,
            "updated_at": utc_now(),
            "current_index": index,
            "total_inputs": len(paths),
            "last_file": str(path),
            "seen_record_ids": sorted({record["record_id"] for record in incoming}),
            "sources": source_stats,
        })

    merged, stats = merge_records(existing, incoming)
    save_records_atomic(archive, merged)
    manifest = {
        "schema": "atlas-v1",
        "updated_at": utc_now(),
        "sources": source_stats,
        "merge": stats,
        "total_records": len(merged),
        "backup": str(backup) if backup else "",
        "checkpoint": str(checkpoint_dir / "x-import.last.json"),
    }
    write_manifest(manifest_path, manifest)
    event = append_import_history(history_path, {"kind": "x", "status": "ok", "inputs": [str(path) for path in paths], **manifest})
    manifest["history_event_id"] = event["event_id"]
    write_manifest(manifest_path, manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("har", nargs="+", type=Path)
    parser.add_argument("--archive", type=Path, default=Path("data/normalized/archive.json"))
    parser.add_argument("--manifest", type=Path, default=Path("data/normalized/manifest.json"))
    parser.add_argument("--history", type=Path, default=Path("data/logs/imports.jsonl"))
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("data/checkpoints"))
    args = parser.parse_args()
    try:
        manifest = ingest(args.har, args.archive, args.manifest, args.history, args.checkpoint_dir)
        print(json.dumps(manifest, ensure_ascii=False))
    except Exception as exc:
        append_import_history(args.history, {"kind": "x", "status": "error", "inputs": [str(path) for path in args.har], "error": str(exc)})
        raise


if __name__ == "__main__":
    main()
