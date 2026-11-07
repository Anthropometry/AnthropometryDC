# F4: Participant and consent

**Status:** draft <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M3
**Branch:** `f4-consent`

Anthro Collect is a student research project at Ashesi University.

## Goal (one sentence)

Before any measurement or photo, the collector records informed consent on the phone, in English
plus the participant's language, with two required ticks and a signature (a guardian's signature
and the child's assent for under-18s), and gives the participant a receipt code. It works fully in
airplane mode, and the collector can never read the consent back.

## User story

As a collector, I want a clear, step-by-step consent screen that I can read out and the participant
can sign on my phone, even with no signal, so that I never measure or photograph anyone who has not
agreed.

As a participant (or parent), I want to know it is a student research project at Ashesi University,
what will be recorded, that my face will be blurred, and how to withdraw, with a code to quote if I
change my mind.

As the project lead, I want every consent tied to the exact approved text version, names stored only
in the restricted consent table, and the database to refuse later steps without consent.

## Screens (practice and real use the same flow; the banner shows which)

1. **New participant:** age group (**Adult** / **Under 18**) → **Consent language**: French, Twi or
   English only (starts on the collector's language from Settings; English is always shown too).
2. **Consent (adult):**
   - The consent text, English first, then the chosen language below it, in large print.
     It opens with "Anthro Collect is a student research project at Ashesi University…" and has
     one line on possible future use in an app (decided 1 Nov).
   - **Two required ticks:** ☐ "I agree to my body measurements being recorded for this
     research." ☐ "I agree to photos of my body being taken; my face will be blurred on the phone
     before saving."
   - **Participant's name** (typed by the collector or the participant).
   - **Signature pad** (finger). **Clear** and **Done**.
   - **Next** stays off until both ticks, a name (1–200 letters) and a signature exist.
3. **Under 18:**
   - **Guardian consent:** the same screen, worded for a parent or guardian ("my child"), with the
     guardian's name, both ticks and the guardian's signature.
   - **Child assent:** a short, simple text read to the child ("Is it OK if we measure you and take
     photos with your face hidden? You can say no."), then **Yes, the child agrees** or **No**,
     and the child's mark or signature (optional, see open question 4).
   - **If the child says No:** stop. Nothing about the child is saved, the participant is marked
     *rejected*, and the screen says "Thank the child. Nothing was recorded."
4. **Receipt:**
   - A receipt code, e.g. **`R7K-2MPQ`**, in large print, with "Write this code on a slip for the
     participant. They quote it to the project lead to see or withdraw their data."
   - **Done** → "Next: measurements (coming in F5)".
5. **After consent:** the collector sees only the participant number and receipt code, never the
   name or the signature.

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Supabase `participants` (existing) | `id` (made on the phone), `is_practice`, `age_group`, `receipt_code` (new rule: unique), `status` (`draft` → `rejected` if the child says No) | New participant, receipt |
| Supabase `consents` (existing, write-only for collectors) | `participant_name`, `guardian_name` (children only), `language`, `consent_version`, `agreed_data`, `agreed_photos`, `child_assent`, `signed_at` | Consent saved |
| Supabase `consents` (new columns) | `signatures` (which slots were uploaded: `participant`, `guardian`, `assent`) | Signatures uploaded |
| R2 `signatures` bucket (private) | `<participant id>/participant.png`, `guardian.png`, `assent.png` | Upload through the Worker |
| Phone (IndexedDB) | the consent and signature images, waiting to upload | Until the server confirms; then deleted from the phone |
| Supabase `app_settings` (new column) | `consent_version` (the approved version real consents must use, e.g. `v1`) | Set by Ryan in SQL at Gate B |

No email or phone for participants. Names only in `consents` (and briefly in this phone's waiting
queue). No unblurred face anywhere.

## Rules in the database and Worker

- **Write-only consent:** collectors insert consents and can **never read them**, even their own
  (existing rule, kept and retested).
- **Children:** a consent for an `age_group = 'child'` participant needs `guardian_name` and
  `child_assent = true`. An adult consent must have no guardian.
- **Versions:**
  - a **real** participant's consent must use `app_settings.consent_version` (null until Gate B,
    so no real consent is possible before then);
  - a **practice** consent must use `practice`.
- **One consent per participant** (existing unique rule). It can't be changed or deleted by a
  collector (practice deletes cascade, from M2).
- **Consent exists check:** `public.has_consent(participant_id)` tells the owner yes or no without
  revealing anything. F5 and F6 use it to refuse measurements and photos without consent.
- **Receipt codes:** unique; made on the phone from the easy alphabet (no 0, O, 1, I, L), 7
  characters shown as `XXX-XXXX`. A clash (about 1 in 27 billion) is retried with a new code.
- **Worker signature upload:** the ownership check also requires `collector_id` = the uploader.
  Today an admin's oversight read would let an admin upload to anyone's participant; that is
  tightened.

## Offline

- Everything above works in airplane mode. Participant, consent and signatures are kept on the
  phone (IndexedDB via **Dexie**, already in the tech stack, see open question 3) and sent in order
  when online:
  1. participant;
  2. consent;
  3. signature images;
  4. finally the consent's `signatures` list.
- A waiting item is deleted from the phone only after the server confirms it (POLICY §12).
- The Home sync badge counts waiting consents.
- The full upload queue with retries and Wi-Fi-only comes in F7. F4 adds the minimum needed now.

## Acceptance criteria (testable)

- [ ] Next stays off until both ticks, a name and a signature exist (adult and guardian).
- [ ] Under-18 needs guardian consent and the child's Yes; the child's No saves nothing and marks
      the participant rejected.
- [ ] English is always shown; French or Twi below it when chosen.
- [ ] A receipt code is shown and stored; codes are unique.
- [ ] Collectors cannot read any consent (own included); admins can.
- [ ] A child consent without a guardian or assent is refused; an adult one with a guardian is refused.
- [ ] Real consent is refused while `consent_version` is not set; practice consents must use `practice`.
- [ ] Whole flow works in airplane mode and uploads in order once online; nothing is deleted from
      the phone before the server confirms.
- [ ] The Worker refuses a signature upload for a participant the uploader doesn't own, admins included.
- [ ] After saving, no screen shows the name or the signature again.

## Security requirements

- **Validated on the phone and in the database:** name 1–200 characters; language list; version
  rule; ticks must be true; child/guardian rule; receipt format `^[A-HJ-KM-NP-Z2-9]{7}$`.
- **Access:**
  - RLS on consents stays insert-only for collectors;
  - `has_consent` reveals only true/false to the owner;
  - the Worker checks owner and slot.
- **Signatures:** PNG only, 512 KB maximum, magic bytes checked (existing); private bucket; never
  logged.
- **Logs:** no names, signatures or receipt codes in any log or error message.
- **Deny cases tested:**
  - collector reads consents;
  - consent for another's participant;
  - child without guardian or assent;
  - real consent before Gate B;
  - wrong version;
  - duplicate consent;
  - Worker upload by a non-owner (admin included);
  - Next with one tick.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Consent rules: child/guardian, version, practice, one per participant, write-only, admin read | PGlite | both |
| `has_consent` true/false for owner; nothing for others | PGlite | both |
| Receipt code: format, unique, retry on clash | Vitest + PGlite | both |
| Worker: signature upload owner-only (admin non-owner refused) | Vitest (Worker) | deny |
| Offline queue: participant → consent → signatures in order; resend after failure; delete only after confirm | Vitest + fake IndexedDB | both |
| Consent screen: Next blocked until ticks + name + signature; English always shown; child No path | React Testing Library | both |
| No name on any screen after saving | React Testing Library | deny |

## Phone test script

1. Practice → New participant → Adult → French → read the screen: English then French.
2. Tick one box only → Next is off. Tick both, type a name, sign → Next → receipt code shown.
3. Under 18 → guardian consent → child says **No** → "Nothing was recorded"; the practice list
   shows it as rejected.
4. Under 18 → guardian consent → child says **Yes** → receipt code.
5. Airplane mode → do a full adult consent → Home shows "1 waiting" → airplane off → "All saved".
6. Ryan, SQL editor: the consent exists with the name; the collector's app never shows it.

## Open questions for Ryan

1. **Consent wording:** I'll draft English text for practice from the North Anchor (student
   research at Ashesi, what is recorded, face blur, withdrawal by receipt code, possible future app
   use). The real **v1** must be the IRB-approved text. Will you give me the IRB text when it's
   approved, or should I draft it for you to submit?
2. **French and Twi:** who translates the consent (and checks the Twi)? Until then, practice can
   show "French/Twi translation coming", or use English only. I suggest **English only for
   practice now**, with the language choice kept so the translations drop in later.
3. **Dexie (IndexedDB library):** it's already in the approved tech stack, but POLICY §13 asks for a
   DISCUSSION entry before adding a library. Signatures are too big for the browser's small
   key-value store (about 5 MB per site), so I suggest adding Dexie now.
4. **Child's mark:** should the child also sign or make a mark, or is the collector recording the
   child's spoken "Yes" enough? I suggest **optional**: a mark if the child wants to, otherwise the
   recorded Yes.
5. **"Capture later":** the North Anchor lists it under F4. I read it as "consent now, measure and
   photograph later" (a consented participant stays in a *Waiting for measurements* list). Is that
   right, or did you mean consent on paper captured into the app later?
6. **Withdrawal:** when someone quotes their receipt code, you'd delete their data with a SQL step
   in docs/ADMIN.md (participant, consent, signatures, later measurements and photos). OK to add
   that in F4?
