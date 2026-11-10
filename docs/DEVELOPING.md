# Developing Inkfold

Notes for hosting and changing Inkfold. For what it does, see the [README](../README.md).

## Host it on GitHub Pages

1. Create a new repository on GitHub, for example `inkfold`.
2. Upload everything in this folder (keep the `js` and `icons` folders as they are).
3. In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. After a minute your app is live at `https://<your-username>.github.io/inkfold/`.

Open it once while online. After that it works fully offline.

The README images are in `docs/screenshots/`.

## Files

| File | What it does |
|---|---|
| `index.html`, `styles.css` | App shell and design |
| `js/app.js` | Screens and interactions |
| `js/db.js` | Local storage (IndexedDB), snapshots |
| `js/model.js` | Projects, chapters, scenes |
| `js/text.js` | Rich text, Markdown and word counting |
| `js/io.js` | Backups, import and export |
| `js/sync.js` | Nearby Sync and merging |
| `js/bible.js` | Story bible, links, mentions, hover cards, relationship editor |
| `js/relmap.js` | Relationship web and family tree |
| `js/revise.js` | Notes, revision rounds, analysis, find & replace, versions, read aloud, reference |
| `js/modes.js` | Novel, poetry and journal behaviour, calendar |
| `js/screenplay.js` | Screenplay editor, Fountain, Final Draft, screenplay PDF |
| `js/timeline.js` | Timeline view |
| `js/compile.js` | Compile templates, DOCX, PDF, EPUB |
| `js/security.js` | App lock and project encryption |
| `js/palette.js` | Command palette and shortcuts |
| `js/board.js` | Corkboard, outliner, scene details |
| `js/stats.js` | Writing log, goals, streaks, deadline planner |
| `js/level.js` | EXP and levels |
| `js/series.js` | Series: shared story bible, joining and leaving |
| `js/images.js` | Pictures in scenes (shrinking, storing, showing) |
| `js/mapfold.js` | Import from Mapfold: reads Mapfold's shared maps, creates and re-syncs maps, marks and places |
| `js/maps.js` | Maps, pins, labels, regions, routes, layers, ruler, scene places, journeys, map export |
| `js/sound.js` | Ambient soundscapes and timer chime |
| `js/ui.js` | Icons, sheets, menus, toasts |
| `js/libs.js` | Libraries loaded on demand (JSZip, jsPDF, Mammoth, PeerJS, QR) |
| `sw.js` | Offline support and updates |

When you change any file, bump `VERSION` in `sw.js` so devices pick up the update. Inkfold then shows "A new version of Inkfold is ready".
