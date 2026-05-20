'use strict';

const REQUIRED_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'address', 'dob'];
const VERIFIED_FLAGS = ['emailVerified', 'phoneVerified'];
const TOTAL = REQUIRED_FIELDS.length + VERIFIED_FLAGS.length; // 8

/**
 * profileCompleteness - derives completeness from a user profile object.
 *
 * Inputs:
 *   profile {object} - raw user profile record (may be null or undefined)
 *
 * Returns:
 *   percent      {number}   - 0..100 integer, proportion of tracked fields present/true
 *   missingFields {string[]} - names of fields that are absent or false
 *
 * Tracked fields:
 *   String fields: firstName, lastName, email, phone, address, dob
 *   Boolean flags: emailVerified, phoneVerified (false or missing counts as absent)
 */
function profileCompleteness({ profile } = {}) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const missing = [];

  for (const field of REQUIRED_FIELDS) {
    const val = p[field];
    if (val === undefined || val === null || String(val).trim() === '') {
      missing.push(field);
    }
  }

  for (const flag of VERIFIED_FLAGS) {
    if (!p[flag]) {
      missing.push(flag);
    }
  }

  const present = TOTAL - missing.length;
  const percent = Math.floor((present / TOTAL) * 100);

  return { percent, missingFields: missing };
}

module.exports = { profileCompleteness };
