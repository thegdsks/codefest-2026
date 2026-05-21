import React from 'react';
import type { Intervention, InterventionTheme } from '../types.js';

export interface NudgeBannerProps {
  intervention: Intervention;
  onDismiss: () => void;
  theme?: InterventionTheme;
}

const defaultTheme: Required<InterventionTheme> = {
  background: '#1e40af',
  text: '#ffffff',
  border: 'transparent',
  buttonBackground: '#ffffff',
  buttonText: '#1e40af',
};

export function NudgeBanner({ intervention, onDismiss, theme }: NudgeBannerProps): React.ReactElement {
  const t: Required<InterventionTheme> = { ...defaultTheme, ...(intervention.theme ?? {}), ...(theme ?? {}) };

  const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: t.background,
    color: t.text,
    border: `1px solid ${t.border}`,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    fontFamily: 'inherit',
    fontSize: '14px',
    lineHeight: '1.5',
  };

  const messageStyle: React.CSSProperties = {
    flex: 1,
    margin: 0,
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: t.buttonBackground,
    color: t.buttonText,
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const dismissStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: t.text,
    cursor: 'pointer',
    padding: '4px',
    fontSize: '18px',
    lineHeight: 1,
    opacity: 0.7,
    fontFamily: 'inherit',
  };

  return (
    <div style={bannerStyle} role="alert" aria-live="polite">
      <p style={messageStyle}>{intervention.message}</p>
      <div style={actionsStyle}>
        {intervention.ctaUrl && intervention.ctaLabel && (
          <a
            href={intervention.ctaUrl}
            style={buttonStyle}
          >
            {intervention.ctaLabel}
          </a>
        )}
        <button style={dismissStyle} onClick={onDismiss} aria-label="Dismiss">
          &#x2715;
        </button>
      </div>
    </div>
  );
}
