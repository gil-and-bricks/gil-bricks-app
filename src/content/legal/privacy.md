# Privacy (placeholder — final wording lands in a later sprint)

We keep this simple and honest.

**What we store when you sign in:** your email address, name and avatar from
Google, when you created the account, and whether you ticked the marketing
box (with when and which version of this text you saw).

**Where it lives:** our database runs on Cloudflare D1 in the **EU
jurisdiction**, which the UK recognises under its **data adequacy**
arrangements. (We say "EU jurisdiction + UK adequacy" because that is
exactly what it is — there is no UK-only residency option.)

**Who we share with, and why:**

- **Google** — sign-in only. We never see your password.
- **Cloudflare** — hosts the site, the database and the Turnstile
  human-check on account creation.
- **Kit** — our email provider, and ONLY if you tick the marketing box.
  Untick it (or delete your account) and we tell Kit to stop.
- The area pages call official open-data services (police.uk, Environment
  Agency) directly from your browser — those requests come from you, not us.

**No cookie banner because no tracking:** the only cookies are strictly
necessary — your sign-in session, a 10-minute helper cookie during the
sign-in hop itself, and Turnstile's own bot-check cookie on account
creation. No analytics cookies, no ad tech.

**Delete everything:** the account page has a delete button. It removes your
account and saved deals, and queues an unsubscribe to Kit.
