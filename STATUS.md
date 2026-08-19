# C4C Lab — Current Status

Living handoff doc. Read this first in a new session.
Last updated: August 10, 2026.

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

---

## Conventions that matter

- **Never use em dashes, en dashes, or `--` in any user-facing text.**
- Admins count as creatives: include them in every creative picker and stat.
- `DESIGN.md` is the design source of truth; `src/styles/theme.css` holds all
  brand tokens. Do not hardcode hex values.
- `main` auto-deploys to production on push. Verify before pushing.
