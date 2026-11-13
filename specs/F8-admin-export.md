# F8: Admin progress and research export

**Status:** approved by Ryan, 13 Nov 2026 (weekly backup on hold); built <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M7
**Branch:** `f8-admin-export`

Anthro Collect is a student research project at Ashesi University.

## Goal (one sentence)

Ryan can see on his phone how collection is going against the sample plan, and can make a clean,
name-free research dataset (photos, measurements, metadata) on his own laptop (the weekly backup is on hold),
without anyone else, Claude Code included, ever reading the data.

## User stories

- As the project lead, I want to see how many participants are complete per group (women, men,
  girls, boys; age groups), per collector and per week, so I can steer collection.
- As the project lead, I want early warnings about data quality (many skips, photos needing retakes,
  a collector far behind) so I can retrain someone before it is too late.
- As the project lead, I want one command on my laptop that writes the dataset for the model, and a
  backup, so the data is safe and ready for analysis.

## Part 1: Progress on the Admin screen (in the app, online)

A new **Progress** section on the Admin screen (admins only; the database checks it). Participant
data appears only as counts: never a participant's name, receipt code, photo or single values.
**No targets are shown** (Ryan, 13 Nov: collection may go beyond the planned numbers).

1. **Totals** (real participants; practice shown separately in grey, so training is visible too):

   | | Complete | Measured, photos missing | Consented, not measured |
   | --- | --- | --- | --- |
   | Women (18+) | … | … | … |
   | Men (18+) | … | … | … |
   | Girls (8–17) | … | … | … |
   | Boys (8–17) | … | … | … |
   | **All** | … | … | … |

   "Complete" = consent + measurements finished + front and side photos. Tap a row → the same counts
   by age group (18–24 … 65+; 8–9 … 15–17). Below: complete per week (last 8 weeks).
2. **Collectors: progress and follow-up.** One card per collector (name and phone number are
   already visible to admins on this screen; still never beside a participant's data):
   - complete this week and in total; partial ones waiting on them ("3 measured, photos missing",
     "1 consented, not measured"), which tells you whom to remind;
   - last day anything arrived from them, and **"Nothing sent for 5 days"** in amber;
   - training: practice participants completed (e.g. "Practice: 4 complete");
   - phone check: passed or not, phone model (from F2);
   - quality: share of measurements skipped, unusual values kept, photos needing a second person
     out of frame;
   - **Call** and **WhatsApp** buttons that open the phone's own dialer or WhatsApp with the
     collector's number (nothing is sent by the app). Decided, Ryan 13 Nov.
3. **Spread of heights** (MISSION: "a wide spread of heights and sizes"): a simple bar chart of
   measured heights in 10 cm bands, per sex and adult/child, so gaps (e.g. very tall men, small
   children) are visible early.
4. **Quality across the study** (counts only):
   - measurements skipped, by reason (declined, could not measure, other), and which measurements
     are skipped most;
   - unusual values kept as confirmed;
   - photos where more than one person was found;
   - optional extras taken: weight (scale / stated / skipped), personal measurements agreed;
   - average gap between stated and measured height and weight (how far off people are);
   - withdrawals so far (count only).
5. **Free-tier space:** photo storage used of the 10 GB R2 allowance and database size of the
   500 MB Supabase allowance, so you know before anything fills up (about 1–1.5 MB per participant).
6. **Refresh** button and "as of 14:05". Works only online (it reads the server).

Not shown (would need the phones to report it): "needs attention" items still on a collector's
phone *(open question 4)*; they are visible on that collector's own phone (F7).

## Part 2: Research export (a script on Ryan's laptop)

Run by Ryan only, from the project folder: `npm run export`. It reads with the **Supabase secret key**
and an **R2 read-only key**, both in `.env.admin` on Ryan's laptop, in a data folder outside OneDrive
(never in the repo, never in chat; POLICY §8). It writes into that data folder only. Claude Code writes and tests the script with fake data only and never runs it
against the real project (POLICY §6).

**What it writes** (a new folder per run, e.g. `anthro-export-2027-01-15/`):

```
README.txt                 what each file and column means, units, versions, date of export
participants.csv           one row per participant: export id, sex, age range, clothing,
                           stated height (as typed + unit + cm), stated weight, scale weight and source,
                           collector code, phone model, dates, consent version, ticks (intimate, weight)
measurements.csv           one row per participant and measurement: code, value in cm, readings in cm,
                           unit typed, skipped + reason, unusual confirmed, height method, hair adds height
photos.csv                 one row per photo: slot, size, zoom, tilt (pitch, roll), head top y, heel y,
                           people found, faces found, A4 confirmed, blur version
images/<export id>/front.jpg, side.jpg, back.jpg   (already face-blurred on the phone)
metadata/<export id>.json  everything above for that participant in one file
```

**What it never includes:** practice participants; rejected participants (child said no);
withdrawn participants (already deleted); **names, signatures, guardian names, receipt codes,
consent records**; collectors' names or phone numbers (a collector appears only as a code, e.g.
`C03`); photos made with the old blur (blur version 1).

**Export id:** a new random id per participant per export *(open question 2)*, so a file passed to
someone else can't be matched back to the database without the mapping, which stays on Ryan's
laptop only.

**Checks before writing** (the script stops and says why):
- every photo file in R2 has its row and every row its file;
- no image is larger than 4 MB or not a JPEG;
- counts match the Progress screen.

## Part 3: Weekly backup — ON HOLD (Ryan, 13 Nov 2026)

Not built for now: a full copy (photos included, about 1–1.5 GB at the end) is too heavy for Ryan's
laptop today. Until it starts, the data lives only in the project's cloud services: the Supabase
database and the Cloudflare R2 photo storage (both free tier).

**Risk while on hold** (so it is a known choice): the free Supabase plan keeps no backup you can
download, so if a row is deleted by mistake or the project is lost, it can't be brought back. R2 keeps
no older copies either. The app already protects against the most likely losses: collectors can't
delete real participants, withdrawal needs the receipt code typed twice, and phones keep everything
until the server confirms it.

**When Ryan has more space** (a new drive, or a bigger laptop), the plan already agreed applies: one
command (`npm run backup`) makes one password-locked file, the password typed each time and held by
Ryan alone; a second copy may go to Ryan's own personal cloud storage. It needs its own short
approval then.

## Data written

| Where | Fields | When |
| --- | --- | --- |
| Supabase (new functions, admin only) | `admin_progress()`, `admin_collector_progress()`, `admin_height_bands()`, `admin_quality()`, `admin_space()`: counts only | Read by the Progress section |
| Ryan's laptop | export folders, export id mapping | When Ryan runs the export |

No names outside `consents`. No email anywhere. No unblurred face.

## Acceptance criteria (testable)

- [ ] Progress shows complete / partial counts by sex and adult/child (no targets), by age group,
      per week, per collector (with follow-up items and "nothing sent for 5 days"), height bands,
      quality counts and free-tier space; real and practice apart.
- [ ] **DENY:** a collector (not admin) gets nothing from the progress functions; anon nothing.
- [ ] No progress function returns a name, receipt code, phone number or a single participant's row.
- [ ] Export skips practice, rejected and old-blur photos and contains no name, signature, guardian
      name, receipt code or consent (checked by a test on fake data).
- [ ] Export files match the README; cm values equal the database's; photo rows and files match.
- [ ] (On hold) backup: not part of this build; the M7 "one backup done" box waits for it.

## Security requirements

- Admin role checked in the database for every progress function (`is_admin()`), as for the other
  admin functions.
- Secret key and R2 key only in `.env.admin` on Ryan's laptop; the secret scanner already blocks them
  in commits. **The project folder is inside OneDrive**, so `.env.admin`, exports and backups must
  live in a folder outside it (e.g. `C:\anthro-data\`): the scripts read that folder's path, refuse
  to write inside the project folder or any OneDrive folder, and say so *(open question 7)*.
- No data in logs: the scripts print counts only.
- Deny cases tested: collector and anon calling progress functions; export of a practice, rejected or
  consent row (must not appear); a photo with blur version 1 (must not appear).

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Progress functions: counts per group, age range, collector, height bands, quality; admin only | PGlite | both |
| Progress section: table, drill-down, refresh, offline message | React Testing Library | both |
| Export on a fake database and fake bucket: files, columns, README, exclusions, export ids | Vitest | both |

## Phone test script

1. As admin, Admin → **Progress**: totals by women, men, girls, boys (no targets); practice in grey,
   real at 0; each collector's card with their practice count and Call / WhatsApp.
2. Make 2 practice participants complete → practice counts go up; real stay at 0.
3. As a collector (not admin): there is no Progress section; calling it is refused.
4. On the laptop (Ryan): `npm run export` → folder with README, CSVs, images; no names anywhere
   (search the folder for a practice participant's name: nothing found). Practice is excluded, so
   before Gate B the export is empty except the README: run it with `--include-practice` once to see
   the shape *(open question 1)*.
5. (Backup on hold: nothing to test.)

## Decided (Ryan, 13 Nov 2026)

All as recommended: (1) `--include-practice` allowed for a test export, marked PRACTICE everywhere;
(2) a new random export id per participant per export, the mapping kept only in the data folder;
(3) see below; (4) no stuck-item counts on Progress for now; (5) a read-only R2 key in `.env.admin`;
(6) about 6 years; (7) a local data folder outside OneDrive, OneDrive paths refused; (8) Call and
WhatsApp buttons; "nothing sent for 5 days".

## Questions as asked

1. **Trying the export before Gate B:** allow `--include-practice` (marked PRACTICE everywhere, never
   for research) so you can check the format now? (Recommended: yes.)
2. **Export id:** a new random id per participant per export (recommended: safest to share), or keep
   the database id (simpler to match later exports)?
3. **Backup copies (for when the backup starts) — decided (Ryan, 13 Nov):** nobody else holds the password or any key (not the
   supervisor). The second encrypted copy goes to Ryan's own personal cloud storage (his own account,
   not the university's); the script only writes the encrypted file into a folder Ryan picks, and his
   own sync app uploads it. The app and scripts never need or store an email address.
4. **Stuck items on phones** (F7): show a count per collector on Progress? It needs the phones to
   report it, which they don't do yet (small addition). Recommended: not now.
5. **R2 access for the export:** a read-only R2 API key in `.env.admin` (recommended: fast, one
   setting in Cloudflare), or download through your own Wrangler login (no new key, slower for 2,700
   photos)?
6. **Retention — decided (Ryan, 13 Nov): about 6 years** after collection ends, for the research
   dataset, the backups and the consent records; then deleted (exports, backups, R2 and the database).
   A yearly reminder to check whether anything can be deleted earlier. Reasons are written in the IRB
   form and the consent text.
7. **Data folder outside OneDrive:** the project sits in your Ashesi OneDrive, which syncs to the
   cloud. Keep `.env.admin`, exports and backups in a local folder such as `C:\anthro-data\`
   (recommended), with the scripts refusing OneDrive paths? (The encrypted backup copy of question 3
   is the one exception, and only because it is encrypted.)
8. ~~Call / WhatsApp buttons~~ **Decided (Ryan, 13 Nov): yes.** Still open: is **5 days** right for
   "nothing sent for 5 days"?
