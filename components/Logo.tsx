interface Props {
  size?: number
}

export function Logo({ size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="var(--accent-blue)" />
      <path
        d="M9 12h6v2H9v-2zm0 4h14v2H9v-2zm0 4h10v2H9v-2z"
        fill="white"
      />
      <circle cx="22" cy="12" r="3" fill="var(--accent-orange)" />
    </svg>
  )
}
