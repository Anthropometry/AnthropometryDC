# F6: Camera and face blur

**Status:** approved by Ryan, 11 Nov 2026 · **Amendment A (12 Nov 2026): approved by Ryan, 12 Nov 2026; built** · **Amendment B (18 Nov 2026): approved by Ryan, 18 Nov 2026; parts 1–2 built (`f6b-sensor-fix`), part 3 next** · **Amendment C (24 Nov 2026): approved by Ryan, 24 Nov 2026; built (`f6c-blur-body`), migration applied 24 Nov**, see the end of this file <!-- draft | approved | built | verified — only Ryan sets "approved" -->
**Milestone:** M5
**Branch:** `f6-camera`

Anthro Collect is a student research project at Ashesi University.

## Goal (one sentence)

After consent and measurements, the collector takes a front and a side photo (back optional) of the
whole body, held level by the app and taken automatically, with every face blurred on the phone
**before** the photo exists as a file. Nothing unblurred is ever stored or sent.

## Why (research purpose)

The photos are the model's **input**; the tape measurements are its answers. The model can only learn
well if every photo is taken the same way:
- same poses;
- the whole body, head to heel, visible;
- the camera level and square-on;
- a plain background.

Height (measured with the steel tape) gives each photo its scale (see the F5 spec). The face is never
needed, so it's blurred.

## Poses

Described from Ryan's reference image (11 Nov), **posture only**. Nothing else from that image is
used (DISCUSSION.md).

| Photo | Required | Pose |
| --- | --- | --- |
| **Front** | yes | Facing the camera, standing upright, feet about hip-width apart and flat, arms held out to the sides at about 30–45° from the body (an "A" shape: arms not touching the body, a gap between the legs), looking straight ahead |
| **Side** | yes | Side-on to the camera (left side towards it), upright, feet together and flat, looking straight ahead; the arm nearer the camera raised straight forward at shoulder height, so the chest, waist and back outline isn't hidden |
| **Back** | optional (first to cut, per North Anchor) | Back to the camera, same stance as the front |

**For every photo:**
- barefoot;
- whole body from the top of the head to the bottom of the heels inside the frame;
- a plain wall behind, with the floor visible;
- clothing as recorded in F5 (light).

## Screens

1. **Start:** after Finish on the measurement summary ("Take photos"), or later from the list
   ("Measured · photos needed" → **Photos**). Consent is checked first (the database and Worker
   check again).
2. **Set-up card** (once per participant), with a simple drawing (made in the app):
   - a plain wall; a flat floor; good light from the front, not behind the person;
   - phone about **2.5–3 m away** at **mid-body height** (about 1 m from the floor), held upright;
   - a **plain A4 sheet** flat on the floor at the feet (front: in front of the toes; side and back:
     beside the feet, long side towards the camera), kept clean and flat;
   - "Tell the person what you are doing before each photo."
3. **Live camera** (back camera), for each pose in turn:
   - a **silhouette guide**: an outline of the pose (front, side or back; female or male, drawn
     in the app) over the live view, showing where the body should fit, head line to heel line;
   - a **level indicator**: the phone must be upright and square. The guide turns green only within
     **pitch 90° ± 1.5° and roll ± 1°** (North Anchor), using the motion sensor checked in F2;
   - a **3-second auto-shutter**: when level and steady, "3, 2, 1" counts down and the photo is taken
     by itself (no shaking from pressing a button). Moving or tilting cancels the countdown;
   - the live view on screen shows the face (that can't be avoided while framing). **Nothing from
     the live view is saved** until it is blurred.
   - **Zoom (added while building, 11 Nov):** every photo is a 3:4 portrait frame; the collector
     uses digital zoom (1–4×), not their feet, until the head touches the top line and the heels
     the bottom line. The screen shows exactly the photo's area. Zoom is stored with each photo.
     Reason: from 2.5–3 m a phone lens shows an adult at about 45% of the frame, which would leave
     the head below the always-blurred face zone.
4. **Review:** the **blurred** photo only (the collector never sees an unblurred saved image):
   - **Use photo** / **Retake**;
   - "Is the whole body visible, head to heel?" and "Is the A4 sheet fully visible and flat?";
   - for the back photo: **Take** or **Skip back photo**.
5. **Done:** "Photos saved", and the list shows **Complete** (consent, measurements and photos).
6. **Offline:** photos are kept on the phone (IndexedDB) and sent when online, after the
   participant's consent and measurements, through the Worker (owner checked; JPEG only; 4 MB maximum;
   practice photos under `practice/`). Each is deleted from the phone only after the server confirms.

## Face blur: twice, before saving (defence in depth)

1. **Detector:** the **MediaPipe face detector**, its files **self-hosted** in the app so it works
   offline. Each detected face box is enlarged (about 40%) and **strongly blurred / pixelated**, so it
   can't be recognised.
2. **Fixed head zone:** whatever the detector finds or misses, the zone where the head must be inside
   the silhouette guide is **always** blurred too. A face is still hidden if the detector misses it
   (profile view, dark light, headwrap).
3. **Order inside the camera code:**
   1. the frame is drawn onto an off-screen canvas;
   2. both blurs are applied;
   3. only then is a JPEG made.

   The raw frame is never turned into a file, never kept in memory after that step, and never stored
   or sent. A test fails the build if an unblurred frame could reach storage (North Anchor).
4. **EXIF removed:** the JPEG is made fresh from the canvas, so it carries no location, camera or time
   metadata.

**Head outline vs privacy (open question 3):** height comes from the tape, but the model may still
need the **top of the head** in the photo. The blur covers the face and the head zone; it should keep
the outline of the top of the head visible without showing who it is.

## Data written

| Where | Fields | When |
| --- | --- | --- |
| R2 `photos` (private) | `<participant id>/front.jpg`, `side.jpg`, `back.jpg` (practice under `practice/…`) | Upload through the Worker |
| Supabase `photos` (new) | `participant_id`, `slot` (front/side/back), `width`, `height`, `bytes`, `taken_at`, `faces_detected` (count), `level_pitch`, `level_roll` (degrees at the shutter), `phone_model`, `a4_confirmed`, `zoom`; **no image, no name** | After the upload is confirmed |
| Supabase `participants` | `photos_done_at` (new) | When front and side are in (back optional) |
| Phone (IndexedDB) | blurred JPEGs waiting to upload | Until the server confirms |

## Rules in the database and Worker

- **Consent first:** photo rows are refused without a consent, or for a rejected participant.
  `agreed_photos` is always true on a valid consent (required tick).
- **Order:** photos only after measurements are finished (`measurements_done_at` set), so every photo
  has its ground truth.
- **Worker:** owner-only upload (from F4), JPEG magic bytes, 4 MB maximum; practice files under
  `practice/`; withdrawal deletes photos from R2 (from F4) and photo rows (cascade).
- `photos_done_at` only when front and side exist.
- Collectors see only their own participants' photo rows; admins all; anon nothing. Nobody can list
  or download photos from the app; downloading is for export (F8), not collectors.

## Acceptance criteria (testable)

- [ ] Photos can't start without consent, or before measurements are finished.
- [ ] The shutter only fires when level (pitch 90 ± 1.5°, roll ± 1°) and steady for 3 seconds;
      tilting cancels it.
- [ ] Every saved photo is blurred:
  - detector blur on any detected face, **and** the fixed head-zone blur, always;
  - checked on **20 test photos** (North Anchor), including side views, dark light and headwraps;
  - no raw frame is stored.
- [ ] The JPEG has no EXIF; it is at most 4 MB.
- [ ] Front and side are required; back can be skipped; Retake works.
- [ ] Works offline; uploads after consent and measurements; nothing deleted from the phone before
      the server confirms.
- [ ] Withdrawal deletes photos and photo rows.
- [ ] Runs on a **low-cost Android first** (North Anchor), then iPhone.

## Security requirements

- No unblurred face leaves the camera function (POLICY §10); the blur cannot be switched off.
- Self-hosted detector files (no third-party request at run time).
- No photo, face or name in any log. Images live only in the private bucket.
- Deny cases tested:
  - photo without consent; before measurements are finished;
  - another collector's participant; pending collector; anon;
  - non-JPEG; over 4 MB;
  - an unblurred frame reaching the upload queue (must be impossible).

## Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Level logic: pitch/roll windows, steady for 3 s, cancel on tilt | Vitest | both |
| Blur pipeline: raw frame → blurred canvas → JPEG; the head zone is always blurred; detector boxes enlarged; no EXIF | Vitest (+ canvas mock) | both |
| "No unblurred frame can reach storage": the queue only accepts output of the blur function | Vitest | deny |
| Photo rows: consent first, after measurements, ownership, `photos_done_at` rules, cascade | PGlite | both |
| Worker: JPEG only, size, owner, practice folder, withdrawal deletes | Vitest (Worker) | both |
| Screens: set-up, guide per pose, countdown, review, retake, skip back, offline | React Testing Library | both |
| 20 real test photos blurred (volunteers, practice only) | Manual, Ryan | — |

## Phone test script

1. Practice participant → consent → measurements → Finish → **Take photos** → set-up card.
2. **Front:** stand in the A pose; tilt the phone → the guide stays red; hold it level and steady →
   "3, 2, 1" → photo → review shows the **blurred** face → Use photo.
3. **Side:** the arm forward pose → photo → blurred (check a side face) → Use photo.
4. **Back:** Skip.
5. The list shows **Complete**.
6. Airplane mode → another participant's photos → "waiting to upload" → back online → "All saved".
7. On a low-cost Android first, then the iPhone.
8. Ryan: 20 test photos (different light, skin tones, headwraps, side views) → no recognisable face in any.

## Decided (Ryan, 11 Nov 2026)

1. **Poses:** front A-pose and side pose with the near arm forward, both required, as described above.
2. **Back photo:** optional; the collector can skip it.
3. **Blur:** **face only, strong** (detector + a fixed face zone always blurred); the outline of the
   head and hair stays visible for the model.
4. **Clothing:** ask for **close-fitting clothing where the participant is comfortable**; never ask
   anyone to undress; the F5 clothing answer is recorded.
5. **Size reference:** a **plain A4 sheet** (21 × 29.7 cm, ordinary paper) in **every** photo, flat on
   the floor: just in front of the toes for the front photo, beside the feet for the side and back
   photos (long side towards the camera). Plain A4, not a custom card, because that is what future
   users will have (docs/MISSION.md, "Future use"). The outline guide shows where it goes; the review
   screen asks "Is the A4 sheet fully visible and flat?". Height stays the main scale; the sheet is
   the second scale and the fallback.
6. **Phone:** **hand-held** with the level lock and auto-shutter; a tripod (from the project
   coordinator) only if the 20 test photos come out tilted or blurry.
7. **Children:** the same poses (back optional), with the guardian present.

## Open questions for Ryan

None. All seven answered (11 Nov 2026).

---

## Amendment A (12 Nov 2026): find the head wherever the person stands, **approved by Ryan, 12 Nov 2026**

Where this amendment and the text above disagree, the amendment wins once Ryan approves it.

### Why (Ryan's phone test, 12 Nov 2026)

Ryan tested PR #15 on an iPhone with 3 practice participants (7 photos downloaded and reviewed,
9 photo rows read by Ryan; no names).

- **Two photos kept an unblurred face** (one participant, front and side, zoom 1.0). The person stood
  lower and smaller in the frame than the outline. The blur only covers the outline's head position
  and only searches for faces around it, so the real face was outside both. The detector reported a
  "face" in the ceiling. The review screen did not ask whether the face was hidden, so the photo was
  kept. **This breaks POLICY §10 and blocks PR #15.**
- **Bystanders** walking behind the participant kept visible faces (2 photos).
- **Framing was hard:** to fit head and heels to the outline's lines the collector had to stoop very
  low (the outline only fits with the phone at about 1 m and the body centred). Ryan ended up lining
  up the feet and the A4 sheet instead, which is exactly when the head left the blur zone.
- **Level lock** was hard at first and easier with practice; all saved angles were within ±1.5°.
- **Protocol:** shoes were worn, A4 sheets were creased or folded, backgrounds were busy corridors.
- Fine: metadata in the files is only colour space and pixel size (no place, date or camera).

The cause is a design flaw, not a tuning problem: **the blur trusted the collector's framing.** The
fix makes the blur find the person, and refuses the photo when it can't.

### Changes

**1. Head found by a body (pose) model, not assumed from the outline.**
- Add the **MediaPipe pose landmarker** (same library, `@mediapipe/tasks-vision` 0.10.35; one new
  self-hosted model file, *lite* version, about 5–6 MB, Apache-2.0). It finds people from the front,
  side or back at 2.5–3 m, and gives points for the nose, eyes, ears, shoulders, hips, ankles and
  heels.
- **Head box** for every person found: centred on the head points (nose, eyes, ears, whichever
  exist), a square of about 0.8 × the shoulder width and at least 3 × the eye-to-ear distance, from
  above the hairline to below the chin. The exact factors are set on Ryan's test photos and fixed in
  tests.
- **What is blurred** (all before any file exists, as before):
  1. the head box of **every** person the pose model finds (participant and bystanders, up to 5);
  2. every face the face detector finds, now searched over the **whole frame** in overlapping tiles,
     not only near the outline's head (catches small or partly hidden faces);
  3. the fixed face zone of the outline, still always (a cheap extra layer).
- The head-outline decision (11 Nov, decision 3) changes: the whole **head**, not only the face, is
  blurred, because the head box can't separate face from hair reliably at this distance
  (**decided, Ryan 12 Nov**).
- **Head top and heels kept as numbers** (decided, Ryan 12 Nov): the photo's head-to-heel height is
  how the model reads height, so **before** blurring, the app finds the top of the head (hair or
  headwear included) and the lowest heel point from the pose model's body outline (its segmentation
  mask) and stores both positions, in photo pixels, with the photo. The blurred photo then loses
  nothing the model needs.

**2. Fail-safe: no head, no photo.**
- If the pose model finds **no person** in the frame, or the participant's head points are missing,
  the photo is **refused**: nothing is saved and the screen says "Can't see the whole person. Make sure
  head and feet are in the picture." The collector retakes.
- **Slow mode** (decided, Ryan 12 Nov): on a phone too slow for the live checks (about 4 a second),
  the app skips them, takes the still when the phone is level and steady, and runs the pose model once
  on it (a few seconds, "Checking the photo…"). The blur is the same, fully automatic.
- If the camera tools **can't run at all** (no WebAssembly SIMD, i.e. iPhone 7 and older or an
  Android stuck on a pre-2021 Chrome; or out of memory), that phone **can't take photos** (decided,
  Ryan 12 Nov). The phone check (F2) shows "This phone can't take study photos" so it is found before
  collection; consent and measurements still work. No older or larger build and no manual marking.
- **Download weight** (Ryan 12 Nov: collectors use their own phones, so nothing heavy): the camera
  tools (runtime about 11 MB, face model 0.2 MB, pose model about 5.5 MB; about 18 MB in all) are
  **no longer downloaded at install**. They download **once, the first time the collector opens the
  camera**, with a short progress message: "Getting the camera ready (one time, about 18 MB)." It
  needs a mobile-data signal that first time only (most collectors have no Wi-Fi, Ryan 12 Nov; no
  Wi-Fi advice is shown). Then they stay on the phone and work offline. The rest of the app stays small.

**3. The review asks about the face.**
- New first question: **"Is the face completely hidden?"** Yes / No. **No discards the photo** and goes
  back to the camera (the photo is never queued).
- The other two stay: whole body visible; A4 visible and flat. All three must be Yes to **Use photo**.
- Stored: `face_hidden_confirmed` (always true on a saved photo).

**4. Easier framing: the app checks the body, not the outline.**
- The outline stays as a picture of the pose, but the person no longer has to fit its lines.
- About 4 times a second the pose model checks the live view. The auto-shutter needs **all** of:
  - the phone level (see 5);
  - the participant's **head and both heels inside the frame**, with a small margin;
  - the participant at least **55% of the frame height** (enough pixels for the model);
  - only **one person** in the frame (**decided, Ryan 12 Nov**: the shutter waits for bystanders);
  - steady for 3 seconds (as before).
- Plain hints instead of lines: "Zoom out" / "Step back" (head or feet cut off), "Zoom in" (person
  too small), "Wait until nobody is behind the person".
- **Phone height:** the set-up card says **kneel on one knee** (phone at about 1 m) instead of
  stooping, or rest the phone on a stand or stool. Holding it higher is allowed; the app still checks
  that the whole body is in the frame (**decided, Ryan 12 Nov: kneel on one knee**).

**5. Level limits.** Loosen from pitch ±1.5° / roll ±1° to **pitch ±3° / roll ±2°**; the exact
angles are stored with each photo as now, so the model can correct for them (**decided, Ryan
12 Nov**).

**6. Set-up card and training.**
- Shoes **off** (as in F5's height protocol): "Remove shoes" on the card.
- **A4 sheet flat and uncreased**: keep it in a folder; replace it when creased.
- **Plain wall, nobody behind the person**; if people pass, wait.
- A short **tutorial video** for collectors who can't be trained in person: script and shot list
  written after this amendment is built and stable (Ryan records it). Not part of the app.

**7. Existing practice photos.** All practice photos taken before this amendment are deleted (Ryan:
delete those practice participants in the app, or their `practice/` folders in R2). Real collection
hasn't started, so no real photo is affected.

### Data written (changes)

| Where | Change |
| --- | --- |
| Supabase `photos` (new migration) | `people_detected` (0–20, from the pose model), `face_hidden_confirmed` (boolean, must be true), `blur_version` (2 for this amendment; rows from before are version 1), `head_top_y` and `heel_y` (photo pixels, measured before blurring; within the photo's height, head above heels) |
| `public/models/` | the pose landmarker *lite* model file (self-hosted; SHA-256 recorded in DISCUSSION.md) |
| Phone (service-worker cache) | camera tools (about 18 MB) cached on first camera use instead of at install; the install itself shrinks by about 12 MB |

No image, no name, as before.

### Acceptance criteria (testable)

- [ ] A face is blurred wherever the person stands in the frame: top, middle, bottom, left, right,
      small (zoom 1.0) or large.
- [ ] A bystander's head is blurred too.
- [ ] No person found → no photo, nothing queued, the "Can't see the whole person" message.
- [ ] Pose model unavailable → photos can't be taken; the phone check says so.
- [ ] A slow phone uses slow mode and still blurs every head automatically.
- [ ] Installing the app does not download the camera tools; the first camera use does, with the
      "Getting the camera ready" message, and the camera then works in airplane mode. If there is no
      signal that first time: "The camera needs signal once to get ready. Try again when you have
      signal." (measurements are not affected).
- [ ] "Is the face completely hidden?" No → the photo is discarded, never queued.
- [ ] The shutter waits for head and heels in the frame, the person big enough, one person, level,
      and 3 seconds steady; the right hint shows for each problem.
- [ ] Level limits pitch ±3° / roll ±2°.
- [ ] `photos` refuses `face_hidden_confirmed = false`, a missing `blur_version`, and head-top / heel
      positions outside the photo or in the wrong order.
- [ ] Head-top and heel positions are measured before the blur and match the person in the photo
      (checked on Ryan's test photos within about 1% of the photo height).
- [ ] Ryan's **20 new test photos**: person low and high in the frame, zoom 1.0 and 2.0, a bystander
      behind, back view, side view, headwrap, glasses, dim light, a child-height person → **no
      recognisable face in any**, bystanders included.

### Security requirements (additions)

- The blur still can't be switched off, and the only way to a saved photo is still `capture()`.
- **Fail closed:** any error in the pose model or the face detector → no photo. (Today a detector
  error falls back to the fixed zone only; that fallback is removed.)
- Model files self-hosted; no request to Google at run time.
- Deny cases tested: no person; pose model error; face-hidden answer No; two people (shutter waits);
  head outside the frame (shutter waits); an unblurred frame reaching the queue (still impossible).

### Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Head box from pose points: front, side, back (ears only), small and large person, clamped to the frame | Vitest | both |
| Head top and heels from the body outline (mask): hair and headwrap included, measured before the blur | Vitest | both |
| Capture order: draw → pose + tiled faces → blur every head and face + fixed zone → JPEG → cleared | Vitest (+ canvas mock) | both |
| No person / pose model error → refused, nothing returned | Vitest | deny |
| Framing check: head or heels out, too small, two people, level → the right hint; shutter only when all pass | Vitest | both |
| Review: face-hidden No discards; all three Yes needed | React Testing Library | both |
| Phone check: pose model missing → "can't take study photos" | React Testing Library | deny |
| `photos`: new columns and checks | PGlite | both |
| 20 new test photos, bystanders included | Manual, Ryan | — |

### Phone test script (amendment)

1. Delete the old practice participants that have photos.
2. New practice participant → consent → measurements → Take photos → the set-up card says kneel,
   shoes off, flat A4, nobody behind.
3. Kneel on one knee about 2.5–3 m away. Zoom out until the hint says the whole person is in.
4. Ask someone to walk behind → "Wait until nobody is behind the person"; the shutter waits.
5. Hold level → 3, 2, 1 → review: **the whole head is blurred** → three questions → Use photo.
6. Retake once and answer **No** to "Is the face completely hidden?" → back to the camera, nothing
   saved.
7. Point the camera at an empty wall → no countdown; the hint asks for the whole person.
8. Side and back photos the same way → Complete.
9. Ryan: the 20 test photos above.

### Decided (Ryan, 12 Nov 2026)

1. **Blur the whole head**, and store the head-top and heel positions measured before the blur.
2. **Weak phones:** slow mode first; a phone that can't run the camera tools at all takes no photos
   (consent and measurements still work). No extra build, no manual marking. Camera tools
   (about 18 MB) download once on first camera use, not at install.
3. **Kneel on one knee** to hold the phone at about 1 m.
4. **Level limits pitch ±3° / roll ±2°**, exact angles stored.
5. **Bystanders:** the shutter waits while a second person is in the frame.

### Open questions for Ryan

None. All five answered (12 Nov 2026). Approved by Ryan, 12 Nov 2026.

---

## Amendment B (18 Nov 2026): the tilt sensor never answers, and posture is not checked, **approved by Ryan, 18 Nov 2026**

Where this amendment and the text above disagree, the amendment wins once Ryan approves it.

### Why (Ryan's phone test of PR #17, 18 Nov 2026)

- Two participants, more than 10 minutes each: the person box said the whole person was in the
  picture, but the level box said **"Hold the phone upright."** the whole time, whatever the
  collector did. The shutter never fired, so **no photo could be taken**. Consent and measurements
  were saved.
- In the person box, "whole person is in the picture" also shows when the arms are down or in the
  wrong place, so a wrong pose could be saved.

### Cause (from the code; no data read)

- "Hold the phone upright." is not about the angle. It is the message for **no tilt reading at all**.
  The degrees line ("forward/back … · sideways …") only shows once a reading arrives. The test
  before Amendment A did show it, so the sensor worked then.
- Amendment A made the **Open camera** tap first check (and the first time, download) the camera
  tools, and only **then** ask for the motion sensor. An iPhone only lets a site ask for "Motion &
  Orientation" **straight after a tap**. After that wait the request is refused without any prompt,
  so no reading ever comes. Android Chrome needs no request, but a site that was once set to
  "Motion sensors: Block" also gives no reading.
- The level lock (±3° / ±2°) is unchanged. The old degrees screen doesn't need to come back: it
  shows again once readings arrive.

### Changes

**1. Ask for the sensor inside the tap (bug fix).** The **Open camera** tap asks for motion
permission first, before anything waits, then gets the camera tools ready.

**2. Say so when there is no reading.** If no tilt reading arrives within 2 seconds of the camera
opening, the level box says **"The phone's tilt sensor is not answering."** and shows a button
**Allow tilt sensor**. On an iPhone the button asks again (a fresh tap). The screen also gives the
fix: iPhone: Settings → Safari → Motion & Orientation Access on. Android Chrome: ⋮ → Settings →
Site settings → Motion sensors → Allow. "Hold the phone upright." is used only when there is a
reading and it is far off.

**3. Posture check before the shutter (new).** The pose model already finds the shoulders,
elbows, wrists, hips and ankles about 4 times a second. The auto-shutter also waits for the
**pose**:

| Photo | Checked | Hint when wrong |
| --- | --- | --- |
| Front | both arms away from the body, **20–60°** from the side of the body (aim 30–45°); feet apart (ankles wider than about half the hip width) | "Lift both arms out to the sides a little" / "Lower the arms a little" / "Feet a little apart" |
| Side | the arm nearer the camera raised forward, the wrist between **about 25° below and 25° above shoulder height** | "Raise the near arm forward to shoulder height" |
| Back | as front | as front |

- Only the **participant** (the main person) is checked. A point the model marks as unsure (for
  example a hidden arm in the side view) counts as **not checked yet**, and the hint asks the
  person to turn as shown.
- The same check runs **again on the still photo**, before the blur, as a fail-safe. If it fails,
  nothing is saved: "The pose was not right. Take it again." On a slow phone (slow mode, no live
  checks) this after-check is the only check.
- The measured arm angles are stored with each photo (`arm_left_deg`, `arm_right_deg`, `feet_apart`
  ratio; numbers only), so the research team can filter photos later.
- The person box turns green only when the whole person **and** the pose are right.

### Data written (changes)

| Where | Change |
| --- | --- |
| Supabase `photos` (new migration) | `arm_left_deg`, `arm_right_deg` (0–180, null if not measured), `feet_apart` (ratio, null for side), `pose_check_version` (1) |

### Acceptance criteria (testable)

- [ ] iPhone: the first **Open camera** tap shows the Motion & Orientation prompt, even when the
      camera tools are downloaded during that tap; after Allow, the degrees line shows.
- [ ] No reading within 2 s → "The phone's tilt sensor is not answering." + **Allow tilt sensor**;
      never "Hold the phone upright." without a reading.
- [ ] Front: arms down → no countdown, "Lift both arms…"; arms in the A shape → countdown.
- [ ] Side: near arm down → no countdown; arm forward at shoulder height → countdown.
- [ ] A still photo that fails the pose check is not saved or queued.
- [ ] The level limits, head blur and fail-safes of Amendment A are unchanged.

### Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Motion permission asked before any wait in the Open camera tap | React Testing Library | both |
| No reading in 2 s → sensor message and button; reading → degrees | React Testing Library | both |
| Arm angle and feet-apart from pose points: front, side, back; unsure points → not checked | Vitest | both |
| Shutter waits for the pose; the right hint per problem | Vitest | both |
| Still photo with a wrong pose → refused, nothing queued | Vitest | deny |
| `photos`: new columns and ranges | PGlite | both |

### Phone test script (amendment)

1. iPhone: Safari → Settings → Clear History and Website Data for the preview (so the prompt shows
   again) → sign in → a measured participant → **Photos** → Open camera → **Allow** motion → the
   degrees line shows.
2. Android: the same; the degrees line shows with no prompt.
3. Front: participant with arms down → no countdown, arm hint → arms out in the A shape → 3, 2, 1 →
   blurred photo → Use photo.
4. Side: near arm down → hint → arm forward at shoulder height → photo.
5. Turn the sensor off (iPhone: Settings → Safari → Motion & Orientation Access off) → the sensor
   message and button show.

### Answered (Ryan, 18 Nov 2026)

1. **Phone:** iPhone. On 18 Nov, opening the camera again (camera tools already on the phone, so no
   wait in the tap) showed the Motion & Orientation prompt and the degrees appeared. This confirms
   the cause: the wait in the first tap blocks the prompt. Every new collector's first camera use
   (and any camera-tools update) would hit it, so the fix is still needed.
2. **Posture limits OK:** front arms 20–60° from the body, side arm within ±25° of shoulder height.
3. **No manual "Take photo" button.** A phone that gives no tilt reading takes no photos, because
   a hand-pressed photo would break the standard way every photo is taken.

4. **Approved, sensor first** (18 Nov): parts 1–2 in a short pull request (`f6b-sensor-fix`, on
   top of `f8-admin-export`) so photos of already measured participants can go on; part 3 (posture)
   after.

### Open questions for Ryan

None.

---

## Amendment C (24 Nov 2026): blur lands on the body, not only the head, **approved by Ryan, 24 Nov 2026**

### Why (Ryan's test photos, 24 Nov 2026; front, side and back, one practice volunteer)

- The head was fully blurred in all three photos (good).
- Extra blur blocks landed where there is no face:
  - **side:** a block over the chest and upper arm, and one over the feet;
  - **front:** a block over the right arm and hip, and one over the left leg and the door;
  - **back:** a block over the lower left (door and the edge of the leg).
- Blocks on the body hide the outline the model learns from (chest, waist, hip, arm, feet), so those
  photos lose value. Privacy is not affected: every face was hidden.

### Cause (from the code; no data read)

The second blur layer (Amendment A, change 2) searches for faces over the **whole photo** in 15
overlapping squares, with the face detector at a **low confidence (0.3)**, and blurs every box found,
enlarged by 40%. Shirt prints, dark forearms, shoes and door panels pass that low bar. The head
itself is blurred by the first layer (the body model), which worked in all three photos.

### Changes

1. **No "face" on the participant's own body.** A face box found by the detector is ignored when
   its centre lies **inside the participant's body outline** (the body model's mask, already used
   for head top and heels) **below the neck** (the shoulder line). A face can't be on someone's
   chest, hip, legs or feet. Everything else stays as now:
   - the participant's whole head: always blurred (body model);
   - every other person's head: blurred (and the photo is refused anyway if a second person is found);
   - face boxes on the background (walls, doors, people the body model missed): still blurred;
   - the fixed face zone: still blurred.
2. **Confidence 0.3 → 0.5** for the whole-photo face search, to cut false blocks on the background.
   The exact value is set on Ryan's test photos (the 20-photo set, bystanders included): the
   highest value that still finds every real face in them.
3. Stored with each photo: `faces_ignored_on_body` (count), so photos can be checked later.
   `blur_version` becomes 3.

### Acceptance criteria (testable)

- [ ] A detector box centred on the participant's body below the shoulders is not blurred; one on
      the head, the background, or another person is.
- [ ] No mask, no shoulders, or any error → nothing is ignored (fail closed: every box is blurred).
- [ ] Ryan's 20 test photos again (bystanders included): **no recognisable face**, and **no blur
      block on the participant's body below the neck**.

### Tests to write

| Test | Tool | Allow or deny |
| --- | --- | --- |
| Face box on chest / hip / feet inside the mask → ignored; on head, background, edge → blurred | Vitest | both |
| No mask or no shoulder points → every box blurred | Vitest | deny |
| `photos`: `faces_ignored_on_body`, `blur_version` 3 | PGlite | both |

### Also seen in the photos (training, no code change)

- **Shoes on** in all three (pink slip-ons). The protocol says barefoot: the heel point and height
  in the photo depend on it.
- **A4 sheet:** front, well placed (just in front of the toes, flat, fully visible). Side and back:
  flat and visible, but about a foot away from the feet; put it **right beside the feet**.
- **Poses:** front A-shape good (feet could be a little further apart); side pose correct (left side
  to the camera, near arm forward at shoulder height); back good.
- **Background:** a door and a laundry basket; a plain wall is better (fewer false blocks too).

### Decided (Ryan, 24 Nov 2026)

Approved as written. Built in `f6c-blur-body`: migration `20261124000000_f6c_blur_body.sql`
(**applied 24 Nov 2026** after Ryan's approval in chat). Version 2 photos still waiting
on phones are sent as before; the export takes versions 2 and 3.

### Open questions for Ryan

None.
