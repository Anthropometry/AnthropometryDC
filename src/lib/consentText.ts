/**
 * F4 consent wording. PRACTICE (test-phase) text only, drafted from the North Anchor (decided by Ryan, 7 Nov;
 * reworded by Ryan, 18 Nov):
 * the real version (v1) will be the IRB-approved text, added here word for word at Gate B.
 * English only until French and Twi are translated and checked.
 */
export interface ConsentText {
  version: string
  /** Read to an adult participant, or to a guardian (`forChild`). */
  body: (forChild: boolean) => string[]
  tickData: (forChild: boolean) => string
  tickPhotos: (forChild: boolean) => string
  /** F5: optional third tick for the more personal measurements. */
  tickIntimate: (forChild: boolean) => string
  /** F5 Amendment A: optional tick for weight. */
  tickWeight: (forChild: boolean) => string
  /** Read to the child, in simple words. */
  assent: string[]
}

const PRACTICE: ConsentText = {
  version: 'practice',
  body: (forChild) => {
    const you = forChild ? 'your child' : 'you'
    const your = forChild ? "your child's" : 'your'
    // Ryan's wording, 18 Nov 2026 (DISCUSSION.md): honest that test data may be used later, only if
    // the ethics committee allows it. Same version label ('practice'); the date tells old and new apart.
    return [
      'TEST OF THE COLLECTION TOOL. The tool is currently undergoing ethical review. We are testing this app before the real study starts.',
      'Anthro Collect is a student research project. We are building a computer model that estimates body measurements from photos. Later, it may be used in an app that tailors and their customers use to estimate clothing measurements from photos.',
      `If ${you} agree${forChild ? 's' : ''}, we will measure ${you} with a tape (for example height, chest, waist and hips) and take two or three photos of ${your} body: from the front, the side and, if ${you} agree${forChild ? 's' : ''}, the back.`,
      `${your[0].toUpperCase()}${your.slice(1)} whole head (face and hair) is blurred on this phone before any photo is saved. Nobody sees ${your} face in the data.`,
      forChild
        ? "Your child's name, your name and signature are kept only on this consent form, separate from the measurements and photos. Data collectors cannot read this form after it is signed."
        : 'Your name and signature are kept only on this consent form, separate from the measurements and photos. Data collectors cannot read this form after it is signed.',
      "If the data from this test is good enough, some of it may also be used in the research to build the model, but only if the ethics committee allows it. It will never be put in the app itself or shown to the app's users.",
      `Taking part is voluntary. ${forChild ? 'Your child' : 'You'} can stop at any time. You will get a receipt code. Give it to the project lead at any time, without giving a reason, to see ${your} data or to have it deleted or kept out of the research.`,
    ]
  },
  tickData: (forChild) =>
    forChild
      ? "I agree to my child's body measurements being recorded for this research."
      : 'I agree to my body measurements being recorded for this research.',
  tickPhotos: (forChild) =>
    forChild
      ? "I agree to photos of my child's body being taken. The face is blurred on the phone before saving."
      : 'I agree to photos of my body being taken. My face is blurred on the phone before saving.',
  tickIntimate: (forChild) =>
    forChild
      ? "Optional: I agree to the more personal measurements of my child (inseam; for girls 13 and over also bust, under-bust and bust point). I can say no to these and my child still takes part."
      : 'Optional: I agree to the more personal measurements (inseam; for women also bust, under-bust and bust point). I can say no to these and still take part.',
  tickWeight: (forChild) =>
    forChild
      ? "Optional: I agree to my child's weight being recorded (on a scale, or as I tell you)."
      : 'Optional: I agree to my weight being recorded (on a scale, or as I tell you).',
  assent: [
    'We would like to measure you with a tape and take some photos of your body. Your face will be hidden.',
    'It does not hurt. You can say no, and you can stop at any time. Nobody will be upset.',
    'Is it OK with you?',
  ],
}

const TEXTS: Record<string, ConsentText> = { practice: PRACTICE }

/** The text for a version, or null if this app doesn't have it (e.g. v1 before Gate B). */
export function consentText(version: string | null): ConsentText | null {
  return version ? (TEXTS[version] ?? null) : null
}
