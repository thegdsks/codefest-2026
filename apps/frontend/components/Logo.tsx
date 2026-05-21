'use client';

import { useId } from 'react';

interface LogoProps {
  size?: number;
  tone?: 'dark' | 'light';
}

export default function Logo({ size = 24, tone = 'dark' }: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const clipId = `logo-clip-${uid}`;
  const isDark = tone === 'dark';
  const bg = isDark ? '#09090b' : 'transparent';
  const stroke = isDark ? '#27272a' : '#d6cfc1';
  const slice = isDark ? '#818cf8' : '#775a19';
  const text = isDark ? '#ffffff' : '#09090b';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-label="Signal Force"
      role="img"
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="32" height="32" rx="6" />
        </clipPath>
      </defs>
      <rect width="32" height="32" rx="6" fill={bg} stroke={stroke} strokeWidth={isDark ? 0 : 1} />
      <polygon
        points="0,22 32,14 32,17 0,25"
        fill={slice}
        opacity="0.85"
        clipPath={`url(#${clipId})`}
      />
      <text
        x="16"
        y="20"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="15"
        fontWeight="800"
        fill={text}
        textAnchor="middle"
        letterSpacing="-0.5"
      >
        SF
      </text>
    </svg>
  );
}
