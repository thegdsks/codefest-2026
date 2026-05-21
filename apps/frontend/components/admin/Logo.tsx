interface LogoProps {
  size?: number;
}

export default function Logo({ size = 24 }: LogoProps) {
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
        <clipPath id="logo-box">
          <rect width="32" height="32" rx="6" />
        </clipPath>
      </defs>
      <rect width="32" height="32" rx="6" fill="#09090b" />
      <polygon
        points="0,22 32,14 32,17 0,25"
        fill="#818cf8"
        opacity="0.85"
        clipPath="url(#logo-box)"
      />
      <text
        x="16"
        y="20"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="15"
        fontWeight="800"
        fill="#ffffff"
        textAnchor="middle"
        letterSpacing="-0.5"
      >
        SF
      </text>
    </svg>
  );
}
