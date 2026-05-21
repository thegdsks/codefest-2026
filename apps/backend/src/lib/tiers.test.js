'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  TIER_THRESHOLDS,
  getCurrentTier,
  getNextTier,
  pointsToNextTier,
  tierProgress,
  getTierBenefits,
} = require('./tiers');

describe('tiers', () => {
  describe('TIER_THRESHOLDS', () => {
    it('has four tiers in ascending order', () => {
      assert.equal(TIER_THRESHOLDS.length, 4);
      const names = TIER_THRESHOLDS.map((t) => t.tier);
      assert.deepEqual(names, ['Silver', 'Gold', 'Platinum', 'Diamond']);
    });

    it('Diamond has null max', () => {
      const diamond = TIER_THRESHOLDS.find((t) => t.tier === 'Diamond');
      assert.equal(diamond.max, null);
    });
  });

  describe('getCurrentTier', () => {
    it('returns Silver for 0 points', () => assert.equal(getCurrentTier(0), 'Silver'));
    it('returns Silver for 24999 points', () => assert.equal(getCurrentTier(24999), 'Silver'));
    it('returns Gold for 25000 points', () => assert.equal(getCurrentTier(25000), 'Gold'));
    it('returns Gold for 42000 points', () => assert.equal(getCurrentTier(42000), 'Gold'));
    it('returns Gold for 49999 points', () => assert.equal(getCurrentTier(49999), 'Gold'));
    it('returns Platinum for 50000 points', () => assert.equal(getCurrentTier(50000), 'Platinum'));
    it('returns Diamond for 100000 points', () => assert.equal(getCurrentTier(100000), 'Diamond'));
    it('returns Diamond for very large balance', () =>
      assert.equal(getCurrentTier(999999), 'Diamond'));
    it('handles non-number gracefully', () => assert.equal(getCurrentTier(null), 'Silver'));
  });

  describe('getNextTier', () => {
    it('Silver next is Gold', () => assert.equal(getNextTier('Silver'), 'Gold'));
    it('Gold next is Platinum', () => assert.equal(getNextTier('Gold'), 'Platinum'));
    it('Platinum next is Diamond', () => assert.equal(getNextTier('Platinum'), 'Diamond'));
    it('Diamond has no next', () => assert.equal(getNextTier('Diamond'), null));
    it('unknown tier returns null', () => assert.equal(getNextTier('Unknown'), null));
  });

  describe('pointsToNextTier', () => {
    it('42000 pts (Gold) needs 8000 to reach Platinum', () => {
      assert.equal(pointsToNextTier(42000), 8000);
    });
    it('25000 pts (Gold boundary) needs 25000 to reach Platinum', () => {
      assert.equal(pointsToNextTier(25000), 25000);
    });
    it('49999 pts (Gold ceiling) needs 1 to reach Platinum', () => {
      assert.equal(pointsToNextTier(49999), 1);
    });
    it('Diamond returns 0', () => assert.equal(pointsToNextTier(150000), 0));
    it('0 pts returns 25000 (Silver to Gold)', () => assert.equal(pointsToNextTier(0), 25000));
  });

  describe('tierProgress', () => {
    it('returns 0 at Silver floor', () => assert.equal(tierProgress(0), 0));
    it('returns 1.0 at Diamond', () => assert.equal(tierProgress(100000), 1));
    it('returns value in [0,1] for Gold range', () => {
      const p = tierProgress(42000);
      assert.ok(p >= 0 && p <= 1);
    });
    it('42000 in Gold (25000-49999) is about 0.68', () => {
      const p = tierProgress(42000);
      // (42000-25000) / (49999-25000+1) = 17000/25000 = 0.68
      assert.ok(Math.abs(p - 0.68) < 0.01);
    });
  });

  describe('getTierBenefits', () => {
    it('returns array for Gold', () => {
      const b = getTierBenefits('Gold');
      assert.ok(Array.isArray(b) && b.length > 0);
    });
    it('returns empty array for unknown tier', () => {
      assert.deepEqual(getTierBenefits('Unknown'), []);
    });
  });
});
