'use strict';

/**
 * TOTP and MFA recovery-code helpers.
 *
 * All pure functions. No DDB, no HTTP. The route handlers in auth.js call
 * these to generate secrets, build otpauth URLs, render QR codes, validate
 * codes, and manage one-time recovery codes.
 */

const { createHash, randomBytes } = require('node:crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const ISSUER = process.env.MFA_ISSUER || 'SignalForce';
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 8;

/**
 * Generate a 32-character base32 TOTP secret using otplib's keyEncoder.
 * Length matches what most authenticator apps expect; longer secrets work
 * but produce noisier QR codes.
 */
function generateMfaSecret() {
  return authenticator.generateSecret();
}

/**
 * Build the standard otpauth:// URL that authenticator apps consume when
 * a user scans the QR code.
 */
function buildOtpauthUrl(username, secret, issuer = ISSUER) {
  return authenticator.keyuri(username, issuer, secret);
}

/**
 * Render an otpauth URL as a PNG QR code, returned as a base64 string
 * (no data: prefix). The caller wraps it in a data URI for an <img> tag.
 */
async function generateQrCodePngBase64(otpauthUrl) {
  const dataUrl = await QRCode.toDataURL(otpauthUrl, { type: 'image/png' });
  const match = dataUrl.match(/^data:image\/png;base64,(.*)$/);
  if (!match) throw new Error('QR code did not return a PNG data URL');
  return match[1];
}

/**
 * Validate a 6-digit TOTP code against the user's secret. otplib's check()
 * accepts a 1-step (30s) drift window by default, which handles minor clock
 * skew on the phone vs the server.
 */
function verifyTotpCode(code, secret) {
  if (!code || !secret) return false;
  try {
    return authenticator.check(String(code).trim(), secret);
  } catch {
    return false;
  }
}

/**
 * Generate N single-use recovery codes (default 10 codes of 8 chars each).
 * Codes use a-z + 0-9 minus visually ambiguous characters (0/O, 1/l/I) so
 * users can read them off paper without typos.
 */
function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0,O,1,l,I,i
  const out = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(RECOVERY_CODE_LENGTH);
    let code = '';
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += alphabet[bytes[j] % alphabet.length];
    }
    out.push(code);
  }
  return out;
}

/**
 * Hash a recovery code with SHA-256. We store only the hash in DDB so a
 * leaked profile row can't be used to drain the recovery code list.
 * Codes are compared case-insensitively after stripping whitespace and
 * dashes, so users can paste "ab cd-ef gh" and still hit a match.
 */
function hashRecoveryCode(code) {
  const normalized = String(code).toLowerCase().replace(/[\s-]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Hash a full set of recovery codes. Convenience wrapper used during
 * enrollment when we store the codes for the first time.
 */
function hashRecoveryCodes(codes) {
  return codes.map(hashRecoveryCode);
}

/**
 * Look up an input recovery code against the stored hashes. Returns the
 * matching hash so the caller can remove it from the user's row (single-use
 * enforcement). Returns null when no match.
 */
function findRecoveryCodeHash(inputCode, storedHashes) {
  if (!Array.isArray(storedHashes) || storedHashes.length === 0) return null;
  const target = hashRecoveryCode(inputCode);
  return storedHashes.includes(target) ? target : null;
}

module.exports = {
  generateMfaSecret,
  buildOtpauthUrl,
  generateQrCodePngBase64,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  hashRecoveryCodes,
  findRecoveryCodeHash,
  // Exposed for tests that want to override:
  _constants: { ISSUER, RECOVERY_CODE_COUNT, RECOVERY_CODE_LENGTH },
};
