# Privacy

**Version 2026-09-06.**

**I am not a lawyer.** This page is written to describe honestly what this site
collects, where it goes and how to get rid of it. Every line below describes
something the code actually does.

## The short version

You can use the analyser, the area data and the three tools without an account
and without giving me anything. Nothing you type into them reaches me unless
you sign in and save something, send a bridging enquiry (and, if it qualifies,
answer the broker's questions), or ask a tool to email you its breakdown. There is no advertising, no analytics and no tracking, which
is why there is no cookie banner.

## What is stored, and only when

**Nothing, until you do one of these five things.**

**1. You sign in with Google.** Google tells me your email address, your name
and a link to your profile picture. That is all I get — never your password.
Stored with it: the date you signed up, and whether you ticked the marketing
box, with the time you last changed that and the version of the marketing
wording current at the time.

**2. You save a deal.** Stored: the strategy, the title of the deal, the
figures behind it (the analyser's own settings, which include the postcode and
any house number you typed), and the headline figure. Once it is in the
pipeline, every stage change is kept with its time, along with a snapshot of
the assumptions and the minimums the score was worked out against.

**3. You send a bridging enquiry.** Stored: your name and email from your
account, the **phone number** you type on that form, how much you want to
borrow, your deposit band, whether you have found a property, how you would
buy it, how you would repay it, when you need the money, your credit answer,
what you wrote in your own words, the outcome, and the time you ticked the
consent box. This is the only place on the site that asks for a phone number,
because the outcome of that enquiry is a phone call.

**4. Your enquiry qualifies and you fill in the broker's questions.** If — and
only if — the enquiry passes the checks above, you are asked for the details the
broker needs to go and get quotes: your **name**, whether a limited company is
buying and its name, your **date of birth**, your **home address**, whether you
own your home and who your mortgage is with, whether you own other property,
whether you have refurbishment experience, whether you have **good credit** and
whether an up-to-date credit report is available, roughly what you hold in
savings, and where the deposit comes from — including, **if the deposit is a
gift, who it is from**, and if it comes from a remortgage, which property that
is. Stored with it: the time you ticked the consent box and the version of the
wording you ticked. That record of your consent is kept with the enquiry after
the answers themselves have been deleted, because I have to be able to show that
you agreed. You have to tick that box, and it names him and those details.

**There is no upload.** The broker's own form takes a credit report file; this
one does not, and never will. It asks only whether one is available, and he asks
you for it directly. A stored credit report is the most damaging single thing
this site could ever leak, and it belongs on his system, not mine.

**5. You ask a tool to email you its breakdown.** Stored: the email address you
gave (or the one on your account), the figures that were already on your screen
and which tool produced them. You have to tick the box. The answer itself never
needs an email, and you do not need an account.

I hold **no payment details**, and never will — there is nothing to pay for.
There is no password to steal: sign-in is Google's.

## Who else sees anything

- **Google** — sign-in only, if you use it. Google knows you signed in here, and
  your profile picture loads from Google's servers on pages where it is shown.
- **Cloudflare** — hosts the site, the database, the public data files and the
  Turnstile human-check. Like any host, it sees the requests your browser makes,
  including your IP address.
- **Kit** — the email provider. Kit sends every email; this app sends none. Kit
  receives your email address and first name if you tick the marketing box, if
  you send a bridging enquiry, or if you ask a tool to email you its breakdown.
  In that last case Kit also receives the figures from that answer, so the email
  can give you your own numbers back.
- **The bridging broker** — only if you send a bridging enquiry and tick the
  consent box. The enquiry is stored here and Kit emails it to him; this app
  sends no email itself. He is an independent business and decides for himself
  what he can help with. No saved deal and no analysis is ever passed to him.
  While his details are not yet set up the form does not appear at all, so
  nothing can be sent.
  **The broker's questions (the fourth thing above) never go through Kit.** Kit
  is an email tool, and a date of birth, a home address and a credit answer do
  not belong in one. Those answers stay in the database here. Kit receives three
  things and no more: **his** email address, **his** name, and a link. The link
  works **once**, stops working after three days, and shows him the answers on a
  page here — which is not indexed, not cached and not stored by his browser.
  Our own copy of that link is deleted the moment Kit has taken it; after that
  only a one-way fingerprint of it is kept, so it cannot be recovered from the
  database.
- **Open-data services, called by your browser** — HM Land Registry, police.uk,
  the Environment Agency, planning.data.gov.uk and the ONS data we publish on
  Cloudflare. Those requests carry a postcode or a location and your IP address.
  They never carry your name, your email or anything from your account.
- **YouTube** — only on the credit page, and only if you press play on a video.
  Nothing loads from YouTube until you do.

Nobody buys, rents or is sold your data. There is no advertising network and no
analytics on this site. One page — the credit page — carries a single affiliate
link, marked as an advertisement on the page; clicking it takes you to that
company's own site, and nothing about you is sent with you.

## Where it lives

The database is Cloudflare D1, created in Cloudflare's **EU jurisdiction**. The
UK recognises the EU under its data adequacy arrangements, so this is lawful
for UK users. There is no UK-only residency option for D1 — "EU jurisdiction
with UK adequacy" is the honest description, and I will not claim more.

## Cookies

Three, all strictly necessary, none for tracking:

- the sign-in session cookie, which lasts 30 days and is hidden from page
  scripts;
- a 10-minute security cookie used only during the sign-in hop itself;
- Turnstile's own cookie, which Cloudflare sets when the human-check runs.

If a tool offers to email you its breakdown and you dismiss the offer, your
browser remembers that for the tab, in its own session storage. While you are
filling in the broker's questions, your browser keeps your answers there too, so
a reload or a Back does not make you type your date of birth twice. Both go when
you close the tab, and neither leaves your device until you send it.

## The human-check

Creating an account, and asking a tool to email you at an address you type,
both run a Cloudflare Turnstile check. That sends a challenge token and your IP
address to Cloudflare to confirm you are a person. Turnstile is not analytics.

## How long things are kept

- Your account, saved deals and pipeline stay until you delete them.
- The sign-in session expires after 30 days.
- A tool lead — the email address and figures behind "email me this
  breakdown" — is deleted within 90 days of being sent.
- Other queued email instructions (a subscribe or an unsubscribe) hold only an
  email address and first name, and are deleted when you delete your account.
- A bridging enquiry is kept until you ask for it to be deleted or you delete
  your account.
- **The broker's questions are kept for days, not for ever.** Once he has opened
  the link and read them, the copy here is deleted within **7 days** — from that
  moment they are his record, not mine. If he never opens it, they are deleted
  **30 days** after you sent them, whether he read them or not. A job that runs
  every quarter of an hour does the deleting; nothing waits for me to remember.

## Getting your data, or deleting it

**Delete everything** is a button on the account page. It permanently removes:
your account record, every saved deal and everything in your pipeline, any
bridging enquiry you sent, **the broker's questions and your answers to them —
which also kills his link on the spot, even if he has not opened it** — anything
a tool queued for your email address, and any queued message about you. If you had consented to marketing, one record
keeps just your email address long enough to tell Kit to unsubscribe you, and
that record is blanked once Kit has done it. You are signed out. It cannot be
undone.

If the broker already has a copy of an enquiry, ask and I will tell him to
delete it — I cannot delete it from his systems myself.

**Want a copy of what is held?** Ask through the links in the footer and I will
send you everything the database has about you.

## Your rights

You can ask for a copy of your data, ask for it to be corrected, or ask for it
to be deleted. Where the lawful basis is consent — marketing email, a bridging
enquiry, **the broker's questions**, a tool emailing you a breakdown — you can
withdraw it at any time by
unsubscribing from any email, by unticking the box on your account page, or by
asking. Withdrawing does not undo something that already happened, like a call
you have already had.

If you think this has been handled badly you can complain to the Information
Commissioner's Office at ico.org.uk.

## Contact

Reach me through the Instagram or YouTube links in the footer.
