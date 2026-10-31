from finn import mgmt

TEXT = """Resignation of Mr. A. B. Kumar as Managing Director & CEO with effect from October 29, 2026.
Mr. Kumar has resigned to pursue opportunities outside the organisation, as stated in his letter.
Brief profile: Ms. C. Rao is a qualified Chartered Accountant with over 18 years of experience across audit and treasury."""


def change(**kw):
    base = {"person": "A. B. Kumar", "role": "Managing Director & CEO", "change": "resigned",
            "effective": "October 29, 2026", "reason": "to pursue opportunities outside the organisation",
            "reason_quote": "has resigned to pursue opportunities outside the organisation", "profile": "",
            "profile_quote": "", "page": 1}
    return base | kw


def test_backed_fields_survive():
    c = mgmt.check(change(), TEXT)
    assert c["verified"] and c["reason"] and c["effective"] == "October 29, 2026"


def test_unbacked_fields_are_blanked_not_shown():
    c = mgmt.check(change(effective="November 1, 2026", reason_quote="resigned due to ill health"), TEXT)
    assert c["verified"] and c["effective"] == "" and c["reason"] == ""


def test_profile_needs_its_quote_and_its_numbers():
    ok = change(person="C. Rao", change="appointed", profile="Chartered Accountant, 18 years in audit and treasury",
                profile_quote="is a qualified Chartered Accountant with over 18 years of experience")
    assert mgmt.check(ok, TEXT)["profile"]
    assert not mgmt.check(ok | {"profile": "Chartered Accountant, 28 years in audit"}, TEXT)["profile"]


def test_a_person_not_named_in_the_filing_is_dropped():
    assert not mgmt.check(change(person="Someone Else"), TEXT)["verified"]


def test_people_dedupes_repeat_filings_and_shows_reasons_for_exits_only():
    exit_ = mgmt.check(change(), TEXT)
    sparse = exit_ | {"reason": "", "effective": ""}
    hire = mgmt.check(change(person="C. Rao", change="appointed", reason="on the recommendation of the NRC",
                             reason_quote="qualified Chartered Accountant with over 18 years"), TEXT)
    recs = [{"status": "read", "url": "u", "changes": [sparse]},
            {"status": "read", "url": "u", "changes": [exit_, hire]}]
    out = mgmt.people(recs)
    assert [(p["person"], p["change"]) for p in out] == [("A. B. Kumar", "resigned"), ("C. Rao", "appointed")]
    assert out[0]["reason"] and out[0]["effective"]          # the fuller of the two duplicate rows
    assert out[1]["reason"] == ""                            # appointment "reasons" are process, not shown
