---
title: Codenames
layout: game.njk
permalink: "/games/{{ page.fileSlug }}/"
order: 10
year: 2026
platform: Browser
blurb: "A browser version of the board game Codenames."
links:
  - label: Play here
    url: https://stovenly.github.io/codenames/
  - label: Source code
    url: https://github.com/stovenly/codenames
media:
  - video: recording.webm
  - image: screenshot1.png
  - image: screenshot2.png
  - image: screenshot3.png
  - image: screenshot4.png
---

A browser version of the board game Codenames.

## Features

**Engineering**

- Fully peer-to-peer, no server ([Trystero](https://github.com/dmotz/trystero) for signaling)
- Host authority with automatic host migration
- Delta sync with retry and self-repair
- Password protected lobbies

**Game**

- In-game chat (all or team only)
- Post-match accolades
- Custom word lists
- Configurable boards: 3x3–7x7, bonus cards, multiple assassins
- Spectators
- Clue and guess timers
- Avatar packs
- Full game history and end-of-game board
- Undo / redo

**Accessibility**

- Colorblind mode
- Dyslexia friendly font
