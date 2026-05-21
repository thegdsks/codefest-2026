import React, { useEffect, useRef, useState } from 'react';
import type { Intervention, InterventionTheme } from '../types.js';

export interface HelpTooltipProps {
  intervention: Intervention;
  onDismiss: () => void;
  theme?: InterventionTheme;
}

interface Position {
  top: number;
  left: number;
}

const defaultTheme: Required<InterventionTheme> = {
  background: '#1f2937',
  text: '#f9fafb',
  border: 'transparent',
  buttonBackground: '#3b82f6',
  buttonText: '#ffffff',
};

export function HelpTooltip({ intervention, onDismiss, theme }: HelpTooltipProps): React.ReactElement | null {
  const t: Required<InterventionTheme> = { ...defaultTheme, ...(intervention.theme ?? {}), ...(theme ?? {}) };
  const [position, setPosition] = useState<Position | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selector = intervention.anchorSelector;
    if (!selector) {
      // Default to center of viewport if no anchor
      setPosition({ top: 80, left: window.innerWidth / 2 - 140 });
      return;
    }

    const anchor = document.querySelector(selector);
    if (!anchor) {
      setPosition({ top: 80, left: window.innerWidth / 2 - 140 });
      return;
    }

    const rect = anchor.getBoundingClientRect();
    setPosition({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX,
    });
  }, [intervention.anchorSelector]);

  if (position === null) return null;

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: position.top,
    left: position.left,
    zIndex: 9997,
    backgroundColor: t.background,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: '6px',
    padding: '10px 14px',
    maxWidth: '280px',
    fontSize: '13px',
    lineHeight: 1.5,
    fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
  };

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    top: '-6px',
    left: '12px',
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderBottom: `6px solid ${t.background}`,
  };

  const messageStyle: React.CSSProperties = {
    margin: '0 0 8px',
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const ctaStyle: React.CSSProperties = {
    backgroundColor: t.buttonBackground,
    color: t.buttonText,
    border: 'none',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const dismissStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: t.text,
    cursor: 'pointer',
    fontSize: '12px',
    opacity: 0.7,
    fontFamily: 'inherit',
  };

  return (
    <div ref={tooltipRef} style={tooltipStyle} role="tooltip">
      <div style={arrowStyle} />
      <p style={messageStyle}>{intervention.message}</p>
      <div style={actionsStyle}>
        {intervention.ctaUrl && intervention.ctaLabel && (
          <a href={intervention.ctaUrl} style={ctaStyle}>
            {intervention.ctaLabel}
          </a>
        )}
        <button style={dismissStyle} onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
