import { describe, it, expect } from 'vitest';
import { extractFirstImageSrc, looksLikeStylesheetText } from '../../../../../src/components/article-list/utils/article-preview-utils';

describe('article-preview-utils', () => {
  describe('extractFirstImageSrc', () => {
    it('extracts the src attribute of the first image tag', () => {
      const html = '<div><img src="https://example.com/image.png" alt="test" /></div>';
      expect(extractFirstImageSrc(html)).toBe('https://example.com/image.png');
    });

    it('returns null if no image is found', () => {
      const html = '<div><p>No image here</p></div>';
      expect(extractFirstImageSrc(html)).toBeNull();
    });
  });

  describe('looksLikeStylesheetText', () => {
    it('identifies css rules', () => {
      expect(looksLikeStylesheetText('.bh__table { border: 1px solid #C0C0C0; }')).toBe(true);
    });

    it('does not identify normal text', () => {
      expect(looksLikeStylesheetText('This is a normal sentence with a colon: right here.')).toBe(false);
    });
  });
});
