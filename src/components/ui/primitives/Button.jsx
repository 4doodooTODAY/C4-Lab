import { Loader2 } from 'lucide-react'

// ── Button primitive ──────────────────────────────────────────────────────────
// Variants: primary | secondary | ghost | danger
// Sizes:    sm | md | lg
// `loading` swaps in a spinner and disables the button.
//
//   <Button variant="primary" onClick={save}>Save</Button>
//   <Button variant="danger" size="sm" loading={deleting}>Delete</Button>

const VARIANTS = {
  primary:   'bg-accent hover:bg-accent-hover text-white',
  secondary: 'bg-surface border border-border hover:bg-surface-2 text-text-primary',
  ghost:     'text-text-secondary hover:text-text-primary hover:bg-surface-2',
  danger:    'bg-red-600 hover:bg-red-700 text-white',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium transition-colors duration-150
        disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]
        ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}
