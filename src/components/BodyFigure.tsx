/**
 * Simple line drawing of where the tape goes (F5 decision 15). Drawn in the app: free, no copyright
 * issue, works offline. A plain front-view figure (female or male outline) with the measurement
 * highlighted in the brand colour.
 */
import type { Code, Sex } from '../lib/measurements'

type Shape =
  | { ring: [number, number, number, number] } // cx, cy, rx, ry: a tape around the body
  | { line: [number, number, number, number]; dashed?: boolean } // x1, y1, x2, y2: a length

const SHAPES: Record<Code, Shape> = {
  height: { line: [108, 8, 108, 232] },
  neck_girth: { ring: [60, 40, 8, 2.5] },
  shoulder_width: { line: [36, 50, 84, 50] },
  shoulder_length: { line: [53, 44, 37, 50] },
  bust_girth: { ring: [60, 70, 22, 4] },
  underbust_girth: { ring: [60, 80, 19, 3.5] },
  chest_girth: { ring: [60, 68, 23, 4] },
  bust_point_distance: { line: [51, 70, 69, 70] },
  shoulder_to_bust_point: { line: [54, 44, 51, 70] },
  front_length: { line: [55, 44, 55, 100] },
  back_length: { line: [60, 42, 60, 100], dashed: true },
  waist_girth: { ring: [60, 100, 16, 3] },
  high_hip_girth: { ring: [60, 110, 19, 3] },
  hip_girth: { ring: [60, 122, 22, 3.5] },
  waist_to_hip: { line: [77, 100, 82, 122] },
  arm_length: { line: [36, 50, 26, 128] },
  upper_arm_girth: { ring: [32, 72, 5.5, 2] },
  wrist_girth: { ring: [26, 128, 4, 1.5] },
  inseam: { line: [58, 136, 53, 225] },
  outseam: { line: [80, 100, 72, 225] },
  thigh_girth: { ring: [50, 146, 9, 2.5] },
  knee_girth: { ring: [50, 176, 7, 2] },
  calf_girth: { ring: [50, 198, 6, 2] },
  waist_to_knee: { line: [84, 100, 76, 176] },
  shoulder_to_knee: { line: [90, 50, 82, 176] },
}

const FEMALE =
  'M60 34 C52 34 50 40 52 44 L40 48 C34 50 33 56 32 64 L26 126 L30 128 L37 78 C40 88 44 94 46 100 ' +
  'C40 110 38 120 38 130 L44 226 L54 226 L58 140 L62 140 L66 226 L76 226 L82 130 C82 120 80 110 74 100 ' +
  'C76 94 80 88 83 78 L90 128 L94 126 L88 64 C87 56 86 50 80 48 L68 44 C70 40 68 34 60 34 Z'
const MALE =
  'M60 34 C52 34 50 40 52 44 L38 48 C32 50 31 56 30 64 L24 126 L28 128 L36 80 C38 90 42 96 44 100 ' +
  'C42 110 41 120 42 130 L46 226 L56 226 L58 140 L62 140 L64 226 L74 226 L78 130 C79 120 78 110 76 100 ' +
  'C78 96 82 90 84 80 L92 128 L96 126 L90 64 C89 56 88 50 82 48 L68 44 C70 40 68 34 60 34 Z'

export function BodyFigure({ code, sex, label }: { code: Code; sex: Sex; label: string }) {
  const s = SHAPES[code]
  return (
    <svg viewBox="0 0 120 240" role="img" aria-label={`Where to measure: ${label}`} className="mx-auto h-56 w-auto">
      <circle cx="60" cy="20" r="12" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      <path d={sex === 'female' ? FEMALE : MALE} fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
      {'ring' in s ? (
        <ellipse cx={s.ring[0]} cy={s.ring[1]} rx={s.ring[2]} ry={s.ring[3]} fill="none" stroke="#0f766e" strokeWidth="2.5" />
      ) : (
        <>
          <line
            x1={s.line[0]}
            y1={s.line[1]}
            x2={s.line[2]}
            y2={s.line[3]}
            stroke="#0f766e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={s.dashed ? '4 3' : undefined}
          />
          <circle cx={s.line[0]} cy={s.line[1]} r="2.2" fill="#0f766e" />
          <circle cx={s.line[2]} cy={s.line[3]} r="2.2" fill="#0f766e" />
        </>
      )}
    </svg>
  )
}
