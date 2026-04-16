import { describe, it, expect } from 'vitest';

/**
 * Unit tests for page navigation logic
 */

describe('Page Navigation', () => {
  describe('page bounds', () => {
    it('clamps current page to valid range', () => {
      const nPages = 10;
      const page = Math.max(0, Math.min(15, nPages - 1));
      expect(page).toBe(9);
    });

    it('handles page 0 correctly', () => {
      const nPages = 10;
      const page = Math.max(0, Math.min(0, nPages - 1));
      expect(page).toBe(0);
    });

    it('prevents negative page numbers', () => {
      const nPages = 10;
      const page = Math.max(0, Math.min(-5, nPages - 1));
      expect(page).toBe(0);
    });

    it('prevents page beyond document', () => {
      const nPages = 10;
      const page = Math.max(0, Math.min(100, nPages - 1));
      expect(page).toBe(9);
    });
  });

  describe('page navigation directions', () => {
    it('moves forward one page', () => {
      let currentPage = 5;
      const nPages = 20;
      currentPage = Math.min(currentPage + 1, nPages - 1);
      expect(currentPage).toBe(6);
    });

    it('moves backward one page', () => {
      let currentPage = 5;
      currentPage = Math.max(currentPage - 1, 0);
      expect(currentPage).toBe(4);
    });

    it('jumps to first page', () => {
      let currentPage = 5;
      currentPage = 0;
      expect(currentPage).toBe(0);
    });

    it('jumps to last page', () => {
      let currentPage = 5;
      const nPages = 20;
      currentPage = nPages - 1;
      expect(currentPage).toBe(19);
    });

    it('prevents going before first page', () => {
      let currentPage = 0;
      currentPage = Math.max(currentPage - 1, 0);
      expect(currentPage).toBe(0);
    });

    it('prevents going past last page', () => {
      let currentPage = 19;
      const nPages = 20;
      currentPage = Math.min(currentPage + 1, nPages - 1);
      expect(currentPage).toBe(19);
    });
  });

  describe('swipe threshold', () => {
    const THRESHOLD_PX = 40;

    it('commits page change when swipe exceeds threshold', () => {
      const dragX = -60;
      const committed = Math.abs(dragX) >= THRESHOLD_PX;
      expect(committed).toBe(true);
    });

    it('snaps back when swipe below threshold', () => {
      const dragX = -20;
      const committed = Math.abs(dragX) >= THRESHOLD_PX;
      expect(committed).toBe(false);
    });

    it('detects left swipe (next page)', () => {
      const dragX = -100;
      const direction = dragX < 0 ? 1 : -1; // next vs prev
      expect(direction).toBe(1);
    });

    it('detects right swipe (previous page)', () => {
      const dragX = 100;
      const direction = dragX < 0 ? 1 : -1;
      expect(direction).toBe(-1);
    });
  });

  describe('page label formatting', () => {
    it('formats single digit page numbers', () => {
      const currentPage = 0;
      const nPages = 10;
      const label = `Page ${currentPage + 1} / ${nPages}`;
      expect(label).toBe('Page 1 / 10');
    });

    it('formats double digit page numbers', () => {
      const currentPage = 9;
      const nPages = 20;
      const label = `Page ${currentPage + 1} / ${nPages}`;
      expect(label).toBe('Page 10 / 20');
    });

    it('formats large document page numbers', () => {
      const currentPage = 499;
      const nPages = 500;
      const label = `Page ${currentPage + 1} / ${nPages}`;
      expect(label).toBe('Page 500 / 500');
    });
  });

  describe('slider synchronization', () => {
    it('converts page number to slider value (0-1)', () => {
      const currentPage = 5;
      const nPages = 10;
      const sliderValue = nPages > 1 ? currentPage / (nPages - 1) : 0;
      expect(sliderValue).toBe(0.5);
    });

    it('converts slider value to page number', () => {
      const sliderValue = 0.5;
      const nPages = 10;
      const page = Math.round(sliderValue * (nPages - 1));
      expect(page).toBe(5);
    });

    it('handles single page document', () => {
      const currentPage = 0;
      const nPages = 1;
      const sliderValue = nPages > 1 ? currentPage / (nPages - 1) : 0;
      expect(sliderValue).toBe(0);
    });
  });
});
