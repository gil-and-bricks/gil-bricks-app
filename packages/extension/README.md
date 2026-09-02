# Gil & Bricks Deal Analyser — Chrome extension

A Chrome **side panel** that appears only on Rightmove and Zoopla and (for now)
shows a sample **Deal Score** using the same maths as the website. This is the
scaffold: the part that reads real listings is added in a later sprint.

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
5. A "Gil & Bricks Deal Analyser" tile appears. Done.

You may want to **pin** it: click the little puzzle-piece icon near Chrome's
address bar, then the pin next to Gil & Bricks, so its icon always shows.

## Open the panel

1. Go to any Rightmove or Zoopla page (for example a property listing).
2. Click the **Gil & Bricks icon** in the toolbar. The side panel opens on the
   right and shows the sample Deal Score.

On any other site (say google.com), the icon is greyed out / the panel is
disabled on purpose — the tool only offers itself on Rightmove and Zoopla.

The panel only ever opens when **you** click the icon. It never pops up on its own.

## Reload after a rebuild

Whenever you (or the code) change the extension, rebuild and refresh:

1. Run `npm run build -w packages/extension` again.
2. Go to **chrome://extensions**.
3. On the Gil & Bricks tile, click the **circular reload arrow** (↻).
4. Close and reopen the side panel to see the new version.

## See errors (if something looks wrong)

- **The side panel itself:** right-click inside the panel → **Inspect** → click
  the **Console** tab. Any errors show up in red. (For the scaffold there should
  be none.)
- **The background worker:** on **chrome://extensions**, on the Gil & Bricks
  tile, click **"service worker"** (a blue link) to open its console.
- **Load problems:** if the tile shows an **Errors** button, click it — it lists
  anything wrong with the manifest or files.

## Notes

- The toolbar icon is a **placeholder** (a lime mark on dark). It will be
  replaced with the real Gil & Bricks logo before the extension is submitted to
  the Chrome Web Store.
- The fonts (Montserrat + Poppins) are bundled inside the extension, so it looks
  right with no internet connection and shares nothing with Google.
