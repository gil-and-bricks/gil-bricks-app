# The gates — what each one actually observes

Written 2026-09-14, after an audit found that several gates verified INTENT
rather than BEHAVIOUR: they read the source, counted occurrences, or built their
expectation out of the same constant as the code under test. A gate like that is
worse than no gate, because it reads as coverage.

So every row below says what the gate **observes** and what it **does not**. If
you can only read one column, read the second.

## The standing gates

| Gate | Command | What it observes | What it does NOT |
|---|---|---|---|
| **Unit — core** | `npm test -w packages/core` | The maths, the Deal Score, the extractors against saved pages. 584 tests. | Nothing in a browser. |
| **Unit — web** | `npm test -w packages/web` | The ratchets, the copy rules, the Worker's routes called directly. 1,519 tests. | Nothing rendered. |
| **Unit — extension** | `npm test -w packages/extension` | The panel's modules, and the BUILT manifest (see note). 132 tests. | The extension running. |
| **Flags off** | `npm run test:flags-off` | The whole web suite, and a build, with every feature flag off. | — |
| **Copy length** | `npm run copy-gate -w packages/web` | Visible text blocks on 21 built pages at **two widths**. | Whether the words are true. |
| **Render** | `npm run render-gate -w packages/web` | Nothing throws, no empty box, no stuck placeholder, the floor plan is usable. Both widths. | **No value is checked.** |
| **Console** | `npm run console-gate -w packages/web` | 26 pages × 2 widths against production: any page error, any CSP refusal, any failed same-origin request. | Anything below the fold that needs a click. |
| **Inputs** | `node packages/web/scripts/check-inputs.mjs` | Every input on every analyser moves something on the page — reloading for each one so no input colours the next. 160 inputs. | Whether the movement is the RIGHT movement. |
| **Journey** | `npm run journey-gate -w packages/web` | Arrival from a handoff → photos load → floor plan paints → EPC lookup → edit and the score moves → a context-only field and it does not → strategy change → no empty section. Both widths, against production. | The signed-in half (see below). |
| **Map** | `npm run map-gate -w packages/web` | Rendered basemap FEATURES (not just a canvas), pins, cluster split, popup fields, zoom-glyph contrast off the pixels, recovery from a blocked tile and a lost WebGL context. | Whether the sold prices are correct. |
| **Signed in** | `npm run signed-in-gate -w packages/web` | Sign in → save a deal → reopen it from the pipeline after a reload → add a fact → the score AND the return move → both survive a reload → park → restore. Both widths. | **The deployment.** It runs the real Worker locally (see below). |
| **Extension** | `npm run extension-gate -w packages/extension` | The BUILT extension in a real Chrome, on real saved Rightmove and Zoopla pages served under the portals' own hostnames: content script fires, the real side panel opens, the panel reads the listing, and the handoff URL carries postcode, price, type, beds, baths, house number, auction flag, and the listing's own 12 photographs — identified against the golden, not merely counted — plus the floor plan where the portal provides one. | Whether Chrome Web Store review would pass it. |

## Where they run

- **Every push and pull request** (`ci.yml`): the three unit suites, flags-off,
  audit, typecheck, both builds, and the copy/render/console gates.
- **Four times a day against production** (`journey.yml`): the journey, the
  input gate, the map gate, the signed-in walk and the extension end to end. A
  failure opens an **assigned issue** — the app may never send email.

They are not on pull requests because they are slow (the input gate alone
reloads the page 160 times, about thirteen minutes) and because the faults they
catch are structural rather than per-commit.

## Two things worth knowing

**The extension gate uses Chrome for Testing, not your Chrome.** Google Chrome
137 and later refuse `--load-extension`; on Chrome 152 the extension is
registered and then blocked. Chrome for Testing is Google's own automation build
and is the only one that can load an unpacked MV3 extension from the command
line. It produces the same extension id as your own Chrome, which is how we know
it is the same build. It also has to run **headed** — Chrome loads no extension
headless — hence `xvfb-run` on a runner.

**No portal page is ever fetched.** The extension gate serves the committed
fixture corpus from a local server and points Chrome's resolver at it, so the
page genuinely loads at `www.rightmove.co.uk` while nothing is requested from
Rightmove or Zoopla. Every off-origin request from the listing page is aborted
and counted, and the count is printed.

One thing does leave, and the gate says so rather than claiming otherwise: the
tab the extension opens at the end loads **our own app**, because
`chrome.tabs.create` starts navigating before a route handler can attach. That
is our server, not a portal, and it is exactly what a person's click does — it
is also how the gate knows the analyser page resolves, since the site answers
307 and the tab lands on the trailing-slash path.

**The signed-in gate runs locally, on purpose.** Production has no test account.
Driving Google OAuth would mean handling a real password; a production back door
would weaken real auth for everyone. Instead it boots the real Worker over a
throwaway D1 and signs in through `/auth/dev-login`, which has always existed and
is refused twice over off localhost. Its first step asks **production** to
confirm that door returns a bare 404, rather than assuming it. What it therefore
cannot catch is a deployment fault: a missing secret, a Cloudflare setting, or a
migration that did not run on the remote database.

## Known-broken, written down rather than hidden

- **Zoopla floor plans never reach the analyser.** Zoopla stores a floor plan as
  `{"filename": "<hash>.jpg"}` with no URL anywhere on the page, and the
  extractor does not turn it into an address; `handoff.ts` then drops it, because
  it only writes `fp` for an `https` value. Both Zoopla goldens record bare
  filenames. Recorded and dated in `listing.test.ts` (`KNOWN_BROKEN`) and in the
  extension gate's `CASES`. Both fail if a third appears, **and** if one is fixed
  without being struck off the list. Fixing the extractor is a product change and
  has not been made.
- **A Rightmove auction listing hands off with no auction flag.** The fixture
  `rightmove-reduced-terrace-leasehold` says "Modern Method of Auction" twice in
  its description, and `config.ts` already knows that phrase — but the Rightmove
  extractor records `isAuction` as `unavailable-on-this-portal`, so `auction=1`
  never travels and the board never warns about the legal pack. Zoopla's auction
  flag works. Asserted as absent in the extension gate's `CASES`, dated, so it
  fails the day it starts working.
- **The two portals disagree on case** — a Rightmove panel line reads "Terraced",
  a Zoopla one "terraced". Matched case-insensitively in the extension gate
  rather than quietly normalised, for the same reason.

## Still not verified by anything

- **That the numbers are RIGHT.** Every gate checks a figure moves, or that it
  matches a figure read off the same listing. None checks that £110,000 at 5%
  over 25 years is the correct payment. That is the unit suites' job and they
  test the engines, not the screens.
- **The deployment itself**, beyond the console and journey gates' own use of it.
- **The cron jobs**, beyond a heartbeat.
- **The data pipeline's content** — that the sold prices are the real ones.
- **The extension under Chrome Web Store review.**
