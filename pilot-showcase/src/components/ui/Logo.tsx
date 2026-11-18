const ROUTE = "M6.5 26.5C13 26.5 12 20 17.5 20C22 20 22.5 17.6 22.5 15.5";

/**
 * Web reinterpretation of the Indooro logo: a route (S-curve with start ring) ending in a location pin.
 * Route is mint on dark / brand green on light; pin is logo red #E03830.
 */
export function LogoMark({ size = 32, onDark = true, className = "", title }: { size?: number; onDark?: boolean; className?: string; title?: string }) {
  const route = onDark ? "#63E6B4" : "#309048";
  const hole = onDark ? "#071117" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={ROUTE} stroke={route} strokeOpacity=".22" strokeWidth="6" strokeLinecap="round" />
      <path d={ROUTE} stroke={route} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="6.5" cy="26.5" r="3" fill={hole} stroke={route} strokeWidth="2" />
      <path d="M22.5 2C26.6 2 29.5 4.9 29.5 8.6c0 4.3-5.2 9.2-6.4 10.3a.9.9 0 0 1-1.2 0C20.7 17.8 15.5 12.9 15.5 8.6 15.5 4.9 18.4 2 22.5 2Z" fill="#E03830" />
      <circle cx="22.5" cy="8.6" r="2.4" fill={hole} />
    </svg>
  );
}

/** Mark + lowercase wordmark "indooro" (Inter semibold, tight). */
export function Logo({ onDark = true, size = 28, wordmark = true, className = "" }: { onDark?: boolean; size?: number; wordmark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} onDark={onDark} title={wordmark ? undefined : "Indooro"} />
      {wordmark ? (
        <span className={`font-semibold leading-none tracking-[-0.045em] ${onDark ? "text-white" : "text-text"}`} style={{ fontSize: size * 0.78 }}>
          indooro
        </span>
      ) : null}
    </span>
  );
}
