import json
from pathlib import Path

from scripts.import_instagram_export import import_path


def test_import_instagram_fixture_extracts_posts_and_collections(tmp_path):
    fixture = tmp_path / "saved.json"
    fixture.write_text(json.dumps({
        "collections": [
            {"name": "Diseño", "items": [{"href": "https://www.instagram.com/p/ABC123/", "timestamp": 1700000000, "caption": "Figma systems"}]},
            {"name": "Viajes", "items": [{"href": "https://www.instagram.com/reel/XYZ789/", "timestamp": 1700000100, "caption": "Viaje"}]},
        ]
    }), encoding="utf-8")

    records, errors = import_path(fixture)

    assert errors == []
    assert len(records) == 2
    assert records[0]["platform"] == "Instagram"
    assert records[0]["collections"] == ["Diseño"]
    assert records[0]["record_id"].startswith("instagram:")
