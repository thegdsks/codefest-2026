interface SkeletonProps {
  className?: string;
  rows?: number;
}

const ROW_KEYS = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'];

export default function Skeleton({ className = 'h-4 w-full', rows = 1 }: SkeletonProps) {
  if (rows === 1) {
    return (
      <div
        className={`motion-safe:animate-pulse rounded bg-[color:var(--bg-elevated)] ${className}`}
      />
    );
  }
  const count = Math.min(Math.max(rows, 1), ROW_KEYS.length);
  return (
    <div className="space-y-2">
      {ROW_KEYS.slice(0, count).map((k) => (
        <div
          key={k}
          className={`motion-safe:animate-pulse rounded bg-[color:var(--bg-elevated)] ${className}`}
        />
      ))}
    </div>
  );
}
