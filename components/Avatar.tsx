interface Props {
  name: string
  avatarUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE: Record<string, string> = {
  xs: 'w-5  h-5  text-[8px]',
  sm: 'w-6  h-6  text-[9px]',
  md: 'w-9  h-9  text-xs',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl',
}

function initials(name: string) {
  return name.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

export default function Avatar({ name, avatarUrl, size = 'md', className = '' }: Props) {
  const cls = `${SIZE[size]} rounded-full shrink-0 object-cover bg-gray-100 ${className}`
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={cls + ' object-cover'} />
  }
  return (
    <div className={`${SIZE[size]} rounded-full bg-gray-100 flex items-center justify-center font-semibold text-gray-600 shrink-0 ${className}`}>
      {initials(name)}
    </div>
  )
}
