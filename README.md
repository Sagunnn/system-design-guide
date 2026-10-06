# System Design Guide

A study guide for system design interviews: 19 fundamentals, 10 worked interview questions and a flashcard deck.
Live at https://systemdesign.sagunpradhan.com.np

## Run it

```sh
npm install
npm start          # dev server with live reload
npm run build      # writes _site/
npm run anki       # rebuilds assets/anki/*.apkg and *.csv from the flashcards (needs uv)
```

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).
The Anki files are committed, so run `npm run anki` after editing flashcards.

## Where things live

| Path | What |
|---|---|
| `src/topics/*.md` | Fundamentals, ordered by `order` in front matter |
| `src/practice/*.md` | Interview walkthroughs; `cards:` names their flashcard key |
| `src/_data/flashcards.json` | Every flashcard: `{ topic, front, back }` (topic = page slug or `cards` key) |
| `eleventy.config.js` | Diagram renderer and shortcodes |
| `assets/css/guide.css`, `assets/js/guide.js` | Styles; theme, search, progress, quiz |

## Writing content

Diagrams are drawn at build time from a small text spec:

```njk
{% diagram "Caption" %}
lb: Load balancer [lb] @ 1,1
db: Primary DB\n(Postgres) [db] @ 2,1
[[Region A]] @ 0,0 - 2,2
lb -> db : writes
lb --> db : async
{% enddiagram %}
```

Node kinds: `client lb service db cache queue cdn store worker ext`. Positions are grid `col,row` (fractions allowed).
Edges: `->` arrow, `-->` dashed (async), `<->` both ways, `--` plain line.

Other shortcodes: `{% callout "tip|warn|interview|think", "Title" %}…{% endcallout %}` and
`{% procon %}pros…---cons---cons…{% endprocon %}` (or `{% procon "A", "B" %}` to compare two options).
