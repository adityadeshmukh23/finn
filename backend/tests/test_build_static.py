import json

from scripts import build_static


def test_static_demo_covers_every_recorded_day(tmp_path):
    m = build_static.build(tmp_path)
    files = {p.name for p in tmp_path.iterdir()}
    assert {f"digest-{d}-{h}.json" for d in m["days"] for h in m["windows"]} | {"manifest.json"} == files
    last = json.loads((tmp_path / f"digest-{m['to']}-168.json").read_text())
    assert last["source"]["source"] == "bundled" and last["source"]["as_of"] == m["fetched_at"]
    assert last["window"]["end"] == m["fetched_at"]            # latest day ends when the snapshot was taken
    assert last["counts"]["shown"] + last["counts"]["hidden"] == last["counts"]["total"]
