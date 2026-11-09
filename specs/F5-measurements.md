# F5: Measurements

**Status:** draft, decisions recorded 9 Nov 2026, awaiting Ryan's approval <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M4
**Branch:** `f5-measurements`
**Also amends F4** (one extra consent tick, see B2).

Anthro Collect is a student research project at Ashesi University.

## Goal (one sentence)

After consent, the collector records the participant's sex, age and clothing, then each tape
measurement for that sex and age on its own screen, in the unit of their own tape. Key values are
measured twice, and mistakes are caught on the spot. The database keeps every typed reading and a
checked value in centimetres.

## Why these measurements (research purpose)

The project trains a model to estimate body measurements from photos (MISSION.md). The tape values
are its **ground truth**, so accuracy beats speed (principle 6).
- **Height is the scale for every photo.** A photo alone can't tell a tall person far away from a
  short person close up; the known height turns pixels into centimetres. So height is measured with
  the most care, and twice.
- **The garment set follows ISO 8559-1** (body dimensions for clothing), so the data is useful to
  tailors and to a future clothing app.
- **The sample is set by sex and age** (360 adult women, 315 adult men, 225 children), so both are
  recorded.

## Decisions (Ryan, 9 Nov 2026)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Sex | **Female / Male**, required |
| 2 | When | **After consent**, before measuring; stored on the participant only, never beside the name |
| 3 | Set | The proposed ISO 8559-1 based set (below) |
| 4 | Required | **All measurements required**, each either taken or skipped with a reason (17) |
| 5 | Children | **By age band: 8–12 core set; 13–17 full set for their sex** |
| 6 | Age | **Age in years for everyone** (not date of birth) |
| 7 | Minimum age | **8 years** |
| 8 | Clothing | **Light clothing; recorded** as light / medium / heavy |
| 9 | Repeats | **Twice for girths** (bust/chest, waist, hip) **and height**; a third reading if the two differ by more than 1 cm |
| 10 | Height | **Careful tape method; no weight** (see "Height protocol") |
| 11 | Intimate measurements | **Separate consent tick** (amends F4) |
| 12 | Female collector | **Prompt** before women's intimate measurements (not enforced) |
| 13 | Unusual values | **Wide ranges for adults; WHO growth references for children** |
| 14 | Consistency | **Warn** when measurements disagree with each other |
| 15 | Help | **Simple line drawings** (female and male figures, drawn in the app) |
| 16 | Order | **Top to bottom** |
| 17 | Skip | Allowed **with a reason**; Finish needs every measurement taken or skipped |
| 18 | cm precision | **0.1 cm** (the tape has 1 mm marks); inches: whole + ⅛ buttons |
| F6 | Photo scale reference | To be decided in F6 (e.g. a printed card or marked mat in the photo) |

## Measurement catalogue (ISO 8559-1 based)

`I` = intimate (only with the extra consent tick). `×2` = measured twice (third if > 1 cm apart).

| Order | Code | Measurement (how) | Women | Men | Children 8–12 | ×2 | I |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `height` | Height: barefoot, standing straight, see protocol | ✓ | ✓ | ✓ | ×2 | |
| 2 | `neck_girth` | Neck girth: around the base of the neck | ✓ | ✓ | ✓ | | |
| 3 | `shoulder_width` | Shoulder width: shoulder point to shoulder point, across the back | ✓ | ✓ | ✓ | | |
| 4 | `shoulder_length` | Shoulder length: side of neck to shoulder point | ✓ | ✓ | | | |
| 5 | `bust_girth` | Bust girth: around the fullest part of the bust | ✓ | | | ×2 | I |
| 6 | `underbust_girth` | Under-bust girth: around the ribcage just below the bust | ✓ | | | | I |
| 7 | `chest_girth` | Chest girth: around the fullest part of the chest, under the arms | | ✓ | ✓ | ×2 | |
| 8 | `bust_point_distance` | Bust point to bust point | ✓ | | | | I |
| 9 | `shoulder_to_bust_point` | Shoulder (side of neck) to bust point | ✓ | | | | I |
| 10 | `front_length` | Front length: side of neck to waist (over the bust for women) | ✓ | ✓ | | | |
| 11 | `back_length` | Back length: nape (neck bone) to waist | ✓ | ✓ | ✓ | | |
| 12 | `waist_girth` | Waist girth: natural waist (narrowest part) | ✓ | ✓ | ✓ | ×2 | |
| 13 | `high_hip_girth` | High hip girth: about 10 cm below the waist | ✓ | | | | |
| 14 | `hip_girth` | Hip girth: around the fullest part of the hips | ✓ | ✓ | ✓ | ×2 | |
| 15 | `waist_to_hip` | Waist to hip: side, waist down to the fullest hip | ✓ | ✓ | | | |
| 16 | `arm_length` | Arm length: shoulder point to wrist, arm relaxed | ✓ | ✓ | ✓ | | |
| 17 | `upper_arm_girth` | Upper arm girth: fullest part | ✓ | ✓ | | | |
| 18 | `wrist_girth` | Wrist girth | ✓ | ✓ | | | |
| 19 | `inseam` | Inseam: crotch to ankle bone | ✓ | ✓ | ✓ | | I |
| 20 | `outseam` | Outseam: waist to ankle bone, side | ✓ | ✓ | | | |
| 21 | `thigh_girth` | Thigh girth: fullest part | ✓ | ✓ | | | |
| 22 | `knee_girth` | Knee girth | ✓ | ✓ | | | |
| 23 | `calf_girth` | Calf girth: fullest part | ✓ | ✓ | | | |
| 24 | `waist_to_knee` | Waist to knee: skirt length | ✓ | | | | |
| 25 | `shoulder_to_knee` | Shoulder to knee: dress length | ✓ | | | | |

**Totals:** women 24 (5 intimate); men 18 (1 intimate); children 8–12: 9 (1 intimate).
Children 13–17 get the full set for their sex. Girls 8–12 take chest girth, not bust.

## Height protocol (decision 10)

The usual retractable body tape is about 150 cm (60 in), shorter than most adults.
1. Barefoot, heels, back and head against a wall, looking straight ahead.
2. A flat, hard object (book or ruler) on the head, level, touching the wall; mark the wall under it.
3. Measure floor → mark. **If the tape is too short** the app helps (open question 1).
4. Repeat steps 2–3 for the second reading.

## Screens

1. **After the receipt** ("Start measurements"), or later from the list ("Consented · waiting for
   measurements" → **Measure**). The database refuses measurements without consent.
2. **About the participant** (once):
   - **Sex:** Female / Male.
   - **Age in years:** number pad; must fit the age group (adult 18–100; child 8–17). A child under 8
     can't be measured (the app says so, and the participant stays consented, not measured).
   - **Clothing:** Light / Medium / Heavy.
   - **"Before you start" card:** stand straight, relaxed, arms down, light clothing, tape snug not
     tight, read at eye level.
3. **One measurement per screen**, with the PRACTICE or REAL banner and "7 of 23":
   - name, one-line "how", **line drawing** (female or male figure) with the tape line highlighted;
   - **cm:** number pad to 0.1 cm (e.g. 87.3); **inches:** whole inches + **⅛ buttons**, live "= 87.3 cm";
   - **×2 measurements:** "Reading 1", then "Measure again: reading 2"; if they differ by more than
     1 cm, "The two readings differ by 1.4 cm. Take a third reading."; the value used is the mean of
     the two closest readings;
   - **Next**, **Back**, **Skip** → reason: Participant declined / Could not measure (injury, cast,
     clothing) / Other (short note, no names).
4. **Intimate measurements:**
   - if the participant (or guardian) did **not** tick the intimate consent, they are skipped
     automatically ("declined at consent") and not shown;
   - for women, before the first one: "Ask if she would prefer a woman to take these measurements."
5. **Warnings (can be kept):**
   - *unusual value:* "175 cm is unusual for a waist (expected 50–160 cm for adults). Check the tape."
     → **Type again** / **Keep 175 cm** (stored as confirmed);
   - *disagreement:* "Under-bust is larger than bust. Check both." (see consistency rules).
6. **Summary:** every measurement with its value, or "skipped (reason)"; tap to change; **Finish**
   is enabled when each is taken or skipped; Finish marks the participant measured.
7. Works in airplane mode; sent later in order; the Home badge counts waiting measurements.

## Consistency rules (warnings, decision 14)

- under-bust < bust; waist < bust (women) or < chest (men), unless confirmed;
- high hip ≤ hip; waist ≤ hip + 20 cm;
- inseam < outseam < height; arm length < height / 2;
- waist to knee < shoulder to knee < height; back length < height / 3;
- wrist < upper arm; knee < thigh; calf < thigh;
- bust point distance < bust / 2; shoulder to bust point < front length.

## Unusual-value ranges (decision 13)

- **Adults:** wide per-measurement ranges, catching typing and reading slips (e.g. 15 for 150,
  inches typed as cm). Kept in one table in `src/lib/measurements.ts`, reviewable by Ryan.
- **Children 8–17:** height from **WHO 2007 growth reference** (height-for-age, by sex), flagged
  outside about −3 to +3 standard deviations; girths and lengths by wide age-band ranges.
  The WHO values used are cited in the code.

## Data written

| Where | Fields | When |
| --- | --- | --- |
| `participants` (existing) | `sex` (female/male, existing column) | About the participant |
| `participants` (new) | `age_years` (8–100, fits the age group), `clothing` (light/medium/heavy), `intimate_ok` (from consent), `measurements_done_at` | About / consent / Finish |
| `consents` (new column, F4 amendment) | `agreed_intimate` (boolean) | Consent |
| `measurements` (new) | `participant_id`, `code`, `unit` (cm/in), `readings_typed` (each reading exactly as entered, e.g. `34 3/8`), `readings_cm`, `value_cm` (0.1 cm), `skipped`, `skip_reason`, `skip_note`, `confirmed_unusual`, `measured_at`, `collector_id`, `updated_at` | Next / Skip; one row per participant and code; changing it updates the row |
| Phone (IndexedDB) | waiting measurement rows | Until the server confirms |

**No names:** measurements link only to the participant id. Skip notes are short and the app says
"no names".

## Rules in the database

- **Consent first:** refused unless the participant has a consent, isn't rejected, is the
  collector's own (approved), and has sex and age recorded.
- **Right set:** `code` must belong to the set for the participant's sex and age band. Intimate codes
  are refused unless `intimate_ok`.
- **Values:** the database **recomputes** `readings_cm` from `readings_typed` + `unit` (cm to 0.1;
  inches with ⅛), checks 1–300 cm, recomputes `value_cm` (mean of the two closest readings for ×2
  codes), and refuses mismatches. ×2 codes need at least 2 readings unless skipped.
- **Age** fits the age group; a child must be 8 or older.
- **Practice stays practice:** measurements inherit `is_practice` from the participant;
  `real_participants` exports skip practice.
- **Withdrawal** (F4 Admin button) deletes measurements too (cascade).
- Collectors read only their own participants' measurements; admins read all; anon nothing.

## F4 amendment: the third consent tick

- Adult screen: ☐ "I agree to the more personal measurements (bust, under-bust, bust point,
  inseam). I can say no to these and still take part."
- Guardian screen: the same, for the child.
- **Optional:** Save needs only the first two ticks, as now. The answer is stored in
  `consents.agreed_intimate` (write-only for collectors) and copied to `participants.intimate_ok`
  (no name), so the measurement screens know without reading the consent.

## Acceptance criteria (testable)

- [ ] No measurement without consent, sex and age; under 8 can't be measured.
- [ ] The set matches sex and age band (women 24 / men 18 / children 8–12: 9; 13–17 full set).
- [ ] Without the intimate tick, intimate measurements are skipped automatically and refused by
      the database.
- [ ] ×2: two readings; a third is asked if > 1 cm apart; `value_cm` = mean of the two closest.
- [ ] cm to 0.1; inches with ⅛ (34 ⅜ in = 87.3 cm); the database recomputes and refuses mismatches.
- [ ] Unusual and inconsistent values warn, can be kept, and are stored as confirmed.
- [ ] Skip needs a reason; Finish needs all taken or skipped.
- [ ] Airplane mode works; sent in order; nothing deleted from the phone before the server confirms.
- [ ] Withdrawal deletes measurements.

## Security requirements

- Validated on the phone and again in the database (lists, sets, formats, ranges, recomputed cm).
- RLS: own participants only (approved, consent present); admin reads all; anon nothing.
- No names beside measurements; skip notes limited to 80 characters; logs hold no values tied to
  people.
- Deny cases tested:
  - no consent; rejected participant; another collector's participant; pending collector;
  - wrong set for sex or age; intimate code without the tick;
  - bad unit or format; cm not matching typed; ×2 with one reading;
  - child under 8; age outside its group; anon.

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Inch ⅛ and cm parsing, conversion to 0.1 cm, formats | Vitest | both |
| Sets by sex and age band; intimate filtering | Vitest + PGlite | both |
| ×2 logic: third reading trigger, mean of two closest | Vitest + PGlite | both |
| Unusual ranges (adult, WHO children) and consistency rules | Vitest | both |
| Database rules: consent first, ownership, sets, recomputed cm, age, cascade | PGlite | both |
| Offline queue for measurements | Vitest + fake IndexedDB | both |
| Screens: about, number pad, ⅛, ×2, skip, warnings, summary, finish, intimate prompt | React Testing Library | both |

## Phone test script

1. Practice → adult consent with the intimate tick → Start measurements → Female, 30, Light.
2. Height: 165.2 → reading 2: 165.4 → Next (no third reading).
3. Bust: 92.0 then 93.5 → asked for a third → 92.4 → the value shown is 92.2.
4. Settings in inches: waist 30 + ⅜ → "= 77.2 cm".
5. Under-bust 95 (larger than bust) → disagreement warning → Type again → 78.
6. Skip calf → "Could not measure".
7. Summary → Finish → the list shows "Measured".
8. Without the intimate tick: no bust, under-bust, bust point or inseam screens; the summary shows
   "declined at consent".
9. Child 7 → can't be measured; child 10 → 9 measurements; male 15 → 18.
10. Airplane mode → measure → "waiting to upload" → back online → "All saved".

## Open questions for Ryan

1. **Height with a 150 cm tape:**
   - (a) the app adds a fixed 100 cm (mark 100 cm on the wall once, measure from that mark to the
     head mark, and the app adds 100);
   - (b) collectors get a 2 m tape for height;
   - (c) a height board.

   I suggest (a): free and accurate if the 100 cm mark is made carefully. The app shows both parts.
2. **Adult range table:** I'll draft wide ranges from common size charts and show them in the PR for
   you to check. OK?
