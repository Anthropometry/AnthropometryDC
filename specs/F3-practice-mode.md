# F3: Practice mode

**Status:** approved by Ryan, 6 Nov 2026 <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M2
**Branch:** `m2-home-practice` (F2 and F3 ship in one pull request)

Anthro Collect is a student research project at Ashesi University.

## Goal (one sentence)

Collectors can rehearse the whole flow on practice participants that are clearly marked, never mixed
with real data and never exported, while the database refuses any real participant until the
project lead opens collection after IRB approval.

## User story

As a collector, I want to practise on friends and classmates before IRB approval, so that I'm fast
and careful on real participants, and I want to always know whether I'm in practice or real mode.

As the project lead, I want the database itself to refuse real records until I open collection, so
that no one can collect real data early, by mistake or on purpose.

## What already exists (from M0)

- `participants.is_practice` (default **true**) and the database trigger that refuses
  `is_practice = false` while `app_settings.collection_open` is false. Tested in `rls.test.ts`.
- Only admins can change `collection_open`.

## Screens

1. **Mode banner** on every collection screen: a wide amber **PRACTICE** strip ("Practice: not
   real data"), or a green **REAL COLLECTION** strip once collection is open. Never hidden.
2. **Home:** **Start practice participant** (always available). **Start real participant** is shown
   only when collection is open; until then Home says "Real collection opens after ethics (IRB)
   approval. Use practice to learn the steps."
3. **New practice participant:** age group (**Adult** / **Under 18**) → creates the participant
   marked PRACTICE with a short practice number ("P-0007") → a placeholder "Next: consent (coming in
   F4)" screen. F4 to F6 later plug into this flow.
4. **My practice list:** practice participants with number, age group, date and status, each with
   the PRACTICE label. Practice records can be removed by their collector (see open question 2).

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Supabase `participants` (existing) | `id` (made on the phone), `collector_id`, `is_practice = true`, `age_group`, `status = 'draft'` | New practice participant |
| Supabase `participants` (new column) | `practice_no` (per-collector counter for practice records, set by the database) | New practice participant |
| Phone (localStorage until F7) | participants not yet sent | Offline |

No names anywhere (names only come with consent in F4). No measurements or photos yet.

## Rules in the database

- A collector can never set `is_practice = false` while collection is closed (existing trigger).
- A participant can never switch from practice to real or back (`is_practice` is fixed once saved),
  so a practice record can't become real data later.
- Only approved collectors create participants (existing F1 policy).
- `collection_open` is changed only by an approved admin; changing it is recorded with who and when
  (existing `updated_by` / `updated_at`).
- Every future export (F8) must filter `is_practice = false`; F3 adds a database view
  `real_participants` that already does, so exports start from it.

## Acceptance criteria (testable)

- [ ] Home shows Start practice participant; no Start real participant while collection is closed.
- [ ] A practice participant saves with `is_practice = true` and shows PRACTICE everywhere.
- [ ] A real participant is refused by the database while collection is closed (direct API call).
- [ ] `is_practice` can't be changed after insert, either way, even by the owner.
- [ ] `real_participants` returns no practice rows.
- [ ] Practice works offline (saved on the phone, sent when online).
- [ ] Collectors see only their own practice participants; pending/disabled collectors can't create any.

## Security requirements

- Validated on the phone and in the database: `age_group` list; `id` is a UUID; `practice_no` set
  by the database, not the phone.
- Access: existing RLS on `participants` (approved, own rows); column grant unchanged, so
  `is_practice` stays insert-only.
- Never weaken the IRB gate to make a test pass (POLICY §14).
- Logs: no names or phone numbers.
- Deny cases tested: real participant while closed; `is_practice` flip (true→false, false→true);
  another collector's practice rows; pending collector creating; admin-only `collection_open`.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Practice participant created; `practice_no` increments per collector | PGlite | allow |
| Real participant refused while closed; allowed after admin opens collection | PGlite | both |
| `is_practice` can't be updated either way | PGlite | deny |
| `real_participants` excludes practice; collectors can't read others' rows through it | PGlite | both |
| Collector can't change `collection_open` | PGlite | deny |
| Banner shows PRACTICE / REAL; real button hidden while closed | React Testing Library | both |
| Practice flow offline: saved locally, sent once online, no duplicate | Vitest | allow |

## Phone test script

1. Home → Start practice participant → Adult → see "P-0001" and the PRACTICE banner.
2. Airplane mode → make P-0002 → My practice list shows it as "on this phone" → airplane off →
   it shows as saved.
3. Home has no Start real participant and shows the IRB sentence.
4. (Ryan, SQL editor, test project only if possible) try a real participant insert → refused.

## Decided (6 Nov 2026, Ryan accepted all suggestions)

1. **Opening collection (Gate B):** in the Supabase SQL editor only (a snippet in docs/ADMIN.md);
   no button in the app.
2. **Removing practice records:** collectors can delete their **own practice** participants (and
   any practice consent attached). Real participants can never be deleted by collectors.
3. **Practice data at Gate B:** deleted with a SQL step in docs/ADMIN.md when collection opens.
4. **Practice after opening:** stays available; the banner always shows the mode.

