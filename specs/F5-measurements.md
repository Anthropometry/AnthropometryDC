# F5: Measurements

**Status:** approved by Ryan, 9 Nov 2026 <!-- draft | approved | built | verified — only Ryan sets "approved" -->
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
| 10 | Height | **Steel tape + straight edge; no weight** (see "Height protocol") |
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

## Height protocol (decision 10, revised 9 Nov)

Height is the scale for every photo, so it needs a reading the collector can trust, but it should
take under a minute and ask little of the participant.

**Equipment:** a retractable **steel tape** (3 m or 5 m, cm and inch scale), plus the collector's
usual cloth or body tape for everything else. A body tape (about 150 cm) is too short for most
adults' height. Every collector (shop or mobile) uses the same method.

**For the participant:** shoes off, headwear off if possible, stand straight against a wall or door
frame, look straight ahead. That's all.

**For the collector:**
1. Pull the steel tape up from the floor beside the participant's heel, against the wall.
2. Lay a **straight edge** flat on the top of the head, pressing lightly through the hair. A tailor's
   L-square or ruler is ideal; a phone or a stiff card also works.
3. Read the steel tape where the straight edge meets it. No marking the wall, no adding.
4. Repeat for the second reading (×2). A third is asked if the two differ by more than 1 cm.

**Recorded with height:** "hair or headwear may add height" (yes/no), for braids, buns or a wrap
that can't come off. **Fallback** if there is no steel tape: the app also accepts the "100 cm wall
mark" method (measure from a 100 cm mark to the head, and the app adds 100), recorded as such.

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

- under-bust < bust;
- high hip ≤ hip (+2 cm); waist ≤ hip + 20 cm;
- (waist against bust or chest is **not** checked: many heavier people have a larger waist, so it
  would warn wrongly and teach collectors to ignore warnings);
- inseam < outseam < height; arm length < height / 2;
- waist to knee < shoulder to knee < height; back length < height / 3;
- wrist < upper arm; knee < thigh; calf < thigh;
- bust point distance < bust / 2; shoulder to bust point < front length.

## Unusual-value ranges (decision 13)

- **Adults:** wide per-measurement ranges (draft below), catching typing and reading slips (e.g.
  15 for 150, inches typed as cm). Kept in one table in `src/lib/measurements.ts`, reviewable by Ryan.

**Adult ranges (cm), accepted by Ryan without changes (9 Nov).** A value outside its range triggers "Check the tape";
it can still be kept. Drafted from common adult clothing size charts and adult anthropometric survey
ranges, then widened so very small, very tall and very large adults don't get false alarms.

| Measurement | Range (cm) | Measurement | Range (cm) |
| --- | --- | --- | --- |
| Height | 130 – 210 | Back length | 32 – 55 |
| Neck girth | 28 – 55 | Waist girth | 50 – 170 |
| Shoulder width | 30 – 60 | High hip girth | 60 – 175 |
| Shoulder length | 9 – 20 | Hip girth | 70 – 180 |
| Bust girth | 65 – 170 | Waist to hip | 12 – 30 |
| Under-bust girth | 55 – 150 | Arm length | 45 – 80 |
| Chest girth | 70 – 160 | Upper arm girth | 18 – 60 |
| Bust point distance | 10 – 30 | Wrist girth | 12 – 24 |
| Shoulder to bust point | 18 – 40 | Inseam | 60 – 100 |
| Front length | 30 – 60 | Outseam | 85 – 125 |
| Thigh girth | 35 – 95 | Waist to knee | 45 – 75 |
| Knee girth | 28 – 55 | Shoulder to knee | 80 – 120 |
| Calf girth | 25 – 60 | | |
- **Children 8–17:** height from **WHO 2007 growth reference** (height-for-age, by sex), flagged
  outside about −3 to +3 standard deviations; girths and lengths by wide age-band ranges.
  The WHO values used are cited in the code.

## Practical considerations (equipment and quality)

- **Equipment per collector:** cloth or body tape (all girths and lengths), steel tape (height), a
  straight edge (L-square or ruler), cleaning wipes. The **project coordinator provides the steel
  tapes** (decided 9 Nov).
- **Tapes stretch and differ:** cloth tapes stretch with use. At Gate A, and then monthly, each
  collector checks the cloth tape against the steel tape at 50 cm and 100 cm. More than 0.5 cm off
  means replace it. This is a training practice, **not a step in the app** (decided 9 Nov).
- **Steel tape hook:** its loose metal end moves on purpose (for inside and outside readings). Stand it
  on the floor with the hook pushed in, or start from the 10 cm mark and subtract (the app does not
  need to know).
- **Which scale is read:** the app asks for the collector's unit (cm or inches, from Settings); steel
  tapes have both, so read the matching side.
- **Hair and headwear:** braids, buns and wraps can add centimetres; record the flag rather than ask
  people to undo hairstyles.
- **Floor:** a flat floor; outdoors, a board or mat on level ground.
- **Hygiene and respect:** wipe tapes between participants; measure in a private, calm place; explain
  each step before touching; intimate measurements only with the extra tick, and offer a woman
  collector for women.
- **Training:** a one-page card and a practice session (Practice mode) before real collection; the
  "Before you start" card in the app repeats the key points.

## Data written

| Where | Fields | When |
| --- | --- | --- |
| `participants` (existing) | `sex` (female/male, existing column) | About the participant |
| `participants` (new) | `age_years` (8–100, fits the age group), `clothing` (light/medium/heavy), `intimate_ok` (from consent), `measurements_done_at` | About / consent / Finish |
| `measurements` height row | `height_method` (steel_tape / wall_100), `hair_adds_height` (yes/no) | Height |
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

## Amendment A (11 Nov 2026): optional weight (draft, for Ryan's approval)

Ryan asked to collect body weight as an extra, optional data point. Where this amendment and the
text above disagree (decision 10: "no weight"), the amendment wins.

**Decided by Ryan (10–11 Nov):**
- **Consent:** weight has its **own optional tick** on the consent form (adult and guardian screens).
- **When:** asked **right after height**, only if that tick was given. Without it, the weight screen
  is never shown.
- **Source:** **both** are accepted and recorded: **weighed on a scale** or **participant told me**
  (self-reported weights are usually a few kg off, so the data must say which).
- **Scales:** the **project coordinator provides a digital bathroom scale** per collector
  (at least 180 kg, 0.1 kg steps).

**Screen "Weight (optional)":**
- a number pad in **kg to 0.1** (e.g. 72.4), the same pad as the tape measurements;
- **How:** "Weighed on a scale" / "Participant told me" (required with a value);
- **Skip** (no reason needed: weight is optional);
- **Finish does not wait for weight**; the summary shows it ("72.4 kg, scale", "told", or "skipped").

**Weighing (on the "Before you start" card and in training):** a hard, flat floor (outdoors, a flat
board); shoes off; phone, keys and wallet out of pockets; light clothing (already recorded); stand
still in the middle; read when the number stops changing. Each morning, check the scale with
something of known weight (e.g. a sealed 5 kg bag of rice); more than 0.2 kg off means new
batteries or another scale. This check is a training practice, **not a step in the app** (as for tapes).

**Unusual values (warn, can be kept, marked checked):** adults 30–200 kg; children 8–12:
18–80 kg; 13–17: 30–150 kg.

**Data:**
- `consents.agreed_weight` (boolean, write-only for collectors), copied to `participants.weight_ok`
  (no name), like the intimate tick;
- `participants.weight_kg` (0.1 kg, 2–300), `weight_source` (`scale` / `told`), set by the collector;
  the database refuses a weight without `weight_ok`, a weight without a source, or a source without
  a weight; deleted with the participant on withdrawal; exported with `real_participants`.

**Consent text (practice):** "Optional: I agree to my weight being recorded (on a scale, or as I tell
you)." The **real v1 text for the IRB must include weight too.**

**Tests to add:** PGlite (weight needs the tick and a source; range; collectors can't set
`weight_ok`; withdrawal), Vitest (kg parsing to 0.1, ranges), React Testing Library (tick → screen
after height; no tick → no screen; skip; source required; summary; Finish without weight).

**Phone test:** consent with the weight tick → after height, Weight: 72.4, Scale → summary shows
"72.4 kg, scale"; consent without the tick → no weight screen; 15 kg for an adult → "unusual".

## Open questions for Ryan

None. Answered by Ryan, 9 Nov 2026:
1. **Height:** steel tape + straight edge, with the 100 cm wall mark only as a fallback. The
   **project coordinator provides the steel tapes.**
2. **Adult ranges:** the draft table above, **no changes**.
3. **Tape check:** **not** a step in the app; it stays a practice in training (see Practical considerations).
