import dataclasses
import json
from datetime import date

from finn import http
from finn.sources import nse


def _settings(tmp_path):
    return dataclasses.replace(nse.settings, data_dir=tmp_path)


def _write_snapshot(tmp_path):
    p = tmp_path / "snapshots" / nse.SNAPSHOT
    p.parent.mkdir(parents=True)
    items = [
        {"id": "1", "symbol": "AAA", "company": "Alpha", "desc": "Resignation", "text": "CEO resigns",
         "url": "u", "ts": "2026-10-20T10:00:00+05:30"},
        {"id": "2", "symbol": "ZZZ", "company": "Other", "desc": "Resignation", "text": "x",
         "url": "u", "ts": "2026-10-20T10:00:00+05:30"},
    ]
    p.write_text(json.dumps({"fetched_at": "2026-10-30T20:00:00+05:30", "from": "2026-10-09", "to": "2026-10-30", "items": items}))


def _fail(*a, **k):
    raise http.FetchError("www.nseindia.com returned 403")


def test_falls_back_to_snapshot_silently(tmp_path, monkeypatch):
    monkeypatch.setattr(nse, "settings", _settings(tmp_path))
    monkeypatch.setattr(nse, "fetch_range", _fail)
    _write_snapshot(tmp_path)
    items, status = nse.announcements(date(2026, 10, 19), date(2026, 10, 21), {"AAA"})
    assert [a.symbol for a in items] == ["AAA"]
    assert status.source == "snapshot" and status.as_of == "2026-10-30T20:00:00+05:30"
    assert "403" in status.message and "only covers" not in status.message


def test_snapshot_coverage_gap_is_stated(tmp_path, monkeypatch):
    monkeypatch.setattr(nse, "settings", _settings(tmp_path))
    monkeypatch.setattr(nse, "fetch_range", _fail)
    _write_snapshot(tmp_path)
    _, status = nse.announcements(date(2026, 9, 1), date(2026, 9, 3), {"AAA"})
    assert "only covers 2026-10-09 to 2026-10-30" in status.message


def test_no_snapshot_reports_unavailable(tmp_path, monkeypatch):
    monkeypatch.setattr(nse, "settings", _settings(tmp_path))
    monkeypatch.setattr(nse, "fetch_range", _fail)
    items, status = nse.announcements(date(2026, 10, 19), date(2026, 10, 21), {"AAA"})
    assert items == [] and status.source == "unavailable"
