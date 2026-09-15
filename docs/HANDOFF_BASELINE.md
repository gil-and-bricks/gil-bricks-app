# The handoff baseline — X1

**What this is.** Every parameter the extension sent to the analyser, captured
BEFORE the X1 panel rewrite and again AFTER it, from the same six real saved
listings driven through the real extractor, the real panel and the real
"send" click. It exists because a previous sprint lost three days to
parameters that silently stopped travelling while every test stayed green.

**How to regenerate.** The permanent guard is
`packages/extension/tests/handoffCarries.test.ts`, which asserts these
parameters BY NAME rather than by iterating any list the product also reads.
`packages/extension/scripts/check-extension.mjs` does the same in a real
Chrome, and `packages/web/src/components/analyser/handoffSurvives.test.ts`
proves nothing is lost when a field is then edited in the analyser.

## The verdict

**Every parameter that travelled before still travels, with a byte-identical
value.** Three stopped, all three because the thing that produced them was
removed by request:

| Parameter | Why it stopped |
| --- | --- |
| `rent` | The monthly-rent input was removed from the panel (brief item 2). |
| `roomFails` | The floor-plan measure tool was its only producer (brief item 2). |
| `roomsMeasured` | Same. |

The handoff's ability to carry all three is untouched and still exercised —
`buildAnalyserHandoff` writes them whenever they are supplied. The extension
simply no longer has a way to produce them, because measuring moved to the web
app's own floor-plan tracer.

## Added afterwards — `subjectTenure` (X1.1)

The operator's must-arrive list included tenure. It had **never** travelled, and
the panel's own copy claimed it did. Both were fixed: the copy first, so it
stopped promising something the URL did not do, and then the parameter.

**It is not called `tenure`.** That key already belongs to the analyser, as its
comparables filter, and its only legal values are `any`, `F` and `L`. Writing
the subject's tenure into it would do one of two bad things:

- `tenure=FREEHOLD` is not an allowed value, so `parseQuery` clamps it back to
  the default — and because the key is owned by the form it is not carried
  through either. It would vanish silently, which is the exact failure this
  document exists to prevent.
- `tenure=F` would quietly narrow the comparables the analyser draws on. That is
  a change to what the engine computes, made as a side effect of a handoff.

So it travels as `subjectTenure`, carrying `F` or `L`, a fact about the deal
rather than a setting on the page — the same shape as `auction` and `areaSrc`.
"Share of freehold" resolves to `L`, because that is what it legally is: a long
lease plus a share in the company that owns the freehold. Matching "freehold"
first would have called it freehold and hidden the lease.

Verified on the live site: arriving with `subjectTenure=L`, typing a rent of
£850, and finding `rent=850`, `subjectTenure=L`, `fp`, both photographs,
`auction=1` and `minIcr=1.25` all still in the address — with the comparables
filter untouched.

## A note on length

`parseAnalyserDeal` stores the query string as `urlParams` and **slices it at
2000 characters**. Nothing warns. Measured with every parameter and all four
criteria: Rightmove **1693**, Zoopla **1372**. Almost all of the difference is
the twelve photograph addresses at roughly 95 characters each, so a portal
lengthening its media URLs is what would push this over. A test now fails at
1900 rather than letting a saved deal come back with half a URL.

## Captured, listing by listing


### `rightmove/rightmove-reduced-terrace-leasehold.html`

| Parameter | Before | After |
| --- | --- | --- |
| `auction` | `1` | `1` |
| `baths` | `1` | `1` |
| `beds` | `3` | `3` |
| `fp` | `https://media.rightmove.co.uk/property-floorplan/8e99f7bee…` | `https://media.rightmove.co.uk/property-floorplan/8e99f7bee…` |
| `minCashflow` | `150` | `150` |
| `minIcr` | `1.25` | `1.25` |
| `minProfit` | `20000` | `20000` |
| `minRoi` | `8` | `8` |
| `ph` | `https://media.rightmove.co.uk/property-photo/73f3ac459/167…` | `https://media.rightmove.co.uk/property-photo/73f3ac459/167…` |
| `postcode` | `SA5 8BD` | `SA5 8BD` |
| `price` | `110000` | `110000` |
| `rent` | `950` | `—` **← removed by request** |
| `roomFails` | `1` | `—` **← removed by request** |
| `roomsMeasured` | `2` | `—` **← removed by request** |
| `src` | `ext` | `ext` |
| `type` | `T` | `T` |

Route: `/buy-to-let/analyser`


### `rightmove/rightmove-reduced-detached-freehold.html`

| Parameter | Before | After |
| --- | --- | --- |
| `baths` | `1` | `1` |
| `beds` | `4` | `4` |
| `fp` | `https://media.rightmove.co.uk/property-floorplan/4d6f1fb41…` | `https://media.rightmove.co.uk/property-floorplan/4d6f1fb41…` |
| `minCashflow` | `150` | `150` |
| `minIcr` | `1.25` | `1.25` |
| `minProfit` | `20000` | `20000` |
| `minRoi` | `8` | `8` |
| `paon` | `6` | `6` |
| `ph` | `https://media.rightmove.co.uk/property-photo/ecd2d5a69/883…` | `https://media.rightmove.co.uk/property-photo/ecd2d5a69/883…` |
| `postcode` | `SA2 7DX` | `SA2 7DX` |
| `price` | `510000` | `510000` |
| `rent` | `950` | `—` **← removed by request** |
| `roomFails` | `1` | `—` **← removed by request** |
| `roomsMeasured` | `2` | `—` **← removed by request** |
| `src` | `ext` | `ext` |
| `type` | `D` | `D` |

Route: `/buy-to-let/analyser`


### `rightmove/rightmove-leasehold-flat-added.html`

| Parameter | Before | After |
| --- | --- | --- |
| `baths` | `2` | `2` |
| `beds` | `2` | `2` |
| `minCashflow` | `150` | `150` |
| `minIcr` | `1.25` | `1.25` |
| `minProfit` | `20000` | `20000` |
| `minRoi` | `8` | `8` |
| `ph` | `https://media.rightmove.co.uk/property-photo/d0374a023/891…` | `https://media.rightmove.co.uk/property-photo/d0374a023/891…` |
| `postcode` | `SA1 8AJ` | `SA1 8AJ` |
| `price` | `170000` | `170000` |
| `rent` | `950` | `—` **← removed by request** |
| `roomFails` | `1` | `—` **← removed by request** |
| `roomsMeasured` | `2` | `—` **← removed by request** |
| `src` | `ext` | `ext` |
| `type` | `F` | `F` |

Route: `/buy-to-let/analyser`


### `zoopla/zoopla-auction-terrace-floorplan.html`

| Parameter | Before | After |
| --- | --- | --- |
| `auction` | `1` | `1` |
| `baths` | `1` | `1` |
| `beds` | `3` | `3` |
| `fp` | `https://lid.zoocdn.com/u/480/360/f0fc15a57a54093f7eac2ada9…` | `https://lid.zoocdn.com/u/480/360/f0fc15a57a54093f7eac2ada9…` |
| `minCashflow` | `150` | `150` |
| `minIcr` | `1.25` | `1.25` |
| `minProfit` | `20000` | `20000` |
| `minRoi` | `8` | `8` |
| `paon` | `31` | `31` |
| `ph` | `https://lid.zoocdn.com/u/480/360/c2e69b52e17247af35b13e6b6…` | `https://lid.zoocdn.com/u/480/360/c2e69b52e17247af35b13e6b6…` |
| `postcode` | `SA2 0PX` | `SA2 0PX` |
| `price` | `150000` | `150000` |
| `rent` | `950` | `—` **← removed by request** |
| `roomFails` | `1` | `—` **← removed by request** |
| `roomsMeasured` | `2` | `—` **← removed by request** |
| `src` | `ext` | `ext` |
| `type` | `T` | `T` |

Route: `/buy-to-let/analyser`


### `zoopla/zoopla-newbuild-semi-floorplan.html`

| Parameter | Before | After |
| --- | --- | --- |
| `area` | `137` | `137` |
| `areaSrc` | `listing` | `listing` |
| `baths` | `3` | `3` |
| `beds` | `4` | `4` |
| `fp` | `https://lid.zoocdn.com/u/480/360/a203aff2acd061b4a5157a6b2…` | `https://lid.zoocdn.com/u/480/360/a203aff2acd061b4a5157a6b2…` |
| `minCashflow` | `150` | `150` |
| `minIcr` | `1.25` | `1.25` |
| `minProfit` | `20000` | `20000` |
| `minRoi` | `8` | `8` |
| `ph` | `https://lid.zoocdn.com/u/480/360/aa1747714f4516d4530b9549a…` | `https://lid.zoocdn.com/u/480/360/aa1747714f4516d4530b9549a…` |
| `postcode` | `SA2 8NW` | `SA2 8NW` |
| `price` | `412000` | `412000` |
| `rent` | `950` | `—` **← removed by request** |
| `roomFails` | `1` | `—` **← removed by request** |
| `roomsMeasured` | `2` | `—` **← removed by request** |
| `src` | `ext` | `ext` |
| `type` | `S` | `S` |

Route: `/buy-to-let/analyser`


### `zoopla/zoopla-newhome-6bed-hmo-candidate.html`

| Parameter | Before | After |
| --- | --- | --- |
| `area` | `195` | `195` |
| `areaSrc` | `listing` | `listing` |
| `baths` | `5` | `5` |
| `beds` | `6` | `6` |
| `minCashflow` | `150` | `150` |
| `minIcr` | `1.25` | `1.25` |
| `minProfit` | `20000` | `20000` |
| `minRoi` | `8` | `8` |
| `ph` | `https://lid.zoocdn.com/u/480/360/999543961b39be01692a61caa…` | `https://lid.zoocdn.com/u/480/360/999543961b39be01692a61caa…` |
| `postcode` | `SA1 6AB` | `SA1 6AB` |
| `price` | `290000` | `290000` |
| `rent` | `950` | `—` **← removed by request** |
| `roomFails` | `1` | `—` **← removed by request** |
| `roomsMeasured` | `2` | `—` **← removed by request** |
| `src` | `ext` | `ext` |
| `type` | `T` | `T` |

Route: `/buy-to-let/analyser`
