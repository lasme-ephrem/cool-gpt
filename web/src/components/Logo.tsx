export function Orb({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="cg-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9e3ffd" />
          <stop offset="1" stopColor="#7a22d8" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#cg-mark)" />
      <path
        d="M32 15v34M15 32h34M20 20l24 24M44 20L20 44"
        stroke="#f8f0ff"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-1 select-none">
      <Orb size={30} />
      {!collapsed && (
        <span className="font-avenir font-extrabold text-[1.3rem] leading-none tracking-tight fg-app">
          cool-gpt
        </span>
      )}
    </div>
  );
}
