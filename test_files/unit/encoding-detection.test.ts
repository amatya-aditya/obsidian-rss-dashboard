import { describe, it, expect } from 'vitest';

// Mock TextDecoder since it might not be available in node environment used for tests
// or we want to test our logic without relying on the actual implementation

// Helper to look for charset in string (simplified version of what's in platform-utils)
function detectCharsetFromBody(text: string): string | null {
  const charsetMatch = text.match(/<meta[^>]+charset=["']?([^"' >]+)/i);
  if (charsetMatch) return charsetMatch[1];

  const equivMatch = text.match(
    /<meta[^>]+http-equiv=["']?Content-Type["']?[^>]+content=["']?[^"'>]+charset=([^"' >]+)/i,
  );
  if (equivMatch) return equivMatch[1];

  return null;
}

function detectCharsetFromHeader(contentType: string): string | null {
  const match = contentType.match(/charset=([^;]+)/i);
  return match ? match[1].trim() : null;
}

describe('Charset Detection Logic', () => {
  it('should detect charset from content-type header', () => {
    expect(detectCharsetFromHeader('text/html; charset=UTF-8')).toBe('UTF-8');
    expect(detectCharsetFromHeader('text/html; charset=iso-8859-1')).toBe('iso-8859-1');
    expect(detectCharsetFromHeader('text/html')).toBeNull();
  });

  it('should detect charset from meta tag in body', () => {
    const html1 = '<html><head><meta charset="utf-8"></head><body></body></html>';
    expect(detectCharsetFromBody(html1)).toBe('utf-8');

    const html2 = '<html><head><meta charset=\'windows-1251\'></head><body></body></html>';
    expect(detectCharsetFromBody(html2)).toBe('windows-1251');

    const html3 = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head><body></body></html>';
    expect(detectCharsetFromBody(html3)).toBe('ISO-8859-1');
  });

  it('should return null if no charset found in body', () => {
    const html = '<html><head><title>No charset</title></head><body></body></html>';
    expect(detectCharsetFromBody(html)).toBeNull();
  });
});
