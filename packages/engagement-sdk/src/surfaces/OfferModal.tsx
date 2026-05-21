import React from 'react';
import type { Intervention, InterventionTheme } from '../types.js';

export interface OfferModalProps {
  intervention: Intervention;
  onDismiss: () => void;
  theme?: InterventionTheme;
}

const defaultTheme: Required<InterventionTheme> = {
  background: '#ffffff',
  text: '#111827',
  border: '#e5e7eb',
  buttonBackground: '#1e40af',
  buttonText: '#ffffff',
};

export function OfferModal({ intervention, onDismiss, theme }: OfferModalProps): React.ReactElement {
  const t: Required<InterventionTheme> = { ...defaultTheme, ...(intervention.theme ?? {}), ...(theme ?? {}) };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 9998,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: t.background,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '480px',
    width: '100%',
    fontFamily: 'inherit',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };

  const headingStyle: React.CSSProperties = {
    margin: '0 0 12px',
    fontSize: '18px',
    fontWeight: 700,
    lineHeight: 1.3,
    paddingRight: '24px',
  };

  const bodyStyle: React.CSSProperties = {
    margin: '0 0 20px',
    fontSize: '14px',
    lineHeight: 1.6,
    color: t.text,
    opacity: 0.85,
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  };

  const primaryButtonStyle: React.CSSProperties = {
    backgroundColor: t.buttonBackground,
    color: t.buttonText,
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const closeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: 1,
    color: t.text,
    opacity: 0.5,
    fontFamily: 'inherit',
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Offer">
      <div style={modalStyle}>
        <button style={closeButtonStyle} onClick={onDismiss} aria-label="Close">
          &#x2715;
        </button>
        <h2 style={headingStyle}>{intervention.message}</h2>
        {intervention.metadata?.description && (
          <p style={bodyStyle}>{String(intervention.metadata.description)}</p>
        )}
        <div style={actionsStyle}>
          <button style={secondaryButtonStyle} onClick={onDismiss}>
            Not now
          </button>
          {intervention.ctaUrl && intervention.ctaLabel && (
            <a href={intervention.ctaUrl} style={primaryButtonStyle}>
              {intervention.ctaLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
