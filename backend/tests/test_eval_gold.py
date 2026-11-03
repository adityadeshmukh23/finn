import csv
import re

import pytest

from finn import llm
from finn.config import settings
from scripts import eval_gold

EVAL = settings.data_dir / "eval"


def _csv(name):
    with (EVAL / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


BLIND, KEY = _csv("gold_blind.csv"), _csv("gold_key.csv")
ROWS = eval_gold.labelled()


def test_labels_and_the_sample_need_no_model_and_no_network(monkeypatch):
    def refuse(*a, **k):
        raise AssertionError("no model calls or fetches in E1")
    monkeypatch.setattr(llm, "call", refuse)
    monkeypatch.setattr("finn.http.get", refuse)
    assert len(eval_gold.sample(eval_gold.labelled())) == eval_gold.SIZE


def test_the_sample_is_fixed_by_its_seed():
    ids = lambda rows: [r["a"].id for r in rows]  # noqa: E731
    assert ids(eval_gold.sample(ROWS)) == ids(eval_gold.sample(ROWS))
    assert ids(eval_gold.sample(ROWS)) != ids(eval_gold.sample(ROWS, seed=eval_gold.SEED + 1))
    assert [b["id"] for b in BLIND] == ids(eval_gold.sample(ROWS))


def test_every_label_with_filings_is_covered_and_thin_labels_are_whole():
    sizes = {}
    for r in ROWS:
        sizes[r["label"]] = sizes.get(r["label"], 0) + 1
    q = eval_gold.quotas(sizes)
    assert sum(q.values()) == eval_gold.SIZE
    assert all(q[k] == n for k, n in sizes.items() if n <= eval_gold.THIN)
    assert all(q[k] >= 1 for k in sizes)
    picked = {r["finn_label"] for r in KEY}
    assert picked == set(sizes)


def test_quotas_add_up_on_other_shapes():
    assert eval_gold.quotas({"a": 3, "b": 100, "c": 50}, size=30) == {"a": 3, "b": 18, "c": 9}


def test_the_blind_file_carries_nothing_from_finn():
    assert list(BLIND[0]) == eval_gold.BLIND_COLUMNS == ["id", "company", "filed_date", "headline", "excerpt", "my_label"]
    assert all(b["my_label"] == "" for b in BLIND)
    subjects = {r["a"].id: eval_gold.headline(r["a"]) for r in ROWS}
    assert all(b["headline"] == subjects[b["id"]] for b in BLIND)    # NSE's words, never FINN's headline or a model's summary
    assert [b["id"] for b in BLIND] != [k["id"] for k in KEY]        # the order doesn't line up with the key


def test_the_key_is_finn_s_labels_on_the_same_filings():
    assert {k["id"] for k in KEY} == {b["id"] for b in BLIND}
    finn = {r["a"].id: r["label"] for r in ROWS}
    # If this fails after labelling starts, the classifier moved under the gold set: score against the committed key and say so.
    assert all(k["finn_label"] == finn[k["id"]] for k in KEY)
    assert {k["seed"] for k in KEY} == {str(eval_gold.SEED)}


def test_excerpts_are_short_or_say_summary_only():
    assert all(len(b["excerpt"]) <= eval_gold.EXCERPT + 1 for b in BLIND)
    assert eval_gold.excerpt(None) == eval_gold.SUMMARY_ONLY
    assert eval_gold.excerpt("   ") == eval_gold.SUMMARY_ONLY
    assert eval_gold.excerpt("Letterhead, Phone 12345. Dear Sir, Sub: Regulation 30. We wish to inform that the board met today and approved it.") \
        == "We wish to inform that the board met today and approved it."


def test_the_summary_only_count_in_eval_md_is_the_real_one():
    n = sum(b["excerpt"] == eval_gold.SUMMARY_ONLY for b in BLIND)
    doc = (settings.data_dir.parent / "docs" / "EVAL.md").read_text()
    assert f"{n} of {len(BLIND)} rows say \"summary only\"" in doc


def test_categories_list_every_glossary_label_with_an_example_and_no_counts():
    md = (EVAL / "categories.md").read_text()
    for label, what, example in eval_gold.CATEGORIES:
        assert f"`{label}`" in md and what in md and example in md
    assert len(eval_gold.CATEGORIES) == 17
    assert "cannot_tell" in md
    assert not any(example in b["headline"] or example in b["excerpt"] for _, _, example in eval_gold.CATEGORIES for b in BLIND)


@pytest.mark.parametrize("name", ["gold_blind.csv", "gold_key.csv", "categories.md"])
def test_the_firm_s_name_is_nowhere(name):
    assert not re.search(r"\benam\b", (EVAL / name).read_text(encoding="utf-8-sig"), re.I)


@pytest.mark.parametrize("words", [r"pledg", r"insider|\bsast\b", r"bonus|sub-?division|split"])
def test_categories_with_no_filings_have_none_in_nse_s_own_words_either(words):
    assert not [r["a"].id for r in ROWS if re.search(words, f"{r['a'].desc} {r['a'].text}", re.I)]
