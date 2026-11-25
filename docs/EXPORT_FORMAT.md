# Export format: `anthro-export/1`

Anthro Collect is a student research project at Ashesi University. This file defines the research
export that `npm run export` writes (code: `src/lib/exportData.ts`, `scripts/export.ts`; feature:
`specs/F8-admin-export.md`). Other code that reads an export should match this file exactly.

**Current version: `anthro-export/1`** (Ryan, 25 Nov 2026).

## Version stamp

Every export says which format it is, in two places:

- `README.txt`: the line `Format: anthro-export/1 (defined in docs/EXPORT_FORMAT.md in the Anthro Collect repository)`;
- every `metadata/<export_id>.json`: the first field, `"format": "anthro-export/1"`.

**Rule:** any change to the files, columns, column order, units, allowed values or meanings bumps
the number (`anthro-export/2`, …) and adds a line to the change log at the end. A reader should
refuse a format it doesn't know.

## Folder layout

```
anthro-export-YYYY-MM-DD-HH-MM[-PRACTICE]/          (time of export, UTC)
  README.txt
  participants.csv
  measurements.csv
  photos.csv
  images/<export_id>/front.jpg, side.jpg, back.jpg   (back only when taken)
  metadata/<export_id>.json
anthro-export-YYYY-MM-DD-HH-MM[-PRACTICE]-MAPPING-keep-private.csv   (beside the folder, never shared)
```

`-PRACTICE` only when run with `--include-practice` (a test export, never for research).

## File rules

- Text files: UTF-8, no byte order mark, `\n` line endings, ending with `\n`.
- CSV: comma-separated, one header row. A cell is quoted only when it contains `"`, `,` or a line
  break; a `"` inside is doubled. **Empty cell = null.**
- Booleans: `true` / `false`. Numbers: plain decimals with `.` (e.g. `78.4`). Dates: `YYYY-MM-DD`.
  Times: ISO 8601 UTC (e.g. `2026-12-01T09:25:00Z` as stored).
- Lengths in **cm** (0.1 cm precision), weights in **kg** (0.1 kg). The unit the collector typed is
  kept alongside, never instead.
- Row order: participants by creation time (oldest first); measurements by `code`; photos by
  `slot` (`back`, `front`, `side`).

## Who is in an export

- Participants with a consent, not rejected (a child who said No), not withdrawn (already deleted).
- Practice participants only in a `-PRACTICE` export, where `practice` is `true`.
- Photos with `blur_version` 2 or 3 only (version 1, the old blur, never).
- **Never:** names, signatures, guardian names, receipt codes, consent records, collectors' names
  or phone numbers.

## `export_id`

A new random UUID per participant **per export**: two exports can't be joined on it. The only link
back to the database is the mapping file (`export_id,database_id`), which stays on Ryan's laptop.

## `participants.csv` (one row per participant)

| # | Column | Values |
| --- | --- | --- |
| 1 | `export_id` | UUID |
| 2 | `practice` | `true` / `false` |
| 3 | `sex` | `female` / `male` |
| 4 | `age_group` | `adult` / `child` |
| 5 | `age_range` | `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`; children `8-9`, `10-12`, `13-14`, `15-17` (plain hyphen; never the exact age) |
| 6 | `clothing` | `light` / `medium` / `heavy` |
| 7 | `consent_version` | e.g. `v1`; `practice` in a practice export |
| 8 | `intimate_agreed` | `true` / `false`: the optional "more personal measurements" tick |
| 9 | `weight_agreed` | `true` / `false`: the optional weight tick |
| 10 | `stated_height_typed` | the height the person said, as typed: cm (e.g. `171.5`) or ft-in (e.g. `5 7 1/2` = 5 ft 7½ in) |
| 11 | `stated_height_unit` | `cm` / `ftin` |
| 12 | `stated_height_cm` | the stated height in cm |
| 13 | `stated_weight_kg` | the weight the person said |
| 14 | `weight_kg` | the weight recorded (scale or told); empty if not agreed or skipped |
| 15 | `weight_source` | `scale` / `told` / empty |
| 16 | `collector` | `C01`, `C02`, … (same collector, same code within one export) |
| 17 | `phone_model` | the phone that took the photos, if known |
| 18 | `created_date` | date the participant was created |
| 19 | `measured_date` | date the measurements were finished |
| 20 | `photos_date` | date front and side photos were in |

## `measurements.csv` (one row per participant and measurement)

| # | Column | Values |
| --- | --- | --- |
| 1 | `export_id` | UUID |
| 2 | `code` | one of the 25 codes below |
| 3 | `value_cm` | the value in cm; for codes taken twice, the mean of the two closest readings; empty if skipped |
| 4 | `readings_cm` | every reading in cm, separated by `\|` (e.g. `78.4\|78.6`) |
| 5 | `unit_typed` | `cm` / `in` |
| 6 | `skipped` | `true` / `false` |
| 7 | `skip_reason` | `declined`, `could_not_measure`, `other`, `declined_at_consent`; empty if not skipped |
| 8 | `unusual_confirmed` | `true` when the collector confirmed a value outside the expected range |
| 9 | `height_method` | height only: `steel_tape` / `wall_100` |
| 10 | `hair_adds_height` | height only: `true` when hair or headwear may add height |

Measured twice (third reading if the first two differ by more than 1 cm): `height`, `bust_girth`,
`chest_girth`, `waist_girth`, `hip_girth`.

### Measurement codes and definitions (as shown to collectors)

From `src/lib/measurements.ts`. Over light clothing, tape snug not tight, standing straight and
relaxed, arms down. Sets: women and girls 13+ 24 codes (no `chest_girth`); men and boys 13+ 18
codes; children 8–12 the 9 codes marked C. `I` = only with the "more personal measurements" tick.

| Code | Definition | C | I |
| --- | --- | --- | --- |
| `height` | Barefoot, back to the wall. Steel tape from the floor; straight edge flat on the head. | C | |
| `neck_girth` | Around the base of the neck. | C | |
| `shoulder_width` | Shoulder point to shoulder point, across the back. | C | |
| `shoulder_length` | Side of the neck to the shoulder point. | | |
| `bust_girth` | Around the fullest part of the bust, tape level. (women) | | I |
| `underbust_girth` | Around the ribcage just below the bust. (women) | | I |
| `chest_girth` | Around the fullest part of the chest, under the arms. (men, children 8–12) | C | |
| `bust_point_distance` | Straight across, from one bust point to the other. (women) | | I |
| `shoulder_to_bust_point` | From the side of the neck down to the bust point. (women) | | I |
| `front_length` | Side of the neck to the waist, at the front (over the bust for women). | | |
| `back_length` | From the neck bone at the back (nape) down to the waist. | C | |
| `waist_girth` | Around the natural waist (the narrowest part). | C | |
| `high_hip_girth` | Around the body about 10 cm below the waist. (women) | | |
| `hip_girth` | Around the fullest part of the hips. | C | |
| `waist_to_hip` | At the side, from the waist down to the fullest part of the hip. | | |
| `arm_length` | Shoulder point to wrist bone, arm hanging relaxed. | C | |
| `upper_arm_girth` | Around the fullest part of the upper arm. | | |
| `wrist_girth` | Around the wrist, just above the wrist bone. | | |
| `inseam` | From the crotch down the inside of the leg to the ankle bone. | C | I |
| `outseam` | From the waist down the side of the leg to the ankle bone. | | |
| `thigh_girth` | Around the fullest part of the thigh. | | |
| `knee_girth` | Around the middle of the knee. | | |
| `calf_girth` | Around the fullest part of the calf. | | |
| `waist_to_knee` | From the waist down to the middle of the knee (skirt length). (women) | | |
| `shoulder_to_knee` | From the side of the neck at the shoulder down to the knee (dress length). (women) | | |

## `photos.csv` (one row per photo)

| # | Column | Values |
| --- | --- | --- |
| 1 | `export_id` | UUID |
| 2 | `slot` | `front` / `side` / `back` |
| 3 | `file` | `images/<export_id>/<slot>.jpg` |
| 4 | `width` | pixels (3:4 portrait) |
| 5 | `height` | pixels |
| 6 | `bytes` | file size |
| 7 | `taken_at` | ISO time the photo was taken |
| 8 | `zoom` | digital zoom used, 1–4 |
| 9 | `level_pitch_deg` | phone tilt forward/back at the shutter, degrees from upright |
| 10 | `level_roll_deg` | phone tilt sideways at the shutter, degrees |
| 11 | `head_top_y` | top of the head (hair or headwear included), pixels from the top, measured before the blur |
| 12 | `heel_y` | lowest heel point, pixels from the top, measured before the blur |
| 13 | `people_detected` | people found by the body model (a saved photo has 1) |
| 14 | `faces_detected` | face-detector finds |
| 15 | `a4_confirmed` | `true`: the collector confirmed the A4 sheet was fully visible and flat |
| 16 | `blur_version` | `2` (whole-head blur) or `3` (also no blur on the body below the neck) |
| 17 | `faces_ignored_on_body` | version 3: face-detector finds on the participant's body below the neck, not blurred; empty for version 2 |

Images are JPEG, made fresh on the phone after the blur (no EXIF), at most 4 MB, at most 1600 px on
the long side. The whole head is blurred.

## `metadata/<export_id>.json` (one per participant)

```json
{
  "format": "anthro-export/1",
  "participant": { "export_id": "…", "practice": false, "sex": "female", "…": "the 20 participants.csv columns, same names and order" },
  "measurements": [
    { "code": "waist_girth", "value_cm": 78.5, "readings_cm": [78.4, 78.6], "unit_typed": "cm",
      "skipped": false, "skip_reason": null, "unusual_confirmed": false,
      "height_method": null, "hair_adds_height": null }
  ],
  "photos": [ { "slot": "front", "file": "images/…/front.jpg", "…": "the photos.csv columns 2–17, same names" } ]
}
```

Two-space indentation. `null` where the CSV has an empty cell. `readings_cm` is an array of numbers
(the CSV joins them with `|`).

## Change log

| Version | Date | Change |
| --- | --- | --- |
| `anthro-export/1` | 25 Nov 2026 | First versioned format: the export as built in F8, with `blur_version` 2 or 3 and `faces_ignored_on_body` (F6 Amendment C, 24 Nov). Version stamp added to README.txt and every metadata file. |
