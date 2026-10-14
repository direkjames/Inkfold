# Inkfold

A private, offline writing studio that runs in the browser. Phase 1.

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `inkfold`.
2. Upload everything in this folder (keep the `js` and `icons` folders as they are).
3. In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. After a minute your app is live at `https://<your-username>.github.io/inkfold/`.

Open it once while online. After that it works fully offline.

## What's in Phase 1

- Library of projects with covers, and a sample project to try things on
- Binder: chapters and scenes, drag to reorder, rename, duplicate, trash with undo
- Editor: rich text with Markdown shortcuts (`# `, `> `, `- `, `**bold**`, `*italic*`, `***` + Enter for a scene break), or a plain Markdown mode per project
- Focus mode (Ctrl + .), typewriter scrolling, typography settings (5 typefaces, size, spacing, width), smart punctuation
- Live word counts, constant autosave
- Import: .docx, .md, .txt, .inkfold project files, .zip backups
- Export: Word (.docx), PDF, Markdown, .inkfold project file
- Safety: persistent storage request, install prompt, "last backup" indicator and reminders, one-click ZIP backup and restore (merge or replace), daily automatic backup to a folder (Chrome and Edge on desktop), snapshots before every sync, import and restore, 30-day Trash
- Nearby Sync:
  - **Pairing code**: one device shows a 6-character code, the other types it. Needs internet for a second to pair; the writing then goes directly between the devices.
  - **Offline (QR)**: no internet needed. Device A shows a QR code, device B scans it and shows a reply, device A scans the reply. Copy-and-paste works when there's no camera.
  - Only changed scenes are taken. If the same scene was edited on both devices, both versions are kept and the copy is marked "conflicted copy" in the binder.

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
| `js/libs.js` | Libraries loaded on demand (JSZip, jsPDF, Mammoth, PeerJS, QR) |
| `sw.js` | Offline support and updates |

When you change any file, bump `VERSION` in `sw.js` so devices pick up the update. Inkfold then shows "A new version of Inkfold is ready".
