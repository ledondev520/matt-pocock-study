export type ArrowDirection = 'left' | 'right' | 'down' | 'up-right'

const paths: Record<ArrowDirection, string> = {
  left: 'M13 8H3m5-5L3 8l5 5',
  right: 'M3 8h10M8 3l5 5-5 5',
  down: 'M8 3v10m-5-5 5 5 5-5',
  'up-right': 'M4 12l8-8M4 4h8v8',
}
export const arrowDirections: Record<string, ArrowDirection> = { '←': 'left', '→': 'right', '↓': 'down', '↗': 'up-right' }

// Navigation arrows are decorative. Prose arrows retain their meaning in the accessible name.
export function Arrow({ dir, label }: { dir: ArrowDirection; label?: string }) {
  return <svg className="inline-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
    <path d={paths[dir]} />
  </svg>
}

export function ArrowText({ children }: { children: string }) {
  return children.split(/([←→↓↗])/).map((part, i) => arrowDirections[part] ? <Arrow key={i} dir={arrowDirections[part]} label={part} /> : part)
}

export function SvgArrowText({ children }: { children: string }) {
  return children.split(/([←→↓↗])/).map((part, i) => arrowDirections[part] ? <tspan key={i} fontFamily="system-ui, sans-serif">{part}</tspan> : part)
}
