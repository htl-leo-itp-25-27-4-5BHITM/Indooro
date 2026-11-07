export function Divider({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return <div role="separator" className={`h-px w-full ${onDark ? "bg-white/8" : "bg-line"} ${className}`} />;
}
