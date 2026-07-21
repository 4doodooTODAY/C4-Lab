// C4C Lab brand assets. The real logo files (processed from the brand
// exports: badge cut to a transparent circle, mark isolated in white for
// dark grounds). Source files live in public/brand/.

export function LogoMark({ size = 32, className = '' }) {
  return (
    <img
      src="/brand/c4c-mark.png"
      width={size}
      height={size}
      alt="C4C Lab"
      className={className}
      draggable={false}
    />
  )
}

export default function LogoBadge({ size = 32, className = '' }) {
  return (
    <img
      src="/brand/c4c-badge.png"
      width={size}
      height={size}
      alt="C4C Lab"
      className={className}
      draggable={false}
    />
  )
}
