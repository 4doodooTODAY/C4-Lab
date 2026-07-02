// ── Layout primitives: Stack & Grid ──────────────────────────────────────────
// Mobile-first helpers on the 4px spacing token scale.
//
//   <Stack gap={4}>...</Stack>                    vertical rhythm
//   <Stack direction="row" gap={2} align="center">...</Stack>
//   <Grid cols={{ base: 1, sm: 2, lg: 3 }} gap={4}>...</Grid>

const GAPS = { 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 5: 'gap-6', 6: 'gap-8' }

const ALIGN   = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' }
const JUSTIFY = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' }

export function Stack({
  direction = 'col',
  gap = 4,
  align,
  justify,
  className = '',
  as: Tag = 'div',
  children,
  ...rest
}) {
  return (
    <Tag
      className={`flex ${direction === 'row' ? 'flex-row' : 'flex-col'}
        ${GAPS[gap] || GAPS[4]} ${align ? ALIGN[align] : ''} ${justify ? JUSTIFY[justify] : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// Static class maps so Tailwind's scanner sees every class it must generate.
const COLS      = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 6: 'grid-cols-6', 12: 'grid-cols-12' }
const COLS_SM   = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 6: 'sm:grid-cols-6', 12: 'sm:grid-cols-12' }
const COLS_MD   = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 6: 'md:grid-cols-6', 12: 'md:grid-cols-12' }
const COLS_LG   = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 6: 'lg:grid-cols-6', 12: 'lg:grid-cols-12' }

export function Grid({
  cols = { base: 1 },
  gap = 4,
  className = '',
  as: Tag = 'div',
  children,
  ...rest
}) {
  // Accept either a number (fixed) or { base, sm, md, lg } (responsive)
  const c = typeof cols === 'number' ? { base: cols } : cols
  return (
    <Tag
      className={`grid ${COLS[c.base] || COLS[1]}
        ${c.sm ? COLS_SM[c.sm] : ''} ${c.md ? COLS_MD[c.md] : ''} ${c.lg ? COLS_LG[c.lg] : ''}
        ${GAPS[gap] || GAPS[4]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
