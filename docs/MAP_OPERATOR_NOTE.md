# The map — what it is and how to refresh it

The map's background (roads, rivers, labels) is a **one-off snapshot of
OpenStreetMap**, stored as a single file on our own storage. Nothing about
it phones any third party — tiles, fonts and icons all come from us.

## Refreshing the background (about once a year is plenty)

Roads don't move often. When you'd like a fresher snapshot:

1. Go to the repo on GitHub → **Actions** → **map-tiles** → **Run workflow**.
2. Leave the date box empty (it uses yesterday's build) and click the green
   button.
3. It takes about 5 minutes. When it's green, hard-refresh the site and the
   map is up to date.

That's it — no code changes, nothing else to touch.

## Facts (for the log)

- Coverage: England & Wales (bbox −6.5,49.8 → 1.8,55.9), zooms 0–14
  (streets stay sharp beyond that via overzoom).
- File: `map/ew.pmtiles` in the gil-bricks-data bucket, ~1.1 GB.
- Source: the Protomaps daily build of OpenStreetMap (© OpenStreetMap
  contributors, ODbL) — attribution shows on the map's ⓘ.


## If the map ever shows blank

If someone reports a blank map (the frame and the +/− buttons show but no
streets or pins), the page now notices that itself and shows a "the map
couldn't display here — the table below has every sale" message with a
"Try the map again" button, so no one is ever left staring at an empty box.
It's almost always a phone running low on graphics memory; reloading or the
retry button fixes it. Nothing for you to do.
