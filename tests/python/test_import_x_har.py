from pathlib import Path

from scripts.import_x_har import import_har


ROOT = Path(__file__).resolve().parents[2]
HAR = ROOT / "data" / "raw" / "x" / "x.com.initial.har"


def test_real_x_har_has_twenty_unique_bookmarks():
    records, requests = import_har(HAR)

    assert requests == 1
    assert len(records) == 20
    assert len({record["record_id"] for record in records}) == 20
    assert all(record["record_id"].startswith("x:") for record in records)
    assert all(record["url"].startswith("https://x.com/") for record in records)


def test_x_records_keep_text_author_and_status():
    records, _ = import_har(HAR)

    first = records[0]
    assert first["text"]
    assert first["author"]
    assert first["handle"].startswith("@")
    assert first["status"] == "captured"
    assert first["classification_status"] == "pending"
