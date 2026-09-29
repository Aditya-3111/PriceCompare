"""Shared helper: pull pack sizes (500 g, 1 kg, 1 ltr, 200 ml...) out of text."""
import re

_UNITS = r"kg|gm|g|ltrs|ltr|litres|litre|liters|liter|l|ml"

def extract_sizes(text):
    """-> set of (amount, unit) tuples, normalised to grams/millilitres."""
    if not text:
        return set()
    out = set()
    for n, u in re.findall(rf"(\d+(?:\.\d+)?)\s*({_UNITS})\b", text.lower()):
        n = float(n)
        if u == "kg":
            n, u = n * 1000, "g"
        elif u in ("gm", "g"):
            u = "g"
        elif u.startswith(("l", "ltr")) and u != "ml":
            n, u = n * 1000, "ml"
        out.add((round(n), u))
    return out