# Inkfold

A private, offline writing studio that runs in the browser. Phases 1 to 4.

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

## What's new in Phase 2

- Paper (light) theme by default, with a light/dark toggle in the sidebar and library header
- Corkboard: index cards per chapter, drag cards between chapters, edit synopsis, status, POV, label and word target
- Outliner: a table of every scene with inline editing
- Scene status (Idea, Draft, Revised, Final), colour labels and per-scene word targets, shown in the binder and editor
- Cover art: upload your own image for any project
- Daily word goal, streaks and a 26-week heatmap
- Deadline planner: set a project target and date to see the words per day you need
- Writing analytics: words per hour and the hours you write best
- Writing sprints with an optional Pomodoro break
- Focus dimming by paragraph or sentence
- Ambient soundscapes (rain, fireplace, café, ocean), generated on the device so they play offline
- Celebrations when you hit a goal, with haptics on Android

Writing stats are included in backups and Nearby Sync, so they add up across your devices.

## What's new in Phase 3

- Story bible (Bible tab): characters, places and lore with photos, roles, traits, wants and needs, arcs and notes
- `[[Links]]` between entries, with suggestions as you type, plus "Appears in" (every scene that mentions a name) and "Linked from"
- Hover a character or place name in your manuscript to see their card
- Relationship map with two views: a draggable web of everyone, and a family tree built from Parent, Married and Sibling relationships
- Ten relationship types (family, love, friendship, alliance, mentorship, work, rivalry, enmity), each with its own colour
- Margin notes pinned to the words you select, with resolve and reopen
- Revision rounds: new writing is coloured by draft round, with "accept all"
- Version history for every scene: automatic versions before each editing session, named versions, and a side-by-side comparison with restore
- Find & replace across the whole project (match case, whole words, regular expressions)
- Revise panel: readability score, adverbs, passive voice, repeated words, long sentences, dialogue-only view, most used words, and a name check against your story bible
- Read aloud with sentence highlighting, speed and voice
- Reference pane: keep another scene or a character profile open beside the one you're writing
- Shortcuts: Ctrl/Cmd + F opens Find & replace

## What's new in Phase 4

- Four kinds of project, picked when you create one (and changeable in Project details):
  - **Novel**: chapters and scenes
  - **Screenplay**: scene headings, action, character, parentheticals, dialogue, transitions. Tab switches element, Enter picks the element that usually follows, and character names, locations and times autocomplete. Page count in the status bar. Import `.fountain` files.
  - **Poetry**: Enter for a new line, Enter twice for a new stanza, syllable counts beside each line, optional centred layout
  - **Journal**: one entry a day filed by month, a mood for each day, and a calendar view
- Timeline (novels and screenplays): give scenes a date, a day number or a time, see them in story order with one lane per point of view, spot flashbacks, or switch to reading order
- Compile: Word, PDF, EPUB, Markdown, and for screenplays Fountain, Final Draft (.fdx) and an industry-format PDF. Looks: Standard manuscript (header, word count, contact details), Book, Reading copy, or Custom (typeface, size, spacing, chapter headings, scene breaks). Choose exactly which chapters and scenes go in.
- App lock: a PIN when Inkfold opens, auto-lock after a set time, Ctrl/Cmd + Shift + L to lock now
- Encrypted projects: AES-256 encryption with a password only you know. Backups and sync carry the encrypted data; the password never leaves your head.
- Command palette (Ctrl/Cmd + K) to jump to any scene, character, view or action, and a shortcuts sheet (Ctrl/Cmd + /)
- Editor themes: Paper, Ink, Midnight, Sepia Night, OLED Black, or match your device
- Better tablet layouts

## What's new in 1.5: Maps

A new **Map** view (next to Write, Board, Outline, Timeline and Bible) for novels, screenplays and journals. Shortcut: Ctrl/Cmd + Shift + the view's number.

- **Your own map pictures**, kept sharp up to 4000 pixels. Several maps per book, shared across a series like the story bible.
- **Pins** with 14 icons and 10 colours, each linked to a Place in your story bible (or creating one). Click a pin for the place card and the scenes set there.
- **Maps inside maps**: a pin can open another map (double-click or double-tap it). A breadcrumb leads back.
- **Labels** (plain, italic serif, or spaced capitals; three sizes; any angle), **regions** (borders and territories with fill and border styles) and **routes** (solid, dashed or dotted, with smooth curves). Drag the dots to reshape; click a small dot to add a point.
- **Layers** you can show, hide, lock and reorder.
- **Ruler and scale** in metres and kilometres: set the scale once, then measure distances, see route lengths and travel times on foot, on horseback and by ship (speeds are editable).
- **Undo and redo** (Ctrl/Cmd + Z, Shift + Z) for everything on the map.
- **Scene locations**: "Set place" next to "Set time" at the top of each scene, with places mentioned in the scene suggested first. Places show on Board cards, in the Outline and in Scene details. Pins show how many scenes happen there, including scenes on maps inside it.
- **Character journeys**: pick up to five characters to see their numbered route through the story, in story order (Timeline dates when you have them). A character counts as in a scene when it's from their point of view or they're mentioned by name; the people button at the top of a scene lets you correct it. An "Up to chapter" slider replays the story, and travel checks warn when someone covers too much ground too fast.
- **Export** a map as a full-size PNG with the visible layers (and journeys, if shown).
- Place entries in the Bible list "Scenes set here" and "On maps".

## What's new in 1.4

- **Blank lines stay put.** Empty lines and line breaks you add in a scene are kept when you save, switch scenes, use Markdown mode, and export to Word, PDF, EPUB or Markdown. Importing .txt, .md and .docx keeps them too.
- **New chapters show up right away** in the binder, ready to rename (same for new and duplicated scenes).
- **First names count.** "Luna Valentino" is also found as plain "Luna" in your scenes, hover cards and "Appears in", without adding an alias. If two entries share a first name, it isn't matched on its own and the profile says so. Each character has a switch to turn this off.
- **Pictures in scenes.** Insert from the toolbar, drag and drop, or paste. Click a picture to resize it (Small, Medium, Large, Full width), add a caption, replace or remove it. Pictures are shrunk automatically and go into Word, PDF, EPUB and Markdown exports.
- **Series.** Group books into a series ("New series" in the library, or Project details → Series). Books in a series share one story bible: characters, places, lore, relationships and profile tabs. Entries with the same name are merged when a book joins. A book that leaves keeps its own copy. Encrypted projects can't join a series.
- **Welcome back.** The library shows where you left off, with the last lines you wrote, your words today, your streak and your level.
- **EXP and levels.** 1 EXP per word written, +25 for each writing day (100+ words), and a growing bonus for days in a row. Level-ups are celebrated. Deleting text never takes EXP away.
- **Custom profile tabs.** Add tabs like "Royal Titles" to character profiles, with your own fields. A tab can be on every character (shared layout) or only on one.
- **Family tree, reorganised.** Each generation sits on its own row; couples are joined by one line (a ring for married couples); children hang from the middle of their parents' line; siblings share one bar; married-in partners get a small stub. Circles are coloured by the new Gender field.

## What's new in 1.5.6

- When a privacy browser such as Brave blocks the feature devices use to find each other, Nearby Sync now says so right away (including on Offline QR) and tells you the setting to change, instead of a generic Wi-Fi error.

## What's new in 1.5.5

- **Pairing-code sync handshake fixed.** The two devices could miss each other's first messages and one would wait forever. The hello is now repeated until the other side confirms it, library data that arrives early is kept, and a device that starts before it knows its own name no longer crashes the session.
- A device that connects but never gets an answer now stops after 20 seconds with a clear message, and stalled transfers are detected correctly (retries no longer count as activity).
- The approval prompt now appears inside the Nearby Sync screen on the device showing the code, with a vibration, instead of as a separate sheet.

## What's new in 1.5.4

- **Pairing-code sync no longer hangs on "Connecting…".** Every step now has a time limit and a clear message: the pairing service (12 s), the direct link between the devices (25 s, with what was tried), and the approval on the device showing the code (2 min). A dead link is reported the moment it fails, with a one-tap "Use Offline (QR)" and a backup-file tip.
- Fixed the joining device also asking for approval, and the pairing service rejecting messages over 16 KB.

## What's new in 1.5.3

- **Nearby Sync fixed** on phone and computer. Sync now reports a clear error (and the Wi-Fi hint) when the devices can't reach each other instead of spinning forever, retries its first handshake, shows send and receive progress, stops stalled transfers, keeps the screen awake while syncing, and saves the scene you're typing first.
- Pairing-code sync asks you to approve the other device before any writing moves, and everything received is validated before it's merged.
- Offline (QR) codes are smaller and white-framed so they scan more reliably, using the phone's built-in QR detector when it has one.
- **Character, place and lore photos can be changed again** (the upload button now opens the picker), and the same fix applies to project cover uploads.

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
| `js/maps.js` | Maps, pins, labels, regions, routes, layers, ruler, scene places, journeys, map export |
| `js/sound.js` | Ambient soundscapes and timer chime |
| `js/ui.js` | Icons, sheets, menus, toasts |
| `js/libs.js` | Libraries loaded on demand (JSZip, jsPDF, Mammoth, PeerJS, QR) |
| `sw.js` | Offline support and updates |

When you change any file, bump `VERSION` in `sw.js` so devices pick up the update. Inkfold then shows "A new version of Inkfold is ready".
