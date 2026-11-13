# F7: Offline sync and upload

**Status:** approved by Ryan, 13 Nov 2026; built <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M6
**Branch:** `f7-sync`

Anthro Collect is a student research project at Ashesi University.

## Goal (one sentence)

Everything a collector records reaches the server by itself, in the right order, whenever there is
signal, without ever being lost, sent twice or stuck unseen; and the collector always knows what is
still on the phone.

## What already exists (built in F4–F6)

- Three queues on the phone (IndexedDB): consents (with signatures), measurements, photos.
- Sent in order: consent → measurements → photos; each item deleted from the phone only after the
  server confirms (POLICY §12).
- Sending starts when something is saved, when the app opens, and when the phone comes back online.
- Home shows a badge: "N waiting" / "All saved".
- The Worker checks login and ownership before every write to storage; JPEG only, 4 MB maximum.
- Re-sending is safe: participants, consents, measurements and photo rows are keyed, and a photo
  upload overwrites the same file.

## What is missing (this spec)

1. **Retry while online.** If a send fails while the phone stays online (weak signal, server busy),
   nothing tries again until the next save or app opening. → Retry by itself every minute, then
   2, 4, 8 … up to 15 minutes between tries, while the app is open and online. Reset on success.
2. **One send at a time.** Two triggers at once can start two sends of the same item. → A single
   sender; a trigger during a send asks for one more round afterwards.
3. **Stuck items are seen.** Some refusals will never succeed (e.g. the server refuses a row). Today
   they wait silently. → After 5 refused tries the item is marked **needs attention**. The badge
   says so, and a "Waiting to send" screen lists it (participant number and what: consent,
   measurement, photo; never a name) with the reason in plain words. Nothing is deleted.
4. **"Waiting to send" screen** from the badge: counts per kind, last successful send time,
   **Send now** button, and per-participant lines for anything waiting or stuck.
5. **The list shows sync state** per participant: "On this phone, waiting to send" vs "Saved".
6. **Keep the phone's storage.** Ask the browser to keep the app's data (`navigator.storage.persist()`)
   so the phone doesn't clear it when space runs low. iPhone: data of a site that is not added to
   the Home Screen can be cleared after 7 days unused, so the Home screen reminds iPhone users to
   install the app if they haven't.
7. **Sign out with data waiting.** Today sign-out keeps waiting items under the collector's id. →
   Sign out asks first: "N items are still on this phone and not sent. They will be sent next time
   you sign in on this phone. Sign out anyway?" (F1 promised this.)
8. **Updates never interrupt a participant.** The app updates itself when a new version is
   published. Today the page can reload while a collector is mid-consent or mid-measurement (a
   signature being drawn would be lost; the blank screen seen after an update is also likely from
   this). → A new version is loaded only on Home or the list, never during consent, measuring or
   photos; Home shows "Update ready: tap to restart" and it restarts by itself next time the app
   opens.
9. **Data use is shown.** Photos are about 0.3–0.5 MB each, so about 1–1.5 MB per participant
   (about 120–180 MB for 120 participants). The "Waiting to send" screen shows the size still to send.

## Not in this spec

- **Wi-Fi-only switch** (North Anchor F7): collectors mostly have no Wi-Fi (Ryan, 12 Nov), so a
  switch that waits for Wi-Fi would keep data on phones. Proposed: drop it *(open question 1)*.
- Background sending while the app is closed: not reliable on iPhone and needs more permissions;
  sending happens while the app is open *(open question 2)*.

## Screens

1. **Home badge:** "All saved" (green) / "N waiting" (amber) / "N need attention" (red). Tap → screen 2.
2. **Waiting to send:** offline / online line; counts (consents, measurements, photos); size to send;
   last sent "today 14:05"; **Send now** (off when offline); list of participants with waiting or stuck
   items and a plain reason for stuck ones; **Back**.
3. **Practice list:** per participant "On this phone · waiting to send" when anything of theirs is waiting.
4. **Sign out:** the question above when anything is waiting.
5. **Update ready:** a line on Home with **Restart now**.

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Phone (IndexedDB, existing queues) | per item: `tries` (count), `lastError` (short code, no personal data), `nextTryAt`, `stuck` (after 5 refusals) | On each failed send |
| Phone (localStorage) | `lastSentAt` | On each successful round |

Nothing new on the server. No names outside `consents`. No email anywhere. No unblurred face.

## Acceptance criteria (testable)

- [ ] App killed mid-upload (between the file and its row, and between rows): nothing lost, nothing
      duplicated on the next send (North Anchor M6).
- [ ] The Worker refuses another collector's participant (tested; M6).
- [ ] A failed send while online is retried by itself (1, 2, 4 … 15 minutes); success resets it.
- [ ] Two triggers at once never send the same item twice.
- [ ] After 5 refusals an item is "needs attention", shown with a plain reason, never deleted.
- [ ] The badge and the "Waiting to send" screen match what is on the phone; Send now works.
- [ ] Sign out with waiting items asks first.
- [ ] A new app version never reloads the page during consent, measuring or photos.
- [ ] Storage persistence is requested; iPhone users not on the Home Screen see the reminder.

## Security requirements

- Inputs validated on the phone / in the Worker / by database checks: unchanged (every send is
  checked again by the Worker and the database).
- Access checked server-side (Worker + RLS): unchanged; another collector's participant refused.
- Secrets: none in code.
- Logs and stored error codes: no names, signatures, photos or phone numbers; error codes only.
- Deny cases that must be tested: another collector's participant; a send for a signed-out user;
  a duplicate after a kill; deleting a stuck item (must not happen); reloading during a participant.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Kill between steps (file / row / done) → resend gives one copy | Vitest + fake IndexedDB | both |
| Retry timing and reset; single sender | Vitest (fake timers) | both |
| Stuck after 5 refusals; never deleted; plain reasons | Vitest | both |
| Worker: another collector's participant → 403 | Vitest (Worker) | deny |
| Waiting screen, badge states, Send now, sign-out question | React Testing Library | both |
| Update waits until Home | Vitest + React Testing Library | deny |

## Phone test script

1. Airplane mode → 2 practice participants (consent, measurements, photos) → badge "N waiting".
2. Open "Waiting to send": counts and size shown; Send now is off.
3. Back online → badge counts down to "All saved" without touching anything.
4. During a send, close the app from the app switcher → reopen → everything arrives once (check the
   list shows Complete, no duplicate).
5. Weak signal (one bar): leave the app open → it keeps retrying until all saved.
6. Sign out with something waiting → the question appears → Cancel.
7. While measuring, publish an update (Ryan merges another PR) → no reload until back on the list.
8. iPhone in Safari (not installed) → Home shows the "Add to Home Screen" reminder.

## Decided (Ryan, 13 Nov 2026)

All four as recommended: (1) the Wi-Fi-only switch is dropped; (2) sending happens while the app is
open (Android and iPhone alike); (3) an item is "needs attention" after 5 refusals (no Admin count for
now); (4) updates load only on Home or the list, never during a participant.

## Questions as asked (answered above)

1. **Wi-Fi-only switch:** drop it (recommended: collectors use mobile data), or keep it as an option?
2. **Sending only while the app is open** (recommended: works the same on Android and iPhone), or try
   Android background sending too (more code, Android only)?
3. **Stuck items:** after 5 refusals (recommended), or another number? Should you also see stuck items
   on the Admin screen (count per collector, no names)?
4. **Update timing:** load updates only on Home/list (recommended), or ask the collector each time?
