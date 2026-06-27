# IRIS — AI Message Receptionist

Reads your incoming SMS and WhatsApp, screens/classifies them, handles
routine back-and-forth on its own where it's safe to (rental inquiries from
unknown numbers), and only interrupts you for real decisions. Everything
else is reviewable from a web dashboard.

## Architecture — three pieces, not one

```
/android   Native Kotlin app. The ONLY piece that can read SMS/WhatsApp
           notifications or actually send anything. No AI logic, no
           database — it's a thin client of the backend below.

/web       Next.js app on Vercel. Two jobs in one codebase:
             - /pages/api/*  the backend: holds the Claude API key, runs
               all classification/drafting/applicant-tracking logic,
               reads/writes Supabase
             - /pages/index.tsx  the dashboard: a PWA you can install on
               your phone or open in any browser, showing decisions
               waiting on you, the approval queue, applicants, schedule

/supabase  schema.sql — run this once in a fresh Supabase project. Shared
           database both the Android app (indirectly, via the backend)
           and the dashboard read/write.
```

Why split it this way: only Android can read device SMS or another app's
notifications — that's an OS capability, not something a website can do.
Everything else (the actual "thinking") doesn't need to be on the phone at
all, and keeping it off-device means the AI API key never ships inside an
APK someone could extract.

## Setup order (each step needs the previous one)

1. **Supabase**: create a project, open the SQL editor, run
   `supabase/schema.sql`. Grab your project URL and **service role key**
   (Settings → API) — not the anon key, the service role one.
2. **Vercel**: deploy `/web`. Set environment variables (see
   `web/.env.example`): `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and a `DEVICE_SHARED_SECRET` you make up
   (e.g. `openssl rand -hex 32`). Once deployed, visit the URL — you
   should see the (empty) dashboard.
3. **Android**: open `/android` in Android Studio. Copy
   `local.properties.example` → `local.properties`, fill in your Vercel
   URL and the same shared secret. Build, install on your own device,
   grant permissions, enable WhatsApp notification access, done.

Full detail for each piece is in that folder's own README.

## What's real vs. what's still a known gap

**Solid and tested** (this logic was built and stress-tested in a browser
demo before being ported here, including catching and fixing several real
bugs along the way — see the trust-by-contact rule, the duplicate-question
fix, the boolean-parsing fix):
- Classification, rental Q&A auto-pilot, applicant scoring, decisions,
  viewing scheduling, style learning, conversation summarization, the
  trust-by-contact rule, scheduled SMS messages.

**Real limitations, not oversights** (documented in detail in `/android`'s
README): WhatsApp has no chat history, group chats are skipped, WhatsApp
can't send proactive/scheduled messages (reply-only), and a WhatsApp send
can fail if the app was killed before the owner approved it — the dashboard
will say so rather than failing silently.

**Not yet built**: real Google Calendar integration (viewing slots are
currently a fixed mock list), a proper onboarding flow that explains each
permission before requesting it, and multi-business-profile support.
