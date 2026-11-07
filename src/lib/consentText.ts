/**
 * F4 consent wording. PRACTICE text only, drafted from the North Anchor (decided by Ryan, 7 Nov):
 * the real version (v1) will be the IRB-approved text, added here word for word at Gate B.
 * English only until French and Twi are translated and checked.
 */
export interface ConsentText {
  version: string
  /** Read to an adult participant, or to a guardian (`forChild`). */
  body: (forChild: boolean) => string[]
  tickData: (forChild: boolean) => string
  tickPhotos: (forChild: boolean) => string
  /** Read to the child, in simple words. */
  assent: string[]
}

const PRACTICE: ConsentText = {
  version: 'practice',
  body: (forChild) => {
    const you = forChild ? 'your child' : 'you'
    const your = forChild ? "your child's" : 'your'
    return [
      'PRACTICE ONLY. This is a practice run; nothing here is used for research.',
      'Anthro Collect is a student research project at Ashesi University. We are collecting body measurements and photos to train a computer model that estimates body measurements from photos.',
      `If ${you} agree${forChild ? 's' : ''}, we will measure ${you} with a tape (for example height, chest, waist and hips) and take two or three photos of ${your} body: from the front, the side and, if ${you} agree${forChild ? 's' : ''}, the back.`,
      `${your[0].toUpperCase()}${your.slice(1)} face is blurred on this phone before any photo is saved. Nobody sees ${your} face in the data.`,
      `${your[0].toUpperCase()}${your.slice(1)} name and signature are kept only on this consent form, separate from the measurements and photos. Data collectors cannot read this form after it is signed.`,
      'Taking part is voluntary. You can stop at any time. You will get a receipt code: give it to the project lead to see or withdraw the data at any time, without giving a reason.',
      'The results may later help build an app that estimates clothing measurements from photos.',
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
  assent: [
    'We are students from Ashesi University.',
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
