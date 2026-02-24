# stovenly.com — AI Project Reference

Personal creative writing portfolio (poetry & short fiction) at **stovenly.com**.

## Tech Stack

- **Static site generator**: Eleventy (11ty) v3
- **Templating**: Nunjucks (`.njk`)
- **Content**: Markdown with YAML front matter
- **Styling**: Single plain CSS file (no framework, no preprocessor)
- **Hosting**: GitHub Pages from the `docs/` directory
- **No JavaScript** on the front end

## Project Structure

```
src/                        # All source files
  _includes/                # Nunjucks layouts
    base.njk                #   Main HTML shell (header, nav, footer)
    poem.njk                #   Poem article layout (extends base)
    story.njk               #   Story article layout with word count (extends base)
    listing-item.njk        #   Reusable macro for listing items (used by index, poems, stories)
  poems/                    # Poem markdown files (17 files)
  stories/                  # Story markdown files (10 files)
  index.njk                 # Homepage
  poems.njk                 # Poems listing page
  stories.njk               # Stories listing page
  404.njk                   # Error page
static/                     # Passthrough static assets (copied to output root)
  css/style.css             #   Single stylesheet
  favicon.ico
  CNAME                     #   GitHub Pages custom domain (stovenly.com)
docs/                       # Generated output (committed to repo, served by GitHub Pages)
.eleventy.js                # Eleventy config (collections, markdown-it, passthrough copy)
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
```

## Build & Deploy

1. Edit content in `src/`
2. Run `npx eleventy` to build into `docs/`
3. Commit the `docs/` folder and push — GitHub Pages serves it automatically

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
- **Listing item macro** (`listing-item.njk`): all listing pages import and use the `listingItem(url, title, year, wordcount)` macro — poems omit `wordcount`, stories pass it
- Always rebuild `docs/` after source changes before committing
