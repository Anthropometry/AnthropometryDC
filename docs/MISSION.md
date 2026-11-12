# Mission

Build a free-to-run field app that lets tailors and field agents in Ghana record consent, tape
measurements and face-blurred photos for about 900 participants, for a **student research project
at Ashesi University** that trains a model to estimate body measurements from photos.

## Success means

- A collector with a short walkthrough completes one participant in 15 to 20 minutes (checked in the pilot).
- About 900 consented participants: roughly 360 adult women, 315 adult men, 225 children, with a
  wide spread of heights and sizes.
- Every complete record holds consent, tape measurements in cm, and two or three face-blurred photos.
- No unblurred face is ever stored or uploaded, and no name sits beside photos or measurements.
- Total running cost is zero.

## Principles, in priority order

1. Consent first.
2. Privacy and security built in from day one.
3. Never lose data (offline first).
4. Easy enough for a local tailor.
5. Free services only.
6. Accurate tape ground truth over volume.

## Future use the data is collected for (assumption, Ryan, 11 Nov 2026)

The dataset trains a model for a future app used by **tailors** and by **individuals who send their
measurements to a tailor**. That app's inputs are assumed to be:
- **photos** of the person: front and side (back optional). How users take them is up to them;
- **height** typed by the user; **or**, if they don't know it, a **plain A4 sheet** on the floor in
  the photos, giving the photo its scale;
- **weight**, optional, typed by the user.

So every record collected now holds what that app will receive (photos with an A4 sheet, the
person's **own stated** height and weight) **and** the truth (taped height, scale weight, tape
measurements). The model can then learn to work from either scale, and to cope with stated values
being off. This is an assumption: review it with whoever designs the model, and record changes in
DISCUSSION.md.

## Out of scope for now

App-store release (the app is shared only as a PWA link), payments, the model itself, any public
dataset release.
