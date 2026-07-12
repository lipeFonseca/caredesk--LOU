export default function Avatar({
  name,
  src,
  size = 'md',
  className = '',
  imageClassName = '',
  fallbackClassName = '',
}) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md
  const initials = getInitials(name)

  if (src) {
    return (
      <img
        src={src}
        alt={name ? `Avatar de ${name}` : 'Avatar'}
        className={`${sizeClass} rounded-full object-cover ${imageClassName} ${className}`.trim()}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center bg-primary/10 text-primary font-semibold ${fallbackClassName} ${className}`.trim()}
      aria-label={name ? `Avatar de ${name}` : 'Avatar'}
    >
      <span>{initials}</span>
    </div>
  )
}

const SIZE_CLASSES = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
}

function getInitials(name) {
  const initials = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')

  return initials || 'A'
}
