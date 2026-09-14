# The domain cutover — what only you can do

Everything in the code is done and deployed. These four things live in consoles
I cannot reach, and **sign-in breaks if the first one is wrong**. Do them in
this order.

---

## 1. Google — so sign-in keeps working ✅ DONE (verified: no redirect_uri_mismatch)

> **THIS IS BROKEN RIGHT NOW AND I CONFIRMED IT.** I followed the live
> sign-in redirect from https://proplaunch.ai through to Google and it answers
> **`Error 400: redirect_uri_mismatch`**. The same check against the old
> address comes back clean, so it is this one URI and nothing else. Until you
> do this step, nobody can sign in on the new domain. Everything else on the
> site — browsing, the analyser, the map, the tools — works.

**What breaks without it:** every sign-in on the new domain fails with
`Error 400: redirect_uri_mismatch`. Existing signed-in users are logged out by
the move anyway (see §5), so this blocks *everyone*, not just new sign-ups.

**Why:** the Worker builds Google's callback address from whichever domain
served the page. On proplaunch.ai it will send Google
`https://proplaunch.ai/auth/callback`, and Google refuses any address not on its
list.

**Where to click**

1. Go to **https://console.cloud.google.com/apis/credentials**
   — make sure the project selector at the top is the project that owns
   sign-in. (If that page redirects you, the same screen is at
   **https://console.cloud.google.com/auth/clients** — Google is midway through
   moving it to "Google Auth Platform → Clients". Either page works.)
2. Under **OAuth 2.0 Client IDs**, click the client whose ID starts
   **`548405055261-7h7g1bsbc6ouoa04470ohr3ifigjbbfp`**.
3. Find the box headed **Authorized redirect URIs**.
4. Click **+ ADD URI** and paste exactly:

   ```
   https://proplaunch.ai/auth/callback
   ```

5. **Leave the existing entry alone.** There will already be
   `https://gil-bricks-app.gil-782.workers.dev/auth/callback`. It must stay:
   the old address still serves `/auth` for anyone mid-sign-in and for the
   published extension. Remove it only once the store stats show the old
   extension version is gone.
6. Click **SAVE** at the bottom.

**Do NOT add anything under "Authorized JavaScript origins".** This app uses the
server-side redirect flow and loads no Google JavaScript, so that box is not
used. Adding entries there does no harm but proves nothing, and an empty box is
not the cause if something fails.

**Google's changes can take a few minutes** (occasionally longer). If you get
`redirect_uri_mismatch` immediately after saving, wait five minutes and retry
before changing anything else.

**How to check it worked:** open **https://proplaunch.ai**, sign in, and land
back on the site signed in. That is the whole test.

---

## 2. Cloudflare Turnstile ✅ DONE (hostname added)

**What breaks without it:** *new account creation* fails with "human check did
not pass". Returning users are never challenged, so you may not notice.

**Where to click**

1. Cloudflare dashboard → **Turnstile** (left sidebar).
2. Open the widget whose **Site Key** is `0x4AAAAAAEjDnxbmFpl9_C_M`.
3. Look at **Hostname management**.
   - If the list is **empty / "any hostname"**, there is nothing to do.
   - If it **lists hostnames**, add `proplaunch.ai` and `www.proplaunch.ai`, and
     leave `gil-bricks-app.gil-782.workers.dev` in place.
4. Save.

*(A note on history: the decisions log has an old entry blaming a hostname
allowlist for a Turnstile failure. That entry was superseded — the real cause
then was a secret key pasted in as the site key. This step is an ordinary
precaution for a new hostname, not a repeat of a known bug.)*

**How to check it worked:** sign out completely, then create a **brand-new**
account on https://proplaunch.ai with a Google account that has never used the
site. Automated browsers are refused tokens by design, so this one genuinely
needs a human.

---

## 3. Cloudflare — the Cache Rule ✅ DONE (deployed; measured DYNAMIC → HIT)

**This is the performance fix.** Without it the bucket is on our own domain but
Cloudflare still does not cache it: every request goes to the bucket, exactly as
before. I proved the cause rather than guessing — two files uploaded to the same
bucket with the same cache header behaved differently, a `.css` cached (MISS
then HIT) and a `.json` did not (DYNAMIC every time). Cloudflare decides what to
cache by **file extension** by default, and `.json` and `.pmtiles` are not on
its list. A Cache Rule overrides that.

**Where to click**

1. Cloudflare dashboard → select **proplaunch.ai**.
2. Left sidebar → **Caching** → **Cache Rules**.
3. Click **Create rule**.
4. **Rule name:** `Cache the data bucket`
5. Under **If incoming requests match…** choose **Custom filter expression**,
   then set: **Field** `Hostname` · **Operator** `equals` · **Value**
   `data.proplaunch.ai`
6. Under **Then…**
   - **Cache eligibility:** select **Eligible for cache**
   - **Edge TTL:** select **Use cache-control header if present, use default
     Cloudflare caching behaviour if not**
   - **Browser TTL:** leave as **Respect origin TTL**
7. **Deploy**.

**How to check it worked** — run this and look at the last column. The first
request may say MISS; the second must say **HIT**:

```bash
for i in 1 2 3; do curl -s -o /dev/null -D - https://data.proplaunch.ai/manifest.json | grep -i cf-cache-status; done
```

Tell me when it is deployed and I will re-run the before/after measurement
properly.

---

## 4. Chrome Web Store — the listing and a new version

The extension in the store still points at the old address. It **keeps working**
— the old host deliberately still serves `/api` for exactly this reason — so
there is no rush, but the listing URLs are wrong today.

**4a. Fix the listing text (2 minutes, no review needed for the URL field)**

1. Go to **https://chrome.google.com/webstore/devconsole**
2. Open **PropLaunch Deal Analyser** (item id
   `gldjllfgdcmdmccmmienfcgnkigkgfam`).
3. Left sidebar → **Store listing**.
4. In **Privacy policy URL**, replace the old address with:
   ```
   https://proplaunch.ai/extension/privacy
   ```
5. In the **Description**, the last line names the same URL — change it too.
6. **Save draft**, then **Submit for review**.

**4b. Upload the rebuilt extension (this one goes through review)**

The rebuilt package points at the new domain. Its `host_permissions` changes
from the old workers.dev host to `https://proplaunch.ai/*` — one host swapped
for one host, no new capability, which is the least disruptive shape for review.

1. Same console → left sidebar → **Package** → **Upload new package**.
2. Upload the zip from `packages/extension/store/` (I will tell you the
   filename when you want to ship it — say the word and I will build and
   version it).
3. Left sidebar → **Privacy practices**: nothing changes. The permission
   justifications still read correctly; only the hostname moved.
4. **Submit for review.**

**Until the new version is live**, installed copies talk to the old address and
everything works. Do not turn off anything on the old host until the store's
statistics show the previous version has drained.

---

## 5. Two things that will happen, and are meant to

- **Everyone gets signed out once.** The session cookie is `__Host-`-prefixed,
  which means the browser locks it to exactly one hostname. A session issued on
  the old address cannot travel to the new one. Nobody loses anything — the
  account, the saved deals and the pipeline all belong to the user, not the
  host. They sign in again and everything is there.
- **The old address still answers.** Pages bounce to proplaunch.ai with a
  permanent redirect; `/api`, `/auth` and `/broker` keep serving, because the
  published extension and any broker link already sent depend on them.
