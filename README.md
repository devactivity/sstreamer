# Sstreamer

Live schedules for Indonesian game streamers. Static site, no backend, free to run.

Indonesian at `/`, English at `/en/`. Times are rendered at build in each streamer's
own zone, then converted to the visitor's zone in the browser, so the page is still
correct with JavaScript disabled.

## Commands

| command | does |
| --- | --- |
| `npm run dev` | dev server on <http://localhost:4321> |
| `npm run build` | static build into `dist/` |
| `npm test` | unit tests (`node --test`) |
| `npm run check` | Astro + TypeScript diagnostics |
| `npm run sync` | pull submissions from the sheet, `-- --dry-run` to preview |
| `npm run export` | CSV backup, `--public` to omit key hashes |
| `npm run import` | restore from CSV, dry run unless `--force` |

**After `npm run sync` writes a file, restart `astro dev`.** The dev server caches the
content layer and will keep serving 404 for a newly synced streamer until it restarts.
The build is always correct; it is only the dev server that goes stale.

## Data

Streamers and games are content collections of YAML files validated by Zod in
`src/content.config.ts`. A malformed file fails the build rather than shipping a
broken page.

```
src/data/streamers/*.yaml   one file per streamer, filename is the slug
src/data/games/*.yaml       game metadata, optional cover art in covers/
```

Streamers reference games by slug, so a typo fails the build instead of silently
creating a phantom game.

## Things worth knowing before changing anything

**Staleness is the main product risk.** Every schedule is hand-maintained, so the UI
treats age as a trust signal: profiles untouched for 30 days are demoted to
"unconfirmed" rather than presented as fact. Don't remove that without a replacement.

**Live status is derived from the schedule**, not from any platform API. It means the
streamer planned to be live. The wording and the disclaimer beside it carry that
caveat, and it is computed in the browser because a static build's idea of "now" is
stale the moment it finishes.

**Timezones are stored as IANA zones**, never fixed offsets. Indonesia has no DST so
it makes no difference today, but the conversion in `src/lib/schedule.ts` is correct
across DST boundaries and is tested against them.

**Edit keys are verified in the sync Action, never in the browser.** A browser-side
check is decoration: anyone can post directly to the form endpoint. See
`scripts/lib/sync-rules.mjs`.

**Colour belongs in the theme tokens** in `src/layouts/Base.astro`, not in a
component's own `prefers-color-scheme` block, or the manual theme toggle misses it.
