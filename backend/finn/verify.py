"""Citation verifier: a model's quote or number counts only if it's actually in the cited text.

Deterministic and strict on purpose. Whitespace, case, quote marks and Indian digit grouping
are normalised; anything else that differs fails, and the caller falls back to showing the filing.
"""
import re

_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def norm(s: str) -> str:
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-").replace("₹", "rs ")
    return re.sub(r"\s+", " ", s).strip().lower()


def quote_in(quote: str, text: str) -> bool:
    """Exact after normalising. PDF text extraction splits words ("202 7", "appel late"), so spaces are
    ignored in the comparison; every other character must match."""
    q = norm(quote).strip(" .\"'")
    return len(q.split()) >= 4 and q.replace(" ", "") in norm(text).replace(" ", "")


def rejoin_numbers(s: str) -> str:
    """Undo PDF extraction splitting a printed number: '9 ,976 .51' -> '9,976.51', '1,391.5 2' -> '1,391.52',
    '2 ,8 25.61' -> '2,825.61'. A number that already has its two decimals is never joined to the next
    one, so adjacent table columns stay separate."""
    s = re.sub(r"(?<=\d)\s*([,.])\s*(?=\d)", r"\1", s)
    s = re.sub(r"(\.\d)\s+(\d)(?!\d)", r"\1\2", s)          # split decimals
    s = re.sub(r"(,\d{1,2})\s+(\d)", r"\1\2", s)              # split digit group after a comma
    return s


def numbers(s: str) -> set[str]:
    """'1,23,456.70' -> '123456.7'; years and single digits are kept too, they must match as well."""
    out = set()
    for m in _NUM.findall(rejoin_numbers(s)):
        n = m.replace(",", "")
        if "." in n:
            n = n.rstrip("0").rstrip(".")
        out.add(n.lstrip("0") or "0")
    return out


def numbers_in(claim: str, text: str) -> bool:
    """Every number in the claim appears somewhere in the source text."""
    return numbers(claim) <= numbers(text)


def number_in(value: float, text: str) -> bool:
    """A single extracted figure appears in the text as printed (any grouping, trailing zeros)."""
    v = f"{value:.2f}".rstrip("0").rstrip(".")
    return v.lstrip("-") in numbers(text)
