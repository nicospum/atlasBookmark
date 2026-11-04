#!/usr/bin/env python3
"""Apply deterministic, auditable topic rules to the local archive."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from unicodedata import normalize

try:
    from .archive_store import load_records, save_records_atomic
except ImportError:
    from archive_store import load_records, save_records_atomic


def load_rules(path: Path) -> dict[str, list[str]]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_text(value: str) -> str:
    decomposed = normalize("NFKD", value or "")
    without_marks = "".join(ch for ch in decomposed if not re.match(r"[\u0300-\u036f]", ch))
    return without_marks.lower()


def term_matches(haystack: str, term: str) -> bool:
    needle = normalize_text(term.strip())
    if not needle:
        return False
    if needle.startswith("#"):
        return re.search(rf"(?<![\w]){re.escape(needle)}(?![\w-])", haystack) is not None
    if "." in needle or "/" in needle:
        return needle in haystack
    return re.search(rf"(?<![\w@#]){re.escape(needle)}(?![\w-])", haystack) is not None


def classify_text(text: str, rules: dict[str, list[str]] | None = None):
    if rules is None:
        rules = load_rules(Path("data/topic_rules.json"))
    haystack = normalize_text(f" {text} ")
    topics = []
    matches = {}
    for topic, terms in rules.items():
        matched = [term.strip() for term in terms if term_matches(haystack, term)]
        if matched:
            topics.append(topic)
            matches[topic] = matched
    return topics, matches


def classify_record(record: dict, rules: dict[str, list[str]]):
    collections = " ".join(record.get("collections") or [])
    external_urls = " ".join(record.get("external_urls") or [])
    text = " ".join([
        record.get("text", ""),
        record.get("domain", ""),
        record.get("author", ""),
        record.get("handle", ""),
        collections,
        external_urls,
    ])
    topics, matches = classify_text(text, rules)
    confidence = min(0.95, 0.45 + 0.12 * sum(len(values) for values in matches.values())) if topics else ""
    return topics, matches, confidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=Path("data/normalized/archive.json"))
    parser.add_argument("--rules", type=Path, default=Path("data/topic_rules.json"))
    parser.add_argument("--force", action="store_true", help="Reclassify records even if they were manually corrected.")
    args = parser.parse_args()
    records = load_records(args.archive)
    rules = load_rules(args.rules)
    classified = 0
    preserved_manual = 0
    for record in records:
        if record.get("classification_status") == "manual" and not args.force:
            preserved_manual += 1
            if record.get("topics"):
                classified += 1
            continue
        topics, matches, confidence = classify_record(record, rules)
        record["topics"] = topics
        record["classification_status"] = "deterministic" if topics else "pending"
        record["classification_matches"] = matches
        record["confidence"] = confidence
        if topics:
            classified += 1
    save_records_atomic(args.archive, records)
    print(json.dumps({"records": len(records), "classified": classified, "pending": len(records) - classified, "preserved_manual": preserved_manual}, ensure_ascii=False))


if __name__ == "__main__":
    main()
