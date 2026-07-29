# Sound Assets

The sound manager (`src/hooks/useSoundManager.js`) expects these files
under `client/public/sounds/`:

| File               | Used for                        |
|--------------------|----------------------------------|
| wolf-howl.mp3      | Night phase begins               |
| morning-bell.mp3   | Day phase begins                 |
| timer-tick.mp3     | Last ~10s of a phase countdown    |
| victory.mp3        | Player's team wins                |
| defeat.mp3         | Player's team loses                |
| lynch-thud.mp3     | A lynch vote resolves              |
| vote-click.mp3     | Casting a vote                    |

These audio files are not included in this delivery — they're
copyrighted/licensed assets and must be sourced separately (e.g. a
royalty-free SFX library such as Freesound.org with a compatible
license, or a paid asset pack) and dropped into `client/public/sounds/`
with these exact filenames. The manager silently no-ops if a file is
missing rather than crashing the UI.
