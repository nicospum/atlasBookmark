import json
from pathlib import Path

from openpyxl import load_workbook

from scripts.archive_store import append_import_history
from scripts.build_xlsx import build_workbook
from scripts.classify_topics import classify_text


def test_classification_uses_word_boundaries_not_substrings():
    rules = {"IA": ["ai"], "Viajes": ["paris"]}

    topics, matches = classify_text("The word paid and comparison should not trigger the short rules.", rules)

    assert topics == []
    assert matches == {}


def test_classification_can_use_domain_collection_and_hashtags():
    rules = {"Diseño": ["figma", "#ux"], "Viajes": ["bariloche"]}

    topics, matches = classify_text("Colección UX #ux desde figma.com sobre Bariloche", rules)

    assert topics == ["Diseño", "Viajes"]
    assert matches["Diseño"] == ["figma", "#ux"]
    assert matches["Viajes"] == ["bariloche"]


def test_import_history_appends_jsonl_events(tmp_path):
    history = tmp_path / "logs" / "imports.jsonl"

    append_import_history(history, {"kind": "x", "records": 2})
    append_import_history(history, {"kind": "instagram", "records": 1})

    events = [json.loads(line) for line in history.read_text(encoding="utf-8").splitlines()]
    assert [event["kind"] for event in events] == ["x", "instagram"]
    assert all(event["event_id"] for event in events)
    assert all(event["created_at"] for event in events)


def test_build_workbook_has_required_sheets_and_verified_rows(tmp_path):
    archive = tmp_path / "archive.json"
    manifest = tmp_path / "manifest.json"
    out = tmp_path / "atlas.xlsx"
    records = [
        {
            "record_id": "x:1",
            "platform": "X",
            "text": "AI product note",
            "author": "Ana",
            "handle": "@ana",
            "source": "Ana",
            "url": "https://x.com/ana/status/1",
            "external_urls": ["https://example.com/a"],
            "domain": "example.com",
            "published_at": "2025-01-01T00:00:00+00:00",
            "saved_at": "",
            "content_type": "post",
            "collections": [],
            "topics": ["IA", "Producto"],
            "subtopics": [],
            "entities": [],
            "language": "en",
            "summary": "",
            "has_media": False,
            "media_status": "not_requested",
            "media_paths": [],
            "capture_source": "x_har",
            "raw_file": "fixture.har",
            "status": "captured",
            "classification_status": "deterministic",
            "error": "",
        }
    ]
    archive.write_text(json.dumps(records), encoding="utf-8")
    manifest.write_text(json.dumps({"schema": "atlas-v1", "total_records": 1, "merge": {"duplicates": 0}}), encoding="utf-8")

    build_workbook(records, out, manifest_path=manifest)

    workbook = load_workbook(out, read_only=True)
    assert workbook.sheetnames == ["Resumen", "Todos", "Por tema", "Por fuente", "Errores", "Manifest"]
    assert workbook["Todos"].max_row == 2
    assert workbook["Por tema"].max_row == 3
