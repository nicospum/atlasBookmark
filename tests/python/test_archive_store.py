from scripts.archive_store import merge_records


def test_merge_records_deduplicates_by_record_id_and_counts_duplicates():
    existing = [{"record_id": "x:1", "text": "old", "topics": ["IA"]}]
    incoming = [
        {"record_id": "x:1", "text": "old again", "topics": ["diseño"]},
        {"record_id": "x:2", "text": "new", "topics": []},
    ]

    merged, stats = merge_records(existing, incoming)

    assert [item["record_id"] for item in merged] == ["x:1", "x:2"]
    assert merged[0]["text"] == "old"
    assert merged[0]["topics"] == ["IA", "diseño"]
    assert stats == {"incoming": 2, "unique_added": 1, "duplicates": 1, "total": 2}
