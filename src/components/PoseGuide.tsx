/**
 * F6 pose outline drawn over the live camera (made in the app; posture only from Ryan's reference
 * image). Units: the frame is 1000 high; the head sits exactly where blur.ts's GUIDE_HEAD says
 * (centre 50% across, 9% down, 11% of the height), so the fixed face zone is always on the face.
 * Head to heel is about 88% of the height; the A4 sheet is marked at the feet.
 */
import { GUIDE_HEAD, type Pose } from '../lib/blur'

export interface PoseGuideProps {
  pose: Pose
  sex: 'female' | 'male' | null
  /** Frame width / height (from the camera), so the outline matches the photo exactly. */
  aspect: number
  level: boolean
}

const H = 1000
const HEAD = GUIDE_HEAD.size * H // 110
const HEAD_Y = GUIDE_HEAD.cy * H // 90

export function PoseGuide({ pose, sex, aspect, level }: PoseGuideProps) {
  const W = Math.round(H * aspect)
  const cx = W / 2
  const male = sex === 'male'
  const shoulder = male ? 0.98 * HEAD : 0.86 * HEAD
  const waist = male ? 0.66 * HEAD : 0.58 * HEAD
  const hip = male ? 0.8 * HEAD : 0.92 * HEAD
  const y = { chin: HEAD_Y + HEAD / 2, shoulder: 190, chest: 290, waist: 410, hip: 490, crotch: 520, knee: 700, ankle: 895, heel: 915 }
  const colour = level ? '#16a34a' : '#dc2626'
  const fill = 'rgba(255,255,255,0.18)'
  const limb = { stroke: colour, strokeWidth: 0.42 * HEAD, strokeLinecap: 'round' as const, opacity: 0.55, fill: 'none' }
  const line = { stroke: colour, strokeWidth: 6, fill }

  // A4 at the feet (21 × 29.7 cm; a person of ~1.7 m is ~880 units, so 29.7 cm ≈ 150 units).
  const a4 =
    pose === 'front'
      ? { x: cx - 75, y: 928, w: 150, h: 34 } // in front of the toes
      : { x: cx + 0.9 * HEAD, y: 880, w: 150, h: 34 } // beside the feet, long side towards the camera

  let body: React.ReactNode
  if (pose === 'side') {
    const depth = male ? 0.62 * HEAD : 0.66 * HEAD
    body = (
      <>
        <path
          d={`M ${cx - 0.2 * HEAD} ${y.chin} L ${cx - depth} ${y.chest} L ${cx - depth * 0.8} ${y.waist} L ${cx - depth} ${y.hip} L ${cx - 0.3 * HEAD} ${y.crotch + 20}
              L ${cx + 0.45 * HEAD} ${y.crotch + 20} L ${cx + depth * 1.05} ${y.hip} L ${cx + depth * 0.8} ${y.waist} L ${cx + depth * 0.95} ${y.chest} L ${cx + 0.3 * HEAD} ${y.chin} Z`}
          {...line}
        />
        {/* legs together */}
        <line x1={cx} y1={y.crotch} x2={cx} y2={y.ankle} {...limb} />
        {/* near arm straight forward at shoulder height (the person faces the screen's left) */}
        <line x1={cx} y1={y.shoulder + 10} x2={cx - 3.3 * HEAD} y2={y.shoulder + 10} {...limb} />
        <line x1={cx - 0.5 * HEAD} y1={y.heel} x2={cx + 0.5 * HEAD} y2={y.heel} stroke={colour} strokeWidth={8} />
      </>
    )
  } else {
    const arm = (side: 1 | -1) => {
      const sx = cx + side * shoulder
      const a = (38 * Math.PI) / 180 // arms 30–45° from the body
      const len = 3.2 * HEAD
      return <line x1={sx} y1={y.shoulder + 10} x2={sx + side * len * Math.sin(a)} y2={y.shoulder + 10 + len * Math.cos(a)} {...limb} />
    }
    const footX = 0.55 * HEAD // feet hip-width
    body = (
      <>
        <path
          d={`M ${cx - 0.3 * HEAD} ${y.chin} L ${cx - shoulder} ${y.shoulder} L ${cx - shoulder * 0.9} ${y.chest} L ${cx - waist} ${y.waist} L ${cx - hip} ${y.hip}
              L ${cx - hip * 0.8} ${y.crotch + 20} L ${cx + hip * 0.8} ${y.crotch + 20} L ${cx + hip} ${y.hip} L ${cx + waist} ${y.waist} L ${cx + shoulder * 0.9} ${y.chest} L ${cx + shoulder} ${y.shoulder} L ${cx + 0.3 * HEAD} ${y.chin} Z`}
          {...line}
        />
        <line x1={cx - hip * 0.45} y1={y.crotch} x2={cx - footX} y2={y.ankle} {...limb} />
        <line x1={cx + hip * 0.45} y1={y.crotch} x2={cx + footX} y2={y.ankle} {...limb} />
        {arm(-1)}
        {arm(1)}
        <line x1={cx - 1.4 * HEAD} y1={y.heel} x2={cx + 1.4 * HEAD} y2={y.heel} stroke={colour} strokeWidth={8} />
      </>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" data-testid={`guide-${pose}`}>
      {/* head line */}
      <line x1={cx - 1.4 * HEAD} y1={HEAD_Y - HEAD / 2} x2={cx + 1.4 * HEAD} y2={HEAD_Y - HEAD / 2} stroke={colour} strokeWidth={8} />
      <ellipse cx={cx} cy={HEAD_Y} rx={HEAD * 0.4} ry={HEAD / 2} {...line} />
      {body}
      <rect x={a4.x} y={a4.y} width={a4.w} height={a4.h} fill="rgba(255,255,255,0.5)" stroke={colour} strokeWidth={5} strokeDasharray="14 8" />
      <text x={a4.x + a4.w / 2} y={a4.y + a4.h + 30} textAnchor="middle" fontSize={26} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={1}>
        A4
      </text>
    </svg>
  )
}
