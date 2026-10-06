"""Build the Anki deck (and a CSV) from src/_data/flashcards.json.

Run with:  npm run anki   (= uv run --with genanki python scripts/build_anki.py)

The deck and model IDs are fixed, and each note's GUID comes from its topic + front text,
so re-importing a newer deck updates existing cards instead of duplicating them.
"""
import csv
import json
import re
from pathlib import Path

import genanki

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "src" / "_data" / "flashcards.json"
OUT = ROOT / "assets" / "anki"

DECK_ID = 1_726_404_211
MODEL_ID = 1_726_404_212


def inline_md(text: str) -> str:
    """The small subset of Markdown the cards use: **bold**, *em*, `code`."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<![*\w])\*([^*]+)\*(?![*\w])", r"<i>\1</i>", text)
    return text


def plain(text: str) -> str:
    return re.sub(r"[*`]", "", text)


CSS = """
.card { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; font-size: 20px;
        line-height: 1.5; text-align: left; color: #1c2421; background: #faf8f3; padding: 8px 4px; }
.nightMode.card, .night_mode .card { color: #e7ece9; background: #151b19; }
.topic { font: 600 12px/1 ui-monospace, Menlo, monospace; letter-spacing: .06em; text-transform: uppercase; color: #2f7d6d; }
.q { margin-top: 10px; font-weight: 600; }
.a { margin-top: 4px; }
code { font-family: ui-monospace, Menlo, monospace; font-size: .9em; background: rgba(127,127,127,.15); padding: 1px 4px; border-radius: 3px; }
hr#answer { margin: 16px 0; border: 0; border-top: 1px dashed #b9c2bd; }
"""

model = genanki.Model(
    MODEL_ID,
    "System Design Guide",
    fields=[{"name": "Front"}, {"name": "Back"}, {"name": "Topic"}],
    templates=[{
        "name": "Card 1",
        "qfmt": '<div class="topic">{{Topic}}</div><div class="q">{{Front}}</div>',
        "afmt": '{{FrontSide}}<hr id="answer"><div class="a">{{Back}}</div>',
    }],
    css=CSS,
)


class Note(genanki.Note):
    @property
    def guid(self):
        return genanki.guid_for(self.fields[2], self.fields[0])


def topic_titles() -> dict:
    """Map each card topic key to its page's navTitle/title from front matter."""
    titles = {}
    for md in list((ROOT / "src" / "topics").glob("*.md")) + list((ROOT / "src" / "practice").glob("*.md")):
        head = md.read_text().split("---")[1]
        get = lambda k: (re.search(rf"^{k}:\s*(.+)$", head, re.M) or [None, None])[1]
        key = get("cards") or md.stem
        titles[key.strip()] = (get("navTitle") or get("title")).strip().strip("\"'")
    return titles


def main():
    cards = json.loads(CARDS.read_text())
    titles = topic_titles()
    deck = genanki.Deck(DECK_ID, "System Design Guide")
    for c in cards:
        title = titles.get(c["topic"], c["topic"])
        deck.add_note(Note(
            model=model,
            fields=[inline_md(c["front"]), inline_md(c["back"]), title],
            tags=[f"sdg::{c['topic']}"],
        ))
    OUT.mkdir(parents=True, exist_ok=True)
    genanki.Package(deck).write_to_file(OUT / "system-design-guide.apkg")
    with open(OUT / "system-design-guide.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["front", "back", "topic"])
        for c in cards:
            w.writerow([plain(c["front"]), plain(c["back"]), titles.get(c["topic"], c["topic"])])
    unknown = sorted({c["topic"] for c in cards} - set(titles))
    if unknown:
        raise SystemExit(f"Cards reference unknown topics: {unknown}")
    print(f"Wrote {len(cards)} cards to {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
