'use strict';

/**
 * Unit tests for the pure TOTP/recovery-code helpers in ./totp.js.
 * No DDB, no HTTP. Verifies otplib + qrcode integration plus our recovery
 * code generation, hashing, and one-time-use lookup logic.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { authenticator } = require('otplib');

const totp = require('./totp');

describe('generateMfaSecret', () => {
  it('returns a non-empty base32 string', () => {
    const secret = totp.generateMfaSecret();
    assert.equal(typeof secret, 'string');
    assert.ok(secret.length >= 16, `secret too short: ${secret.length}`);
    // Base32 alphabet (RFC 4648, no padding).
    assert.match(secret, /^[A-Z2-7]+$/);
  });

  it('returns a different secret on each call', () => {
    const a = totp.generateMfaSecret();
    const b = totp.generateMfaSecret();
    assert.notEqual(a, b);
  });
});

describe('buildOtpauthUrl', () => {
  it('builds an otpauth:// URL with the username, secret, and issuer', () => {
    const url = totp.buildOtpauthUrl('alice', 'JBSWY3DPEHPK3PXP', 'SignalForce');
    assert.match(url, /^otpauth:\/\/totp\//);
    assert.match(url, /alice/);
    assert.match(url, /secret=JBSWY3DPEHPK3PXP/);
    assert.match(url, /issuer=SignalForce/);
  });
});

describe('generateQrCodePngBase64', () => {
  it('returns a base64 string that decodes to a PNG', async () => {
    const url = totp.buildOtpauthUrl('alice', 'JBSWY3DPEHPK3PXP');
    const b64 = await totp.generateQrCodePngBase64(url);
    assert.equal(typeof b64, 'string');
    assert.ok(b64.length > 100, 'QR PNG suspiciously short');
    // PNG magic bytes (first 8): 89 50 4E 47 0D 0A 1A 0A
    const png = Buffer.from(b64, 'base64');
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
    assert.equal(png[2], 0x4e);
    assert.equal(png[3], 0x47);
  });
});

describe('verifyTotpCode', () => {
  it('accepts the current code generated from the same secret', () => {
    const secret = totp.generateMfaSecret();
    const code = authenticator.generate(secret);
    assert.equal(totp.verifyTotpCode(code, secret), true);
  });

  it('rejects a wrong code', () => {
    const secret = totp.generateMfaSecret();
    assert.equal(totp.verifyTotpCode('000000', secret), false);
  });

  it('rejects empty / missing inputs without throwing', () => {
    const secret = totp.generateMfaSecret();
    assert.equal(totp.verifyTotpCode('', secret), false);
    assert.equal(totp.verifyTotpCode(null, secret), false);
    assert.equal(totp.verifyTotpCode('123456', null), false);
  });

  it('strips surrounding whitespace before validating', () => {
    const secret = totp.generateMfaSecret();
    const code = authenticator.generate(secret);
    assert.equal(totp.verifyTotpCode(`  ${code}  `, secret), true);
  });
});

describe('generateRecoveryCodes', () => {
  it('returns 10 codes by default, each 8 chars, all unique', () => {
    const codes = totp.generateRecoveryCodes();
    assert.equal(codes.length, 10);
    for (const c of codes) {
      assert.equal(c.length, 8);
      assert.match(c, /^[a-z0-9]+$/);
    }
    assert.equal(new Set(codes).size, codes.length, 'codes should be unique');
  });

  it('omits visually ambiguous characters (0, O, 1, l, I, i)', () => {
    const codes = totp.generateRecoveryCodes(50);
    for (const c of codes) {
      assert.doesNotMatch(c, /[01loi]/);
    }
  });
});

describe('hashRecoveryCode', () => {
  it('is deterministic for the same input', () => {
    assert.equal(totp.hashRecoveryCode('abcd1234'), totp.hashRecoveryCode('abcd1234'));
  });

  it('normalizes case, whitespace, and dashes', () => {
    const a = totp.hashRecoveryCode('AbCd 12-34');
    const b = totp.hashRecoveryCode('abcd1234');
    assert.equal(a, b);
  });

  it('produces different hashes for different inputs', () => {
    assert.notEqual(totp.hashRecoveryCode('abcd1234'), totp.hashRecoveryCode('abcd1235'));
  });
});

describe('findRecoveryCodeHash', () => {
  it('returns the matching hash when the input code is in the stored set', () => {
    const codes = totp.generateRecoveryCodes(3);
    const hashes = totp.hashRecoveryCodes(codes);
    const target = codes[1];
    const found = totp.findRecoveryCodeHash(target, hashes);
    assert.equal(found, hashes[1]);
  });

  it('returns null when the code is not present', () => {
    const codes = totp.generateRecoveryCodes(3);
    const hashes = totp.hashRecoveryCodes(codes);
    assert.equal(totp.findRecoveryCodeHash('not-in-set', hashes), null);
  });

  it('returns null on empty or missing storedHashes', () => {
    assert.equal(totp.findRecoveryCodeHash('anything', []), null);
    assert.equal(totp.findRecoveryCodeHash('anything', null), null);
    assert.equal(totp.findRecoveryCodeHash('anything', undefined), null);
  });

  it('matches case-insensitively after normalization', () => {
    const codes = ['abcd1234'];
    const hashes = totp.hashRecoveryCodes(codes);
    assert.ok(totp.findRecoveryCodeHash('ABCD1234', hashes));
    assert.ok(totp.findRecoveryCodeHash('AbCd-12 34', hashes));
  });
});
