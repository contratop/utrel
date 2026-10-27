const PALETTE = ['#5b8def', '#8b5cf6', '#2fa36b', '#e08b3c', '#d2534b', '#3aa6b9', '#b8559e', '#6b7f9e']

function colorFor(value) {
  let hash = 0
  const text = String(value || '?')
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000
  }
  return PALETTE[hash % PALETTE.length]
}

export default function Avatar({ user, size = 30, title }) {
  const label = (user?.name || user?.username || '?').trim()
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <span
      className="avatar"
      title={title || `@${user?.username || ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.42)),
        background: colorFor(user?.id || label),
      }}
    >
      {user?.avatar ? <img src={user.avatar} alt="" loading="lazy" /> : initials}
    </span>
  )
}
