# C4C Lab Status

Living handoff doc. Read this first in a new session.
Last updated: August 20, 2026.

---

## Where things stand in one line

The web app is live at **c4clab.com** and installable on phones. The iPhone
app is fully built locally but **not submitted**, blocked only on paying
Apple's $99/year developer fee.

---

## Live in production (c4clab.com, auto-deploys from `main` via Vercel)

- Full C4C Lab platform: admin, creative, editor, and client roles
- Plum/violet rebrand, Horizon + Poppins fonts, real badge logo
- Light/dark theme toggle (sidebar footer and mobile top bar)
- Mobile navigation: off-canvas drawer, safe-area handling
- Calendar renders on a light surface (`.calendar-light` scope in theme.css)
- Sign in, plus Create Account with role picker (Creative / Visionary)
- Applications land in **pending approval**, never straight into the app
- Public `/privacy` and `/support` pages (required by both app stores)
- **Installable PWA**: Add to Home Screen gives a full-screen app, icon "C4C"

## Built locally, not shipped

- **Native iOS app** (Capacitor 6). Builds and runs, verified in simulator.
  - Bundle ID `com.connectfourcreative.c4clab`
  - Home screen label **C4C**; full name **C4C Lab**
  - Icon + splash generated from `resources/icon.png`
  - Xcode project at `ios/App/App.xcworkspace`

---

## Legal + abuse hardening (Aug 20, code committed, DB NOT yet applied)

Code side is done and builds. **Two migrations still need to be run against
production** before the protections are real. See "Deploying the DB half".

- **`/terms` user agreement** (`src/pages/public/Terms.jsx`), public, no login.
  Binding arbitration written **provider-neutral**: no forum named, defers to
  whatever consumer rules apply, and caps what arbitration can cost the
  claimant. Single arbitrator, seated in Maryland, English, remote
  participation. Class action waiver, 30 day informal resolution first, small
  claims carve-out. Liability
  capped at the LESSER of 12 months of fees paid or $10,000, with a savings
  clause. Indemnification. Governing law Maryland. AS IS warranty disclaimer.
- **Clickwrap on the application form.** Consent line sits directly under
  "Send application", which is what makes the agreement enforceable.
- **Privacy policy data deletion section.** Per-category retention, how to
  request deletion, and the commitment: erased from live systems and backups
  **within 30 days** of a confirmed request, except where law requires
  retention. Support page carries the same 30 day language.
- **Rate limiting on both public edge functions.** Counters live in Postgres
  (`check_rate_limit`), not in memory, because edge functions run on many
  isolates and an in-memory Map just resets. Identifiers are SHA-256 hashed, so
  no raw IPs or emails are stored. Fails OPEN on a DB error, so the limiter
  cannot itself take signups down.
  - join-waitlist: 5/hr and 20/day per IP, 3/day per email, 200/hr global
  - forgot_password: 5/hr per IP, 3/hr per email, 100/hr global. Returns a
    normal 200 when limited so it still reveals nothing about which emails exist
- **Honeypot** on the application form. Hidden `company-website` field. Bots
  fill it, humans cannot see it; the function returns a fake success so the bot
  does not retry with it cleared.
- **Link contrast fix** on the three public legal pages. Links were at 2.68:1
  against the dark ground, effectively unreadable, on exactly the pages Apple
  reviewers open. Now `text-accent-hover` plus a permanent underline: 3.41:1
  and no longer color-only (WCAG 1.4.1).

### Edge function auth (Aug 20). Fixed, needs redeploy

An audit of all ten edge functions found three real holes. All three run with
the service role key, which bypasses every RLS policy.

1. **create-user: forgeable admin gate. This was the serious one.** The gate
   decoded the JWT payload with `atob()` and trusted the `role` claim inside
   it. A JWT payload is base64, not a signature. Anyone could send
   `Bearer x.<base64 of {"role":"service_role"}>.x` and be treated as the
   backend, which unlocks `set_password` on **any account**, `delete_user`,
   `update_user`, and `get_users`. That is total takeover of every account,
   admin included, from a single unauthenticated request.
   - Severity depends on whether this function is deployed with
     `--no-verify-jwt`. With gateway JWT verification ON, the forged token is
     rejected before it reaches the function, so this is defence in depth
     rather than a live hole. There is no `config.toml` in the repo, so the
     deployed setting is not recorded anywhere. **Worth confirming in the
     dashboard.** Either way the gate itself was wrong and is now fixed.
   - Fix: `_shared/auth.ts`. `isServiceRole()` compares the raw token to the
     real key in constant time; the admin path goes through
     `supabaseAdmin.auth.getUser()`, which validates against the auth server.
2. **r2-upload: no caller check at all.** It mints presigned R2 URLs, so an
   unauthenticated caller could hand themselves a download link for any object
   in the bucket, meaning every client's raw footage and finals. Now requires a
   verified signed-in user; `set-cors` requires an admin.
3. **send-notification: no caller check.** It is a database webhook, but
   nothing verified that. Anyone reaching it could post their own `record` and
   send an email from the verified c4clab.com domain, or a push notification,
   to any user on file. A ready-made phishing channel wearing our branding.
   Now requires the service role key.

Verified sound, left alone: `shoot-download` (validates a claim token, checks
expiry, and scopes images to the claimed shoot), `send-digests` (verifies the
JWT and only pushes to the caller's own id), `r2-list`, `r2-delete`,
`r2-organize` (verified user, explicit null check, role check).

**Known IDOR still open:** `r2-upload` `presign-download` takes an arbitrary
object key, so a signed-in user of one client can mint a link for another
client's object *if they learn the key*. Closing it means mapping keys back to
a project and checking the caller's access. Noted in a comment in the function.

**Deploy risk, read before shipping send-notification:** the service role gate
assumes the Database Webhook is configured to send the service role key as its
`Authorization` header. If it is not, notification emails and push stop
silently. Check the webhook's headers in the Supabase dashboard **before**
deploying that one, and send yourself a test notification after.

### Row level security

`supabase/rls_audit.sql` is read-only. **Run it first and keep the output.**

What the repo showed:

- **`profiles` had no RLS and no policies anywhere in version control.** Names,
  phone numbers, and roles, readable and writable by any signed-in user.
- **`clients` and `photo_revision_comments` had policies but no
  `enable row level security`.** Policies with RLS off do nothing. The
  dashboard shows a tidy policy list and the table is wide open. Worst case,
  because it looks protected.

`20260820000002_enable_rls.sql` handles it, and is written so it cannot
lock everyone out:

- Real `profiles` policies. You always see yourself; team (admin/creative/
  editor) sees everyone; **clients see only themselves plus the team**, so one
  client cannot enumerate another client's contact name and phone.
- Recursion guard: `app_current_role()` is `security definer`. A policy on
  `profiles` that reads `profiles` recurses forever without it. It must stay
  security definer.
- **Privilege escalation guard.** Column level grants make `id` and `role`
  unwritable by any logged-in client, so "edit your own profile" can never mean
  "make myself an admin". Role changes go through the create-user function on
  the service role. This sits one layer below RLS, so no future policy mistake
  can reopen it.
- Bulk enable is deliberately limited to tables that **already have policies**.
  That is the safe class: it activates protection already written.
- Tables with no RLS and no policies are **left alone** and raised as warnings
  in the migration output. Enabling RLS there would deny all access and break
  whatever reads them.

### Deploying the DB half

```bash
# 1. Run supabase/rls_audit.sql in the SQL editor first. Save the output.
# 2. Apply the migrations
supabase db push
# 3. Redeploy every function touched by the rate limit and auth work.
#    Check the send-notification webhook headers FIRST (see above).
supabase functions deploy join-waitlist --no-verify-jwt
supabase functions deploy create-user
supabase functions deploy r2-upload
supabase functions deploy send-notification
# 4. Re-run rls_audit.sql and compare. Section 3 should list only
#    waitlist and rate_limits. Anything else there is locked out.
```

**Smoke test right after, in this order:** sign in as an admin, sign in as a
client, open a project, post a comment, change your own name in Settings. If
any of those break it is an RLS policy, not the app. Keep the audit output so
you can see exactly which table changed state.

---

## The one blocker

**Apple Developer $99/year is unpaid.** The account is approved; the
membership just is not active, and Apple will not accept an upload without it.

### When funds are available, the remaining path

1. Pay at developer.apple.com (2 minutes)
2. In the repo:
   ```bash
   npm run build && npx cap sync ios && npx cap open ios
   ```
3. In Xcode: select the project → Signing & Capabilities → pick Team
4. Set version `1.0.0`, build `1`
5. Product → Archive → Distribute → App Store Connect → Upload
6. In App Store Connect, create the listing:
   - **Name:** C4C (short) or C4C Lab
   - **Privacy URL:** https://www.c4clab.com/privacy
   - **Support URL:** https://www.c4clab.com/support
   - **Screenshots:** `~/Desktop/C4C-Lab-App-Store-Screenshots/` (1320x2868)
   - Copy: see "Store listing copy" below
7. Submit. Apple review is typically 1 to 3 days.

Realistic: live about 3 to 4 days after paying.

---

## Store listing copy (drafted, pun-forward by request)

- **Subtitle:** Four your whole team
- **Promo:** Shoots, edits, reviews, and approvals, all fource in one place.
  Four your team, four your clients, four the work.
- **Keywords:** creative,content,video,review,shoot,edit,approval,agency,
  collaboration,connect,production,client
- **Category:** Business (or Productivity)

---

## How applications work (verified end to end)

There is **no self-signup anywhere** (`signUp` appears nowhere in `src/`).
Applying only writes a `waitlist` row; access requires an admin invite.

- Applicant picks Creative or Visionary (editor) on the sign-in screen
- Stored in `waitlist` with `role`, `phone`, `status='pending'`
- Edge function `join-waitlist` emails **yourmove@connectfourcreative.com**
  with role, name, email, tappable phone, and their notes
- Applicant sees a Pending approval screen and cannot sign in

---

## Known gaps / next candidates

1. **No admin screen to approve applicants.** Applications email you, but
   approving means manually inviting from the admin panel. Highest-value gap.
2. **No install prompt.** Most users never discover Add to Home Screen, so the
   PWA is underused. Quick win.
3. **ffmpeg loads from unpkg CDN** (`src/lib/videoConvert.js`). Fine on web;
   should be bundled locally before relying on HEVC conversion in the native
   app under a strict CSP.
4. **Store screenshots are all sign-in screens** because the app interior is
   behind login. Stronger listing would show a project or review screen.
5. **Native push is off** on iOS (web push cannot work in the webview). Would
   need a Capacitor push plugin wired to APNs.
6. Test rows named **"ZZ Test" / "ZZ Dedup" / "ZZ UI Test"** should be deleted
   from the `waitlist` table.
7. **The two Aug 20 migrations are not applied to production yet.** Until they
   are, `profiles` is still open and the rate limiters silently fail open
   (`check_rate_limit` will not exist, the helper logs and lets traffic
   through). Code is safe to ship ahead of the DB; the protection just is not
   on until step 2 above runs.
8. **The arbitration clause still wants a lawyer's read**, though it is now
   provider-neutral and fee-capped, which is the shape that survives review.
   Have counsel confirm the fee-shifting language matches whichever provider
   you settle on. Flagged in a comment at the top of `Terms.jsx`.
9. **`r2-upload` presign-download IDOR** is open (see above). Highest-value
   remaining security item.
10. **Confirm whether `create-user` is deployed `--no-verify-jwt`.** If it is,
   the forged-token gate was live, not theoretical, and any account could have
   been taken over. Consider rotating the service role key and forcing a
   password reset if you find that it was.

---

## Conventions that matter

- **Never use em dashes, en dashes, or `--` in any user-facing text.**
- Admins count as creatives: include them in every creative picker and stat.
- `DESIGN.md` is the design source of truth; `src/styles/theme.css` holds all
  brand tokens. Do not hardcode hex values.
- `main` auto-deploys to production on push. Verify before pushing.
