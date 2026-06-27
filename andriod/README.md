# IRIS — Android Engine

This app is intentionally thin. It does only what only Android can do:

- Read incoming SMS (`SmsReceiver`)
- Read incoming WhatsApp notifications (`WhatsAppNotificationListener`)
- Check whether a sender is a saved contact (`TrustChecker`) — the real,
  device-level version of the trust-by-contact rule
- Actually send things: SMS via `SmsManager` (`SmsSender`), WhatsApp via the
  notification's own reply action
- Poll the backend every ~15 min for anything approved-but-not-yet-sent, and
  for due scheduled messages (`SyncWorker`)

Everything else — classification, drafting, applicant tracking, decisions,
the dashboard UI — lives in `/web`. This app has no local database and no AI
calls; it's a client of the backend, not a copy of it.

## Setup

1. Deploy `/web` to Vercel first (see its own README) — you need the live
   URL and the shared secret before this app can do anything.
2. Copy `local.properties.example` → `local.properties` and fill in:
   ```
   BACKEND_URL=https://your-app.vercel.app
   DEVICE_SHARED_SECRET=the_same_secret_you_set_in_vercel
   DASHBOARD_URL=https://your-app.vercel.app
   ```
3. Open in Android Studio, build, install on your own device (sideloaded —
   this isn't Play-Store-ready, see the SMS permission note below).
4. Grant SMS, Contacts, and Notification permissions when prompted.
5. Tap "Enable Notification Access" in the app to grant WhatsApp reading —
   this is a manual system-settings toggle, not a popup dialog, so the app
   deep-links you straight to the right screen.
6. Use "Open Dashboard" to see/manage everything from there going forward.

## Known limitations, carried over honestly from the demo phase

- **WhatsApp has no chat history** — only sees messages from when the
  listener was turned on forward.
- **WhatsApp group chats are skipped** entirely, on purpose.
- **WhatsApp scheduled/proactive messages aren't possible** — the
  notification reply action only works in *reply to* an existing
  notification; there's no way to compose a fresh outbound WhatsApp message
  this way. Scheduled messages (the "good morning" feature) only work over
  SMS — see `scheduled-due.ts` in the backend, which filters to SMS-only.
- **WhatsApp sends can fail if the app was killed** between the message
  arriving and the owner approving it on the dashboard, since the reply
  action only exists in memory. `SyncWorker` detects this and reports
  `send_failed` so the dashboard tells you to reply manually instead of
  silently dropping it.
- **Play Store**: Google requires apps reading `RECEIVE_SMS`/`READ_SMS` to be
  the user's default SMS app (with few exceptions) to get those permissions
  via the Play Store. Fine for personal sideloading; would need addressing
  before any public release.
