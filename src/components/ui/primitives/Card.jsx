// ── Card primitive ────────────────────────────────────────────────────────────
// Padding presets keep spacing on the 4px token scale; elevation maps to the
// design-system shadow tokens.
//
//   <Card>...</Card>
//   <Card padding="lg" elevation={2}>...</Card>
//   <Card as="section" padding="none">...</Card>

const PADDING = {
  none: '',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-6',
}

const ELEVATION = {
  0: '',
  1: 'shadow-elevation-1',
  2: 'shadow-elevation-2',
  3: 'shadow-elevation-3',
}

export default function Card({
  as: Tag = 'div',
  padding = 'md',
  elevation = 1,
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      className={`bg-white rounded-xl border border-border
        ${ELEVATION[elevation] ?? ELEVATION[1]} ${PADDING[padding] ?? PADDING.md} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
