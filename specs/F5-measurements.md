# F5: Measurements

**Status:** draft <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M4
**Branch:** `f5-measurements`

Anthro Collect is a student research project at Ashesi University.

## Goal (one sentence)

After consent, the collector records each tape measurement on its own screen with a big number pad,
in the unit of their own tape, with a warning for unlikely values, and the database keeps the exact
typed value plus the value in centimetres.

## User story

As a collector (often a tailor), I want one measurement per screen with a picture of where to put
the tape, a number pad, and quick ⅛-inch buttons if my tape is in inches, so that I measure fast
and accurately and can skip what I can't measure.

As the research team, we want every value in cm with its original typed value and unit, and
obviously wrong values caught at the moment of measuring, because tape measurements are the ground
truth the model learns from.

## Proposed measurement list (open question 1: Ryan to confirm or change)

| # | Code | Measurement | Required | Adult range (cm) | Child range (cm) |
| --- | --- | --- | --- | --- | --- |
| 1 | `height` | Height (standing, no shoes) | yes | 130–210 | 60–190 |
| 2 | `chest` | Chest / bust (fullest part) | yes | 60–160 | 40–120 |
| 3 | `waist` | Waist (natural waist) | yes | 50–160 | 35–110 |
| 4 | `hip` | Hip (fullest part) | yes | 60–170 | 40–120 |
| 5 | `shoulder` | Shoulder width (point to point, back) | yes | 30–60 | 18–48 |
| 6 | `sleeve` | Arm / sleeve length (shoulder to wrist) | yes | 45–80 | 25–70 |
| 7 | `inseam` | Inseam (crotch to ankle) | yes | 60–100 | 30–90 |
| 8 | `neck` | Neck (base) | optional | 28–55 | 20–40 |
| 9 | `thigh` | Thigh (fullest part) | optional | 35–90 | 20–65 |
| 10 | `upper_arm` | Upper arm (fullest part) | optional | 20–55 | 12–35 |

Ranges are deliberately wide: they only catch typing and tape-reading mistakes (e.g. 15 instead of
150, inches typed as cm). A value outside the range is **not refused**; the collector is asked to
check it and can keep it.

## Screens

1. **Start:** from the receipt screen ("Start measurements") or later from the list
   ("Consented · waiting for measurements" → **Measure**). Consent must exist first (decided:
   "capture later" = consent now, measure later).
2. **One measurement per screen**, with the PRACTICE or REAL banner:
   - the name in English (plus French or Twi later, when translations exist) and a simple drawing of
     where the tape goes;
   - "3 of 10" progress;
   - a **big number pad** (0–9, decimal point for cm, delete);
   - **inches:** whole inches on the pad plus **⅛ buttons** (0, ⅛, ¼, ⅜, ½, ⅝, ¾, ⅞), e.g. 34 + ⅜ →
     "34 ⅜ in = 87.3 cm" shown live;
   - **cm:** to 0.1 cm, e.g. "87.5 cm";
   - **Next** (saves), **Back**, **Skip** (asks for a reason: "Participant declined", "Could not
     measure", "Other").
3. **Unlikely value:** "That's unusual for an adult's waist (expected 50–160 cm). Check the tape."
   Buttons: **Type again** / **Keep 175 cm**. A kept value is marked as confirmed.
4. **Summary:** all measurements in a list, each with its value or "skipped (reason)"; tap one to
   change it; **Finish** marks the participant's measurements as done.
5. Everything works in airplane mode and is sent later, like consents (sync badge counts it).

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Supabase `measurements` (new) | `participant_id`, `code`, `typed` (exactly what was entered, e.g. `34 3/8`), `unit` (`cm`/`in`), `value_cm` (numeric, 0.1 cm), `skipped` + `skip_reason`, `confirmed_unusual`, `measured_at`, `collector_id`, `updated_at` | Each Next / Skip; one row per participant and measurement (changing it updates the row) |
| Supabase `participants` | `measurements_done_at` (new) | Finish |
| Phone (IndexedDB) | waiting measurement rows | Until the server confirms |

No names here: measurements link only to the participant id (names stay in `consents`).

## Rules in the database

- **Consent first:** a measurement is refused unless the participant has a consent and isn't rejected
  (same check as `has_consent`), and belongs to the collector (approved).
- **Values:** `unit` in (cm, in); `value_cm` between 1 and 300 when not skipped and null when
  skipped; `code` from the agreed list; `typed` matches the unit's format; `value_cm` must agree
  with `typed` (the database recomputes it, so the phone can't send a wrong cm value).
- **Practice stays practice:** measurements inherit `is_practice` from the participant (never
  stored separately), so exports from `real_participants` skip practice measurements.
- **Withdrawal** (F4 Admin button) deletes measurements too (cascade).
- Collectors can't read other collectors' measurements; admins can read all.

## Acceptance criteria (testable)

- [ ] Measurements can't start, and are refused by the database, without consent.
- [ ] One measurement per screen; number pad; progress; Back / Next / Skip with a reason.
- [ ] Inches: 34 + ⅜ is stored as typed `34 3/8`, unit `in`, `value_cm` 87.3.
- [ ] cm: 87.5 is stored as typed `87.5`, unit `cm`, `value_cm` 87.5.
- [ ] Out-of-range values warn and can be kept (marked confirmed); in-range values don't warn.
- [ ] Summary shows all values; changing one updates it; Finish marks the participant done.
- [ ] Works in airplane mode; sent in order once online; nothing deleted from the phone before
      the server confirms.
- [ ] A wrong `value_cm` sent from the phone is corrected or refused by the database.

## Security requirements

- Validated on the phone and in the database (lists, formats, ranges, cm recomputed in the database).
- Access: RLS on `measurements` (own participant, approved, consent present; admin reads all; no
  anon); cascade on withdrawal.
- No names next to measurements. Logs: no values tied to people.
- Deny cases tested: no consent; rejected participant; another collector's participant; pending
  collector; bad code/unit/format; cm not matching typed; anon.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Inch ⅛ → cm conversion (exact to 0.1 cm), cm parsing, formats | Vitest (`src/lib`) | both |
| Plausibility per measurement, adult vs child, boundaries | Vitest | both |
| Measurement rules: consent first, ownership, formats, cm recomputed, practice inherited, cascade | PGlite | both |
| Offline queue for measurements (order, resume, per collector) | Vitest + fake IndexedDB | both |
| Screens: number pad, ⅛ buttons, skip with reason, unusual-value prompt, summary edit, finish | React Testing Library | both |

## Phone test script

1. Practice → adult consent → **Start measurements** → height: type 170 → Next.
2. Settings in inches: chest 34 + ⅜ → shows "= 87.3 cm" → Next.
3. Waist: type 15 → "unusual" → Type again → 75 → Next.
4. Skip neck → reason "Participant declined".
5. Summary → change waist → Finish → list shows "Measured".
6. Airplane mode: measure another practice participant → "waiting to upload" → back online → "All saved".
7. Ryan: a real tape against the app's cm values for 3 inch readings (Gate A: unit conversion check).

## Open questions for Ryan

1. **Measurement list:** keep, change or add to the 10 proposed (and which are required)? This
   decides what the model can learn; the photo model's target measurements should match.
2. **Weight:** add body weight (needs a scale, not a tape)? I suggest no, unless the model needs it.
3. **Pictures of where the tape goes:** simple line drawings made in the app (free, no copyright
   issue). OK?
4. **Unusual-value ranges:** the table's wide ranges, or do you have reference ranges (e.g. from a
   tailoring source or WHO growth charts for children)?
5. **Repeat measurements:** measure each once, or twice and store both (better accuracy, slower)?
   I suggest once, with the unusual-value check.
