#!/usr/bin/env python3
"""Build a verified Excel workbook from the current canonical archive."""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

try:
    from .archive_store import canonicalize_record, load_records
except ImportError:
    from archive_store import canonicalize_record, load_records

HEADERS = [
    "record_id", "platform", "text", "author", "handle", "source", "url", "external_urls", "domain",
    "published_at", "saved_at", "content_type", "collections", "topics", "subtopics", "entities", "language",
    "summary", "has_media", "media_status", "media_paths", "media_urls", "capture_source", "raw_file",
    "status", "classification_status", "confidence", "classification_matches", "error",
]
HEADER_FILL = PatternFill("solid", fgColor="4F46E5")
ERROR_FILL = PatternFill("solid", fgColor="7F1D1D")


def cell_value(value):
    if isinstance(value, (list, dict)):
        if isinstance(value, list):
            return " | ".join(map(str, value))
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return value


def style_sheet(ws, table_name: str | None = None, error_header: bool = False):
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    fill = ERROR_FILL if error_header else HEADER_FILL
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = fill
        cell.alignment = Alignment(vertical="top")
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    for col in range(1, ws.max_column + 1):
        letter = get_column_letter(col)
        sample = [str(ws.cell(row=row, column=col).value or "") for row in range(1, min(ws.max_row, 40) + 1)]
        ws.column_dimensions[letter].width = min(70, max(12, max(len(value) for value in sample) + 2))
    if table_name and ws.max_row >= 2 and ws.max_column >= 1:
        table = Table(displayName=table_name, ref=ws.dimensions)
        table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
        ws.add_table(table)


def append_kv_sheet(ws, rows: Iterable[tuple[str, object]]):
    ws.append(["campo", "valor"])
    for key, value in rows:
        ws.append([key, cell_value(value)])
    style_sheet(ws)


def build_workbook(records: list[dict], output_path: Path, manifest_path: Path | None = None) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    normalized = [canonicalize_record(record) for record in records]
    manifest = {}
    if manifest_path and manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {"error": f"Manifest inválido: {manifest_path}"}

    topic_counts = Counter(topic for record in normalized for topic in record.get("topics", []))
    source_counts = Counter(record.get("source") or record.get("handle") or record.get("author") or record.get("domain") or "Sin fuente" for record in normalized)
    error_records = [record for record in normalized if record.get("error") or record.get("status") == "error"]
    pending = [record for record in normalized if not record.get("topics") or record.get("classification_status") == "pending"]

    wb = Workbook()
    ws = wb.active
    ws.title = "Resumen"
    append_kv_sheet(ws, [
        ("Generado", datetime.now(timezone.utc).isoformat()),
        ("Registros únicos", len(normalized)),
        ("Plataforma X", sum(1 for record in normalized if record.get("platform") == "X")),
        ("Plataforma Instagram", sum(1 for record in normalized if record.get("platform") == "Instagram")),
        ("Con media", sum(1 for record in normalized if record.get("has_media"))),
        ("Temas", len(topic_counts)),
        ("Fuentes", len(source_counts)),
        ("Pendientes de clasificación", len(pending)),
        ("Errores", len(error_records) + len(manifest.get("errors", []) if isinstance(manifest.get("errors"), list) else [])),
    ])

    all_ws = wb.create_sheet("Todos")
    all_ws.append(HEADERS)
    for record in normalized:
        all_ws.append([cell_value(record.get(header, "")) for header in HEADERS])
        url_cell = all_ws.cell(row=all_ws.max_row, column=HEADERS.index("url") + 1)
        if url_cell.value:
            url_cell.hyperlink = str(url_cell.value)
            url_cell.style = "Hyperlink"
    style_sheet(all_ws, "TodosLosGuardados")

    topic_ws = wb.create_sheet("Por tema")
    topic_ws.append(["tema", "guardados"])
    for topic, count in sorted(topic_counts.items(), key=lambda item: (-item[1], item[0])):
        topic_ws.append([topic, count])
    if not topic_counts:
        topic_ws.append(["Sin clasificar", len(normalized)])
    style_sheet(topic_ws, "GuardadosPorTema")

    source_ws = wb.create_sheet("Por fuente")
    source_ws.append(["fuente", "guardados"])
    for source, count in sorted(source_counts.items(), key=lambda item: (-item[1], item[0])):
        source_ws.append([source, count])
    style_sheet(source_ws, "GuardadosPorFuente")

    errors_ws = wb.create_sheet("Errores")
    errors_ws.append(["record_id", "archivo", "estado", "detalle"])
    for record in error_records:
        errors_ws.append([record.get("record_id"), record.get("raw_file"), record.get("status"), record.get("error")])
    for error in manifest.get("errors", []) if isinstance(manifest.get("errors"), list) else []:
        errors_ws.append(["", error.get("file", ""), "error", error.get("error", error.get("detail", ""))])
    if errors_ws.max_row == 1:
        errors_ws.append(["", "", "", "Sin errores registrados"])
    style_sheet(errors_ws, "ErroresImportacion", error_header=True)

    manifest_ws = wb.create_sheet("Manifest")
    manifest_ws.append(["campo", "valor"])
    manifest_ws.append(["schema", manifest.get("schema", "atlas-v1")])
    manifest_ws.append(["manifest_updated_at", manifest.get("updated_at", "")])
    manifest_ws.append(["manifest_total_records", manifest.get("total_records", "")])
    manifest_ws.append(["workbook_total_records", len(normalized)])
    manifest_ws.append(["manifest_merge", json.dumps(manifest.get("merge", {}), ensure_ascii=False, sort_keys=True)])
    manifest_ws.append(["sources", json.dumps(manifest.get("sources", []), ensure_ascii=False)])
    manifest_ws.append(["archive_verified", "yes"])
    style_sheet(manifest_ws, "ManifestImportacion")

    wb.save(output_path)
    verify_workbook(output_path, expected_records=len(normalized))
    return output_path


def verify_workbook(path: Path, expected_records: int) -> None:
    workbook = load_workbook(path, read_only=True)
    required = ["Resumen", "Todos", "Por tema", "Por fuente", "Errores", "Manifest"]
    if workbook.sheetnames != required:
        raise RuntimeError(f"Workbook sheets mismatch: {workbook.sheetnames}")
    rows = workbook["Todos"].max_row - 1
    if rows != expected_records:
        raise RuntimeError(f"Workbook row count mismatch: {rows} != {expected_records}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=Path("data/normalized/archive.json"))
    parser.add_argument("--manifest", type=Path, default=Path("data/normalized/manifest.json"))
    parser.add_argument("--out", type=Path, default=Path("exports/atlas_x_test.xlsx"))
    parser.add_argument("--json-out", type=Path, default=Path("exports/x_bookmarks.normalized.json"))
    args = parser.parse_args()
    records = load_records(args.archive)
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    xlsx_path = build_workbook(records, args.out, manifest_path=args.manifest)
    print(json.dumps({"records": len(records), "json": str(args.json_out), "xlsx": str(xlsx_path), "verified": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
