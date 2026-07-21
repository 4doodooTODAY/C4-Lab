// ── <Icon>. The standard icon wrapper for C4-Lab ────────────────────────────
// Standardizes on Lucide (line-art / outline) with a consistent stroke weight
// and named size presets, so icons look uniform everywhere going forward.
//
// Usage:
//   import Icon from '../components/ui/Icon'
//   import { Camera } from 'lucide-react'
//   <Icon icon={Camera} size="md" className="text-accent" />
//
// Existing direct Lucide usage keeps working. Adopt this wrapper in new code.

const SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
}

export default function Icon({ icon: LucideIcon, size = 'md', strokeWidth = 1.75, className = '', ...rest }) {
  if (!LucideIcon) return null
  const px = typeof size === 'number' ? size : (SIZES[size] || SIZES.md)
  return <LucideIcon size={px} strokeWidth={strokeWidth} className={className} {...rest} />
}
