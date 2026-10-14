export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-grid place-items-center rounded-[28%] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 shadow-[0_0_24px_-6px_rgba(217,70,239,0.8)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none">
        <path d="M7 5.5v13l10-6.5-10-6.5Z" fill="white" />
        <path d="M19 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z" fill="white" />
      </svg>
    </span>
  );
}
