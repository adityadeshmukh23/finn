import json

from scripts import build_static


def test_static_demo_covers_every_recorded_day(tmp_path):
    m = build_static.build(tmp_path)
    files = {p.name for p in tmp_path.iterdir()}
    assert {f"digest-{d}-{h}.json" for d in m["days"] for h in m["windows"]} | {"manifest.json", "market.json", "timeline.json", "research"} == files
    last = json.loads((tmp_path / f"digest-{m['to']}-168.json").read_text())
    assert last["source"]["source"] == "bundled" and last["source"]["as_of"] == m["fetched_at"]
    assert last["window"]["end"] == m["fetched_at"]            # latest day ends when the snapshot was taken
    assert last["counts"]["shown"] + last["counts"]["hidden"] == last["counts"]["total"]


def test_timeline_lists_every_company_filing_newest_first(tmp_path):
    m = build_static.build(tmp_path)
    tl = json.loads((tmp_path / "timeline.json").read_text())
    eq = tl["EQUITASBNK"]
    assert [r["ts"] for r in eq] == sorted((r["ts"] for r in eq), reverse=True)
    assert all(r["ts"][:10] <= m["to"] for r in eq)
    assert any(r["category"] == "management_change" and r.get("people") for r in eq)    # the 29 Oct MD & CEO exit
    # Figures only reach the timeline through the same results view as the card, low confidence included as low.
    assert any(r.get("results", {}).get("status") == "extracted" for rows in tl.values() for r in rows)


def test_bundled_prices_cover_the_demo_and_fire_the_default_alerts(tmp_path):
    m = build_static.build(tmp_path)
    mk = json.loads((tmp_path / "market.json").read_text())
    assert mk["through"] == m["to"]
    eq = {r[0]: r for r in mk["sessions"]["EQUITASBNK"]}
    _, _, chg, vol_x = eq["2026-10-29"]                       # results + MD & CEO exit day
    assert chg <= -4 and vol_x >= 2
    # Every session in the demo range has a 20-session baseline (the snapshot starts early enough).
    assert all(r[3] is not None for rows in mk["sessions"].values() for r in rows if r[0] >= m["from"])


def test_recorded_research_ships_with_the_demo(tmp_path):
    m = build_static.build(tmp_path)
    index = json.loads((tmp_path / "research" / "index.json").read_text())["companies"]
    assert [c["symbol"] for c in index] == m["research"]
    for c in index:
        rec = json.loads((tmp_path / "research" / f"{c['symbol']}.json").read_text())
        assert rec["scorecard"]["credibility"]["headline"] == c["headline"]
    assert not list((tmp_path / "research").glob("*.gz"))     # page text stays out of the web build
