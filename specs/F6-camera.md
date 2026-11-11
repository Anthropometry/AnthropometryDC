# F6: Camera and face blur

**Status:** draft <!-- draft | approved | built | verified — only Ryan sets "approved" -->
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
4. **Review:** the **blurred** photo only (the collector never sees an unblurred saved image):
   - **Use photo** / **Retake**;
   - "Is the whole body visible, head to heel?";
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
| Supabase `photos` (new) | `participant_id`, `slot` (front/side/back), `width`, `height`, `bytes`, `taken_at`, `faces_detected` (count), `level_pitch`, `level_roll` (degrees at the shutter), `phone_model`; **no image, no name** | After the upload is confirmed |
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
5. *(open: see below)*
6. **Phone:** **hand-held** with the level lock and auto-shutter; a tripod (from the project
   coordinator) only if the 20 test photos come out tilted or blurry.
7. **Children:** the same poses (back optional), with the guardian present.

## Open questions for Ryan

5. **Size reference in the photo:** none (height as the scale), a plain A4 sheet, or a printed
   card / floor mat? Ryan asked for an explanation first (11 Nov).
