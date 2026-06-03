#!/usr/bin/env python3
import csv
import json
import re
from collections import Counter
from datetime import datetime
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "emerging_minds_resource_catalogue.csv"
STATIC_DIR = ROOT


def parse_year(value):
    if not value:
        return ""
    match = re.match(r"(\d{4})", value)
    return match.group(1) if match else ""


def load_resources():
    with DATA_PATH.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    for idx, row in enumerate(rows, 1):
        row["id"] = idx
        row["year"] = parse_year(row.get("last_modified", ""))
        row["last_modified_label"] = row.get("last_modified", "")[:10]
        row["search_blob"] = " ".join(
            [
                row.get("title", ""),
                row.get("synopsis", ""),
                row.get("catalogue_group", ""),
                row.get("resource_type", ""),
                row.get("page_detail", ""),
                row.get("year", ""),
            ]
        ).lower()
    return rows


RESOURCES = load_resources()


def facet_counts(rows, field):
    return [
        {"value": key, "count": count}
        for key, count in sorted(Counter(r[field] for r in rows if r.get(field)).items())
    ]


def as_int(value, default, minimum=1, maximum=100):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def filtered_resources(params):
    query = params.get("q", [""])[0].strip().lower()
    groups = set(params.get("group", []))
    types = set(params.get("type", []))
    years = set(params.get("year", []))

    rows = RESOURCES
    if query:
        terms = [term for term in re.split(r"\s+", query) if term]
        rows = [r for r in rows if all(term in r["search_blob"] for term in terms)]
    if groups:
        rows = [r for r in rows if r["catalogue_group"] in groups]
    if types:
        rows = [r for r in rows if r["resource_type"] in types]
    if years:
        rows = [r for r in rows if r["year"] in years]

    sort = params.get("sort", ["title"])[0]
    reverse = False
    if sort == "newest":
        key = lambda r: r["last_modified"]
        reverse = True
    elif sort == "oldest":
        key = lambda r: r["last_modified"]
    elif sort == "type":
        key = lambda r: (r["resource_type"], r["title"].lower())
    else:
        key = lambda r: r["title"].lower()
    return sorted(rows, key=key, reverse=reverse)


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format, *args):
        return

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/resources":
            params = parse_qs(parsed.query)
            rows = filtered_resources(params)
            page = as_int(params.get("page", ["1"])[0], 1, maximum=10_000)
            page_size = as_int(params.get("page_size", ["24"])[0], 24, maximum=96)
            start = (page - 1) * page_size
            end = start + page_size
            self.send_json(
                {
                    "total": len(rows),
                    "page": page,
                    "page_size": page_size,
                    "items": [
                        {k: v for k, v in row.items() if k != "search_blob"}
                        for row in rows[start:end]
                    ],
                }
            )
            return

        if parsed.path == "/api/facets":
            years = facet_counts(RESOURCES, "year")
            years.sort(key=lambda item: item["value"], reverse=True)
            self.send_json(
                {
                    "generated_at": datetime.now().isoformat(timespec="seconds"),
                    "total": len(RESOURCES),
                    "groups": facet_counts(RESOURCES, "catalogue_group"),
                    "types": facet_counts(RESOURCES, "resource_type"),
                    "years": years,
                }
            )
            return

        if parsed.path == "/api/health":
            self.send_json({"ok": True, "resources": len(RESOURCES)})
            return

        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()


def main():
    host = "0.0.0.0"
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), DashboardHandler)
    print(f"Emerging Minds dashboard running at http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
