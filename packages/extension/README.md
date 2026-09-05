# PropLaunch Deal Analyser — Chrome extension (by Gil & Bricks)

A Chrome **side panel** that appears only on Rightmove and Zoopla and shows a
**Deal Score** for the listing you're viewing, using the same maths as the website.

Everything runs on your own machine and in your own browser — no servers, no
tracking, nothing to pay for.

## Build it

From the project root, run:

```
npm run build -w packages/extension
```

The finished extension is written to this exact folder:

```
packages/extension/.output/chrome-mv3
```

That `chrome-mv3` folder is the thing you load into Chrome.

## Load it into Chrome (first time)

1. Open Chrome and go to **chrome://extensions** (type it into the address bar).
2. Turn on **Developer mode** — the switch is in the top-right corner.
3. Click **Load unpacked** (top-left).
4. Choose the folder **`packages/extension/.output/chrome-mv3`** (from "Build it"
   above) and click Select/Open.
5. A "PropLaunch Deal Analyser" tile appears. Done.

You may want to **pin** it: click the little puzzle-piece icon near Chrome's
address bar, then the pin next to PropLaunch, so its icon always shows.

## Open the panel

Open any Rightmove or Zoopla **listing** and you get two signals:

1. A small **PropLaunch** button appears in the bottom-right of the listing.
   Click it and the panel opens. "Hide" removes it, and we remember that.
2. The toolbar icon wears a **lime dot** and its tooltip says a deal was found.
   Clicking the icon opens the panel too.

On a search page there is no button and no dot — there is nothing to score yet.
On any other site the panel is disabled on purpose: the tool only offers itself
on Rightmove and Zoopla.

**Chrome will not let any extension open a side panel by itself.** The API only
accepts a real click — the toolbar icon, a keyboard shortcut, a context menu, or
a button like ours on the page. So the panel cannot pop up as a listing loads;
the button and the dot are the loudest signals Chrome allows.

## Reload after a rebuild

Whenever you (or the code) change the extension, rebuild and refresh:

1. Run `npm run build -w packages/extension` again.
2. Go to **chrome://extensions**.
3. On the PropLaunch tile, click the **circular reload arrow** (↻).
4. Close and reopen the side panel to see the new version.

## See errors (if something looks wrong)

- **The side panel itself:** right-click inside the panel → **Inspect** → click
  the **Console** tab. Any errors show up in red. (There should normally be none.)
- **The background worker:** on **chrome://extensions**, on the PropLaunch
  tile, click **"service worker"** (a blue link) to open its console.
- **Load problems:** if the tile shows an **Errors** button, click it — it lists
  anything wrong with the manifest or files.

## Notes

- The toolbar icon is the **Gil & Bricks square mark** (the maker's launcher art)
  at 16/48/128 px. The panel header shows the **PropLaunch** wordmark with a
  "by Gil & Bricks" credit.
- The fonts (Montserrat + Poppins) are bundled inside the extension, so it looks
  right with no internet connection and shares nothing with Google.

## What it reads (E5)

On a Rightmove or Zoopla listing the panel reads the page you have open — from
the page's own embedded data in its `<script>` tags — and shows a normalised
listing. It **never fetches a portal page** and never sends the page anywhere.

- **Rightmove:** reads `window.__PAGE_MODEL` (a compressed data blob).
- **Zoopla:** reads the App-Router `self.__next_f` data + the `ld+json` summary.
- If a portal changes and the blob can't be read, it falls back to the page's
  Open-Graph/`ld+json` tags; if that also fails it says so plainly rather than
  showing a wrong value.

### Remote config (how we fix a reader without shipping an update)

The exact data paths the readers use live in one small JSON file so they can be
retargeted after a portal redesign **without a code change or a store re-review**:

- **R2 key:** `config/extractors.json`
- **Public URL:** `https://pub-ed7263f454104eb1a02055393ee15800.r2.dev/config/extractors.json`
- The extension ships an **identical copy** inside itself and uses it whenever the
  remote file can't be fetched — so the reader always works offline and first
  paint is never blocked. To publish an update:
  `wrangler r2 object put gil-bricks-data/config/extractors.json --file packages/core/src/listing/extractors.config.json --remote`

The file is **data only** (paths, selectors, flags) — all the reading logic stays
in the code, per the MV3 rule.
