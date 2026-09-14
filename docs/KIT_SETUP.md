# Kit setup — the operator's runbook

**Who this is for:** you, not a developer. No code is involved. Everything here
is done in the Kit web app, except the last section, which is five values typed
into two files.

**Why it matters.** The app never sends email. Golden rule 6: *"NEVER send email
from the app. Marketing = Kit outbox row + Worker push only."* When somebody
ticks a consent box, the app writes a row in its own database and pushes their
email address to Kit. **Kit does the sending.** If an automation does not exist
in Kit, nothing reaches anybody — the queue just fills up. That is the state
today (`docs/AUDIT.md` §4.1, "half-built").

**What you are building:** 6 custom fields, 7 tags, 7 automations.

---

## Before you start

You need a Kit account on a plan that includes **visual automations**. Tags and
custom fields are on every plan; automations are not on the free tier.

### The API key

The app authenticates to Kit with a **V4 API key**, sent as the header
`X-Kit-Api-Key`. In Kit: **Settings → Advanced → API**. Copy the **V4 key**, not
the older V3 key or the API secret.

It is stored as a Cloudflare Worker secret called `KIT_API_KEY`. If it is not
already set, that one command is:

```bash
npx wrangler secret put KIT_API_KEY
```

It will prompt you to paste the key. The key is never written to a file and
never appears in logs.

### Turn on double opt-in first

Do this **before** you create anything else: **Settings → Email → Double
opt-in**, turn it on.

The reason is in `src/config/capture.ts`: *"A typed address proves a human is
present, never that they own the address, so the confirmation click is what
stops one person signing up another."* On the three calculators, anyone can type
anyone's address. Double opt-in is what stops that being abused.

---

## Step 1 — Create the 5 custom fields

**Subscribers → Custom fields → Add field.**

The keys must match **exactly**, including the underscores. The app writes these
by name; a typo means the field silently stays empty and your email sends with a
blank space where a number should be.

| Key | What the app puts in it | Example |
|---|---|---|
| `tool_used` | Which calculator they used | `equity` |
| `tool_headline` | The one big number, already formatted | `£171,494 of equity` |
| `tool_detail` | The supporting figures, one line | `Estimated value £325,000. Still owed £153,506. Loan to value 47%.` |
| `tool_maths` | The working, exactly as the show-the-maths panel gave it | (a longer line of working) |
| `factfind_link` | The broker's single-use link to a fact-find | `https://proplaunch.ai/broker/factfind?t=…` |
| `enquiry_link` | The broker's single-use link to a qualified **enquiry** | `https://proplaunch.ai/broker/enquiry?t=…` |

The first four come from `KIT_FIELDS` in `src/config/capture.ts`. The fifth is
`KIT_FACTFIND_FIELD` in `src/worker/lib/factfind.ts`, and the sixth is
`KIT_ENQUIRY_FIELD` in `src/worker/lib/enquiryLink.ts`.

**Note on `tool_used`:** no email below uses it. It is there so you can segment
later — "everyone who used the yield calculator" — without building anything
new. Create it anyway; the app writes it on every tool lead.

---

## Step 2 — Create the 6 tags

**Subscribers → Tags → Create tag.**

Name them whatever you like. What the app needs is each tag's **numeric ID**,
which you get from the URL when you click into the tag — `.../tags/123456/...`
means the ID is `123456`. Write all seven down; Step 5 is where you paste them in.

**Tags 1 and 3 both fire on the same qualified enquiry**, and they are not
redundant: tag 1 emails the person, tag 3 emails him. They are separate because
the two emails go to different people and only one of them carries a link.

| # | Suggested name | What makes the app apply it | Who gets tagged |
|---|---|---|---|
| 1 | `bridging-qualified` | A bridging enquiry **passes** the qualification rules | The person enquiring |
| 2 | `bridging-not-yet` | A bridging enquiry **fails** the rules | The person enquiring |
| 3 | `enquiry-ready` | A bridging enquiry **passes** — the same moment as tag 1 | **The broker** |
| 4 | `factfind-ready` | Someone completes the broker's fact-find | **The broker** |
| 5 | `tool-equity` | Someone asks for their equity breakdown by email | The person |
| 6 | `tool-stamp-duty` | Someone asks for their stamp duty breakdown | The person |
| 7 | `tool-rental-yield` | Someone asks for their yield breakdown | The person |

**Tags 3 and 4 are the odd ones out.** They are applied to *the broker's own
email address*, not to a customer. He becomes a subscriber in your Kit account. That is
deliberate — it is how he gets notified — but it means he will appear in your
subscriber count and must not be swept into marketing broadcasts. Consider
putting him in his own segment and excluding that segment from every broadcast.

### There is no tag for marketing consent

When somebody ticks *"Send me property deals & updates by email"* at sign-up,
the app adds them to Kit as a plain subscriber with **no tag at all**. Ticking it
off later unsubscribes them.

So ongoing marketing to that list is **broadcasts you send by hand**, not an
automation. If you want a welcome sequence for new sign-ups, trigger it in Kit
on "subscriber joins" rather than waiting for a tag that never arrives.

---

## Step 3 — Build the 6 automations

**Automations → Visual automations → New automation.** Each one starts with the
trigger **"Subscriber is tagged"**, choosing the tag from Step 2, followed by an
**Email** action.

Four of the seven emails are already written and are printed in full below. Copy
and paste them. Edit them freely — the app never sends them, so changing the
words here breaks nothing.

Three are **not** written. You write those; they are in the list at the end.

---

### Automation 1 — Bridging: qualified (to the person)

- **What it is for:** telling the person their enquiry is on its way to him.
- **Trigger:** tag `bridging-qualified`.
- **Who receives it:** the person enquiring. **Not** the broker — he has his own
  automation, number 3.
- **Merge fields needed:** none. `{{ subscriber.first_name }}` if you want it.
- **Email text:** *not written. You write this one.*

**What must be in it for the app's promise to be true.** After submitting, the
person is shown: *"We have your enquiry and it is queued for him now. He decides
what he can help with, and he calls you. This is an introduction, not a decision
about your finance."*

So the email must not promise more than that: he decides, and he calls. Do not
name a timescale you have not agreed with him.

**This email must never contain the broker's link.** The link is his, and it is
single-use — a copy in the applicant's inbox would let them spend his one view.
The app never puts it here (the link goes only on the `enquiry-ready` row,
addressed to him), and a test proves the person's own Kit record never sees it.
Do not paste it in by hand.

---

### Automation 2 — Bridging: not yet (to the person)

- **What it is for:** telling someone their enquiry was not passed on, and what
  to firm up. It is help, never a rejection.
- **Trigger:** tag `bridging-not-yet`.
- **Who receives it:** the person enquiring. The broker is **not** involved.
- **Merge fields needed:** none.

**What must be in it for the app's promise to be true.** On screen they are
told: *"We have not passed this on. **An email is on its way with the detail.**"*
That sentence is a promise that this automation exists. Until it does, the app
is telling people to wait for an email that will never arrive. This is the most
urgent of the six.

**The email, already written** (`BRIDGING.notYetEmail` in
`src/config/bridging.ts`) — subject line first, then one paragraph per line:

> **Subject:** Your bridging enquiry — what to firm up first
>
> Thanks for the enquiry. I have not passed it on yet, and here is the honest reason.
>
> Bridging works when two things are clear: the money you are putting in, and exactly how you repay.
>
> One of those is not nailed down yet, and a good broker asks about it first.
>
> Run the deal through the analyser to pressure-test the numbers.
>
> Check area data for a realistic exit value.
>
> There are walkthroughs on the YouTube channel too.
>
> When it is clear, come back and send it again.

Three of those lines point somewhere. Turn them into real links before you send
it — the analyser, the area page, and the YouTube channel.

---

### Automation 3 — Enquiry ready (the broker's notification)

**This is the one that makes the consent tick true.** Build it at the same time
as automation 1; they fire on the same enquiry.

- **What it is for:** telling the broker a qualified enquiry is waiting, and
  giving him the single-use link that reveals what the person actually said.
- **Trigger:** tag `enquiry-ready`.
- **Who receives it:** **the broker only.** Never the applicant.
- **Merge field needed:** `{{ subscriber.enquiry_link }}` — the whole point of
  the email.
- **Email text:** *not written. You write this one.*

**What must be in it for the app's promise to be true.** The consent tick beside
the enquiry form reads:

> *"Share these answers and my contact details with [broker's name]."*

That sentence is a claim about this automation. Without it he is tagged and told
nothing, and the answers sit in the database with no way for him to read them.

The rules are the same four as the fact-find below, for the same reasons:

1. **It must contain `{{ subscriber.enquiry_link }}`.** Without it the person has
   consented to a disclosure that never happens.
2. **It must contain nothing they wrote.** Kit is not given the loan, the deposit
   band, the phone number or a word of their story — only the link. You would
   have to go and fetch those to break this rule. Do not.
3. **It must say the link expires and works once.** It is valid for **72 hours**
   and dies on first use (`ENQUIRY_LINK_RULES.linkHours`).
4. **It must tell him to press the button on the page.** The link opens to a
   single "Show the enquiry" button; the details appear only when he presses it.
   That is deliberate — email scanners follow links, and the button stops a
   scanner burning his one view.

A working shape, for you to put in your own words:

> **Subject:** A bridging enquiry is waiting
>
> Someone has sent an enquiry that passed the checks, and consented to you seeing it.
>
> {{ subscriber.enquiry_link }}
>
> Open it and press "Show the enquiry". The link works once and expires after 72 hours.
>
> Their name, email and phone number are on that page. If the link has gone, email [your inbox] and I will send a fresh one.

**What he will see** — the loan, the deposit band, the property state, how they
are buying, the exit route, their own words, the timing, their credit answer,
and their name, email and phone. Every question appears under the same label the
enquirer read, so nothing is re-worded between what they answered and what he is
shown; a test fails if a question is ever added to the form without reaching him.

**A failed enquiry makes no link at all.** A "not yet" was not passed on, so
there is nothing for him to read and nothing to leak.

**If the link expires or he opens it twice**, he sees a dead-link page pointing
at `BROKER.inbox`. Nothing mints a fresh link automatically — you do.

**What happens to it afterwards.** The **link** is cleared 7 days after he reads
it, or 30 days after the enquiry if he never does. **The enquiry itself is not
deleted** — it is the person's own record, it carries the evidence that they
consented, and the privacy policy says it stays until they delete it. Only the
token has a short life.

---

### Automation 4 — Fact-find ready (the broker's notification)

**This is the one that matters most, and the one to get exactly right.**

- **What it is for:** telling the broker a completed fact-find is waiting, and
  giving him the single-use link that reveals it.
- **Trigger:** tag `factfind-ready`.
- **Who receives it:** **the broker only.** Never the applicant.
- **Merge field needed:** `{{ subscriber.factfind_link }}` — the whole point of
  the email.
- **Email text:** *not written. You write this one.*

**What must be in it for the app's promise to be true.** The consent tick on the
fact-find reads:

> *"Share these answers with [broker's name], including my date of birth, my home
> address and my credit answer."*

and underneath it:

> *"They are not sent to our email provider. He is told there is a fact-find
> waiting and reads it here."*

**That second sentence is a factual claim about this automation.** It is true
only if the email contains the link and nothing else. If you paste any of their
answers into the email body, you have made the app lie to the person who ticked
the box, and you have put a date of birth into a marketing platform.

So the rules for this email are hard:

1. **It must contain `{{ subscriber.factfind_link }}`.** Without it he has no way
   in, and the person has consented to a disclosure that never happens.
2. **It must contain nothing about the applicant** — no name, no date of birth,
   no address, no credit answer, no phone number. Kit is not given those, so you
   would have to go and fetch them to break this rule. Do not.
3. **It must say the link expires and works once.** It is valid for **72 hours**
   and dies on first use (`FACTFIND_RULES.linkHours`). He should know not to sit
   on it.
4. **It must tell him to click the button on the page.** The link opens to a page
   with a single "Show the details" button, and the details appear only when he
   presses it. That is deliberate — email scanners follow links automatically,
   and the button stops a scanner burning his one use.

A working shape, for you to put in your own words:

> **Subject:** A fact-find is waiting
>
> Someone has completed the fact-find and consented to you seeing it.
>
> {{ subscriber.factfind_link }}
>
> Open it and press "Show the details". The link works once and expires after 72 hours.
>
> If it has gone, email [your inbox] and I will send a fresh one.

**If the link expires or he opens it twice**, he sees a page saying so, pointing
at the inbox address you set as `BROKER.inbox`. Nothing can mint a new link
automatically — you do it. So `BROKER.inbox` must be an address you actually
watch.

**What happens to the data afterwards**, so you can answer him if he asks: the
fact-find is deleted from the app **7 days after he reads it**, or **30 days**
after it was collected if he never does. The notification row carrying the link
is deleted at the same 30-day mark. His copy is then the only copy.

---

### Automations 5, 6, 7 — The three calculators

All three are the same shape.

- **What they are for:** somebody used a free calculator, got their answer on
  screen, and asked for it in writing.
- **Trigger:** the tool's own tag (`tool-equity`, `tool-stamp-duty`,
  `tool-rental-yield`).
- **Who receives it:** the person who used the calculator.
- **Merge fields needed, all three:** `{{ subscriber.tool_headline }}`,
  `{{ subscriber.tool_detail }}`, `{{ subscriber.tool_maths }}`.

**What must be in them for the app's promise to be true.** The offer on screen
says *"Your figures, in one email. Nothing else is sent."* and the confirmation
says *"On its way. Kit sends it, usually within a few minutes."*

Two obligations follow. **Their own numbers must be in it** — that is what the
three merge fields are for, and an email without them is not what was offered.
And **it must be one email**, not the opening of a sequence. Occasional marketing
afterwards is covered by the consent line they ticked; a five-part drip starting
immediately is not what "nothing else is sent" means.

None of these offers appear on the site until you have both created the tag and
named the automation in Step 5 — so nothing is promised before it exists.

---

#### Automation 5 — Equity calculator

> **Subject:** Your equity figure, and what it can do
>
> Here is what the calculator worked out for you:
>
> {{ subscriber.tool_headline }}
>
> {{ subscriber.tool_detail }}
>
> The working: {{ subscriber.tool_maths }}
>
> What that equity can do as a deposit: lenders normally want 20–25% down on a buy-to-let, so this figure is the raw material, not the whole deposit. Stamp duty, legal costs and a refurb budget come out of your side of it too.
>
> What it cannot do: it is not a valuation, and no lender will lend against it. They will send a surveyor.
>
> If you want to test a specific property against real sold prices, the analyser does that in about a minute.

#### Automation 6 — Stamp duty calculator

> **Subject:** Your stamp duty figure, and what moves it
>
> Here is what the calculator worked out for you:
>
> {{ subscriber.tool_headline }}
>
> {{ subscriber.tool_detail }}
>
> The working, band by band: {{ subscriber.tool_maths }}
>
> What changes it: the bands are set by the government and do change — the figure above names the date the rates you were given came into force. A change to the additional-property rates moves this number the most, because those rates apply to every band.
>
> What it does not cover: Scotland, mixed use, companies and the extra rate for non-UK residents.
>
> If you are buying to let, the analyser puts this tax into the deal and tells you whether it still works.

#### Automation 7 — Rental yield calculator

> **Subject:** Your yield figures, and the gap between them
>
> Here is what the calculator worked out for you:
>
> {{ subscriber.tool_headline }}
>
> {{ subscriber.tool_detail }}
>
> The working: {{ subscriber.tool_maths }}
>
> Why the two figures differ: gross is a year of rent over the price and ignores every cost. Net takes off the letting agent, maintenance, insurance, empty weeks and any ground rent. The gap between them is what those costs take, as a share of the price.
>
> Neither figure includes a mortgage. Both divide by the price; the analyser divides by your all-in cost, including stamp duty and refurb, which is the number to buy on.

*(All four drafts above are the exact text in `src/config/capture.ts` and
`src/config/bridging.ts`. If you reword them in Kit, the code does not need to
change — but do update the config too, so the two never drift apart.)*

---

## Step 4 — Test before anything is live

Do this while the config values are still blank, because **nothing is on the
public site yet**.

1. In Kit, add yourself as a subscriber.
2. Apply each tag to yourself by hand.
3. Check the right email arrives, and that the merge fields are **not** blank.

Merge fields will be empty on a hand-applied tag, because you have not filled in
the custom fields. Set them on your own subscriber record by hand so you can see
the email fully assembled. An email that reads "Here is what the calculator
worked out for you:" followed by a blank line is the failure you are testing for.

---

## Step 5 — Fill in the config values, in this order

Now the five values. Two files, both under `packages/web/src/config/`.

**Order matters.** Each one switches something on the moment it becomes real.

---

### 5.1 — The three tool tags → the calculator offers appear

**File:** `src/config/capture.ts`, in `CAPTURE_TOOLS`.

Each tool needs **both** values filled in:

```
kitTag:        the numeric tag id from Step 2
kitAutomation: the name of the automation you built in Step 3
```

**What goes live the moment you fill one in:** the "Want this in writing?" block
appears under the answer **on that calculator only**. Fill in one and test it;
the other two stay dark.

**Why two values and not one:** filling in `kitAutomation` is how you state that
the email really exists. A tag with no automation behind it would put an offer on
the page that nothing fulfils. Either value left empty and that tool shows no
offer at all.

**Risk if wrong:** low and contained. One calculator offers an email. The answer
itself is never gated behind it.

---

### 5.2 — `BROKER.kitTagFactFind` → nothing, yet

**File:** `src/config/bridging.ts`, in `BROKER`.

Paste the `factfind-ready` tag ID.

**What goes live:** **nothing.** The fact-find step needs the broker details in
5.3 as well, so on its own this value changes nothing on the site.

**Fill this in before 5.3, deliberately.** Doing it in this order means the
fact-find step goes live at the same instant the enquiry form does. Do it the
other way round and there is a window where people can send enquiries but the
fact-find step is missing.

---

### 5.3 — The broker block → ⚠️ THE PUBLIC FORM GOES LIVE

> ## ⚠️ Do not fill these in until you are ready to receive real enquiries
>
> **The bridging form appears on the public site the moment the last of these
> six values is real.** There is no separate publish step, no staging, no "are
> you sure". The next person to visit `/bridging-finance` sees a live form and
> can submit a real enquiry with a real phone number.
>
> **Fill these in only when the broker knows it is going live and has agreed to
> take the calls.**

**File:** `src/config/bridging.ts`, in `BROKER`. Six values:

| Value | What it is | Where it shows |
|---|---|---|
| `name` | The broker's name | **On the page**, and inside the consent tick: *"Share these answers and my contact details with [name]."* |
| `email` | His own email address | Where the fact-find notification is sent. Not shown to users. |
| `inbox` | Your dedicated inbox for this | Shown to him when a link has expired. Must be watched. |
| `kitTagQualified` | Tag ID from Step 2 | Not shown. |
| `kitTagNotYet` | Tag ID from Step 2 | Not shown. |
| `kitTagEnquiry` | Tag ID from Step 2 | Not shown. **Without it there is no form at all** — see below. |

Until then the page renders an honest placeholder instead of the form:
*"Enquiries are not open yet. The introduction goes live once the broker details
are set up. Nothing is collected until then."*

**The check is stricter than "not empty".** The three text values must not
contain `TBC` and must not contain `example.com`. So half-finishing this — a real
name but `TBC-broker@example.com` still in place — leaves the form correctly
hidden. You cannot accidentally go live with a placeholder address.

**Why `kitTagEnquiry` is in this list and not optional.** It is the tag that
delivers his link. Without it a qualified enquiry produces nothing he can read,
and the consent tick beside the form would be promising a disclosure that cannot
happen. So `brokerReady()` requires it, and with it missing the form does not
render and `POST /api/bridging` answers 404. No way to read it, no form.

**What goes live the moment all six are real:**

- `/bridging-finance` shows the two-step enquiry form to signed-in visitors
- The `POST /api/bridging` endpoint starts accepting and qualifying enquiries
- Qualified and not-yet enquiries start queuing to Kit
- **Qualified enquiries start minting the broker's single-use link**, and he
  starts being told one is waiting
- **And**, because you did 5.2 first, the fact-find third step goes live with it

**To reverse it:** put `TBC` back, or switch the `bridgingFinance` flag off in
`src/config/features.ts`. Either hides the form. Enquiries already stored stay
stored.

---

### After any config change

Someone needs to run the build and deploy — it is a code change, even though you
only typed words. Then check `/bridging-finance` in a private browser window to
confirm you see what you expect.

---

## What is not in the code — things you must decide or write yourself

Everything above comes from the code. These do not.

### You must write three emails

1. **The bridging "qualified" email** (Automation 1), to the person. No draft
   exists. It must not carry his link.
2. **The enquiry notification to the broker** (Automation 3). No draft exists —
   only the four hard rules above, which are not optional.
3. **The fact-find notification to the broker** (Automation 4). Same.

### Tell the broker what to expect

He now receives **two different links** for the same person, at two different
moments, and they are not interchangeable:

- **The enquiry link** comes first, the moment an enquiry qualifies. It shows him
  the deal: what they want to borrow, what they are putting in, how they repay,
  and their own words. This is what he decides from, and it carries the phone
  number he rings.
- **The fact-find link** comes later, and only if they fill in his questions. It
  shows him the borrower: date of birth, address, credit answer.

Both work once and expire in 72 hours. He should know that pressing the button is
what spends the view, so he should open them when he is ready to read, not to
file for later. If he loses one, only you can issue another.

### You must supply, from outside the code

- **A Kit plan with visual automations.** The free tier will not do this.
- **A sending identity** — from name, from address, reply-to. Every email above
  needs one and none of them specify it.
- **A postal address for the email footer.** Kit requires one and UK/EU law
  expects one. There is no address anywhere in this repo, by design.
- **The broker's real name and email**, and his agreement to be a subscriber in
  your Kit account.
- **A dedicated inbox** for `BROKER.inbox` that you actually watch — it is the
  only route back when a link expires.
- **Real links** for the three pointers in the not-yet email.
- **A decision on the broker's exclusion from broadcasts.** He will be a
  subscriber. He should not receive your marketing.
- **A welcome email, if you want one** — and a trigger for it, since marketing
  consent applies no tag.

### A judgement call worth making now

The three calculator emails end by pointing at the analyser. That is fine. But
decide what happens **next** for those people, because the consent line says
*"and occasional property emails"*. Occasional is a promise. Decide what it means
before you have a list, not after.

---

## Quick reference

| Thing | Count | Where the code reads it |
|---|---|---|
| Custom fields | 6 | `KIT_FIELDS` (capture.ts), `KIT_FACTFIND_FIELD` (factfind.ts), `KIT_ENQUIRY_FIELD` (enquiryLink.ts) |
| Tags | 7 | `CAPTURE_TOOLS[].kitTag`, `BROKER.kitTag*` |
| Automations | 7 | Kit only — the code names them, never calls them |
| Emails already drafted | 4 | `EMAIL_DRAFTS` ×3, `BRIDGING.notYetEmail` |
| Emails you must write | 3 | Bridging qualified; enquiry notification; fact-find notification |
| Config values to fill | 6 broker + 3×2 tool | `bridging.ts`, `capture.ts` |
| Secret | 1 | `KIT_API_KEY` (Worker secret) |
