# stovenly.com — AI Project Reference

Personal creative writing portfolio (poetry & short fiction) at **stovenly.com**.

## Tech Stack

- **Static site generator**: Eleventy (11ty) v3
- **Templating**: Nunjucks (`.njk`)
- **Content**: Markdown with YAML front matter
- **Styling**: Single plain CSS file (no framework, no preprocessor)
- **Hosting**: GitHub Pages from the `docs/` directory
- **Minimal JavaScript** on the front end: an inline theme resolver (must run
  before first paint) and the header menu controller. Nothing else.

## Project Structure

```
src/                        # All source files
  _includes/                # Nunjucks layouts
    base.njk                #   Main HTML shell (header, nav, footer)
    poem.njk                #   Poem article layout (extends base)
    story.njk               #   Story article layout with word count (extends base)
    listing-item.njk        #   Reusable macro for listing items (used by index, poems, stories)
  poems/                    # Poem markdown files
  stories/                  # Story markdown files
  index.njk                 # Homepage
  poems.njk                 # Poems listing page
  stories.njk               # Stories listing page
  404.njk                   # Error page
static/                     # Passthrough static assets (copied to output root)
  css/style.css             #   Single stylesheet
  favicon.ico
  CNAME                     #   GitHub Pages custom domain (stovenly.com)
util/
  minify.js                 # Post-build HTML/CSS minifier + class-name obfuscator
  scriv_to_text.py          # Scrivener export helper
docs/                       # Generated output (committed to repo, served by GitHub Pages)
.eleventy.js                # Eleventy config (collections, markdown-it, passthrough copy, minify hook)
```

## Key Configuration (.eleventy.js)

- **Input dir**: `src/` — **Output dir**: `docs/`
- **Markdown-it** with `html: true`, `breaks: true`, `linkify: true`
- **Passthrough copy**: `static/` → output root
- **Two collections**, both sorted by `order` front matter field:
  - `poems` — all `src/poems/*.md`
  - `stories` — all `src/stories/*.md`

## Content Front Matter

**Poems** (`src/poems/*.md`):
```yaml
title: "Poem Title"
layout: poem.njk
permalink: "/poems/{{ page.fileSlug }}/"
order: 10          # Increments of 10 for easy insertion
year: 2016         # Year written — displayed as subtext
```

**Stories** (`src/stories/*.md`):
```yaml
title: "Story Title"
layout: story.njk
permalink: "/stories/{{ page.fileSlug }}/"
wordcount: 1200    # Displayed on the page
order: 10
year: 2014         # Year written — displayed as "year · wordcount words"
blurb: "..."       # One-sentence teaser shown under the story on /stories (see Story Blurbs)
```

## Story Blurbs

Each story has a `blurb` in its front matter: a very short teaser shown under the
title on the `/stories` listing only (not the homepage, not on the story page). It's
styled small and muted (`.listing-blurb`).

A blurb is a teaser, not a summary. It introduces the *setup* and makes the reader
want to find out the rest. It is **not** a logline that states conflict + stakes +
resolution — that gives away too much. Think back-cover hook, not plot synopsis.

Hard rules (these come from direct author feedback — follow them):

- **Exposition, never plot.** Lead with the world, the setting, the character's
  situation — the stuff true on page one, before anything happens. NEVER the inciting
  incident, the conflict, the turn, the twist, or the ending.
  - ✓ "A drifter at the bottom of the world." ✗ "...and someone already knows he's there."
  - ✓ "Scavengers hunt a dead world for buried power." ✗ "...and something is guarding it."
- **Never reveal the point.** No twists, and no stating the story's theme or hidden
  conceit — even obliquely. If the reader has to finish the story to *get* something,
  the blurb must not get it for them.
  - ✗ "a trip that was never really about the trip" (states the theme)
  - Rooms is secretly about doors as people the author knew → the blurb must NOT hint that.
- **Center the character/situation, not props or details.** "A drifter at the bottom of
  the world," not "Two guns in the glovebox."
- **Very short.** A single image — one short clause or fragment, ~5–10 words. Shorter and
  more evocative beats complete and explanatory.
- **No fake-short.** Don't dodge brevity by welding two long clauses with a comma
  ("long phrase, and another long phrase"). One image, then stop.
- **No A, B, and C lists.** The three-part "X, one Y, and a Z" / "X, and Y, and Z" cadence
  reads as filler and as AI. Pick one image instead.
- **No meta.** Never reference the medium or the writing itself — not the word count
  ("two hundred words..."), not "a story about...", not the form.
- **Don't sound AI-generated.** Avoid tidy summary rhythm and the compound-list tell.
  Use vivid, specific, slightly off-kilter phrasing. Read it aloud; if it sounds like a
  pitch deck, rewrite it.
- **Match the tone** to the story (tense for a thriller, wry for a comedy).
- **When in doubt, cut toward less.** A blurb that's too vague is better than one that
  spoils.

## Build & Deploy

1. Edit content in `src/`
2. Run `npm run build` to build into `docs/`
3. Commit the `docs/` folder and push — GitHub Pages serves it automatically

Use `npm run serve` for local development (live reload, **unminified** output). To
preview exactly what ships, run `npm run build` and serve `docs/` with any static
server.

## Minification / Obfuscation

`util/minify.js` runs from an `eleventy.after` hook, but **only when
`ELEVENTY_RUN_MODE === "build"`** — dev output stays readable in devtools. It does
one post-build pass over `docs/`:

1. Reads the built `docs/css/style.css`, collects every class name used in selector
   position, and builds a rename map (`.listing-blurb` → `.b`, etc.).
2. Rewrites and minifies the stylesheet (lightningcss).
3. Rewrites every `class="…"` in the built HTML using the same map, then minifies
   the HTML (html-minifier-terser) — stripping comments, collapsing whitespace, and
   minifying the inline analytics script.

Notes:

- **Class names are shared state.** A class that appears in HTML but never in the
  stylesheet is left untouched (and stays readable). If you add a class, style it.
- **JavaScript must never select by class name** — mangled names are not the
  source names. Hook on `id` or `data-*`, which the minifier does not touch.
- Output tokens are derived from a hash of the class name, so they are stable
  across builds. They were positional once; an edit could turn `.m` from one
  element into another, and any stale HTML/CSS pair then painted the wrong rules
  onto the wrong elements. Do not go back to positional names.
- The stylesheet URL carries `?v=<hash of its contents>` for the same reason:
  HTML and CSS are only valid as a matched pair.
- **lightningcss, not clean-css.** clean-css 5.x throws on `@starting-style` and
  silently drops `allow-discrete`, both of which the theme menu needs.
- Set `MANGLE_CLASS_NAMES = false` in `util/minify.js` to keep readable class names
  while still minifying.
- `keepClosingSlash` is on because the homepage inlines SVG — `<path …/>` must keep
  its slash to close correctly in foreign content.
- The site has no `<pre>`, `<code>`, `<textarea>` or `&nbsp;`, so whitespace
  collapsing is safe. **If you ever add whitespace-sensitive markup, revisit
  `collapseWhitespace`.**
- This obscures markup only. Poem and story text is plain text in the HTML by
  necessity and is not hidden from anyone reading the source.
- Minified `docs/` produces one-line git diffs. Review changes in `src/`, not `docs/`.

## Styling Conventions

- Dark header (#2c2c2c), cream background (#f8f7f4), muted green links (#6b7c6e)
- Body font: Verdana 18px, line-height 1.7; headings/nav: system-ui
- Max-width 720px content column, responsive padding
- Stories get `text-indent: 1.5em` paragraph indentation
- SVG social icons are inlined in the homepage template

## Patterns to Follow

- **Filenames**: kebab-case (`caffeine-dreams.md`) — auto-becomes the URL slug
- **Order field**: use increments of 10 (10, 20, 30…) so new items can be inserted between existing ones without renumbering
- **Homepage** shows the 5 most recent poems and stories (reversed collection order)
- **Index pages** show all items in reverse order (newest first)
- **Listing item macro** (`listing-item.njk`): all listing pages import and use the `listingItem(url, title, year, wordcount, blurb)` macro — poems pass only `url, title, year`; the `/stories` page also passes `wordcount` and `blurb`; the homepage passes `wordcount` but omits `blurb`
- Always rebuild `docs/` after source changes before committing
