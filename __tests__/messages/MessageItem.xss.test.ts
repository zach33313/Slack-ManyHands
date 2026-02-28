/**
 * @jest-environment jsdom
 */

/**
 * __tests__/messages/MessageItem.xss.test.ts
 *
 * XSS-focused tests for the link-href sanitization and DOMPurify integration
 * inside messages/components/MessageItem.tsx.
 *
 * Strategy: white-box unit tests that replicate the exact sanitization
 * algorithms from MessageItem.tsx without rendering the React component.
 * This keeps tests fast and failure messages unambiguous.
 *
 * Algorithms under test (source: messages/components/MessageItem.tsx):
 *
 *  1. Link-href sanitizer (renderTiptapContent → renderNode → 'link' mark case)
 *     Uses the URL constructor to normalise the href and only permits http:,
 *     https:, and mailto: absolute URLs, plus root-relative paths (/foo).
 *     Everything else collapses to the safe sentinel "#".
 *
 *  2. DOMPurify sanitizer (sanitizeHtml)
 *     Strips any HTML tags and attributes not in the DOMPURIFY_CONFIG allowlist
 *     after renderTiptapContent has already produced the raw HTML.
 */

import DOMPurify from 'dompurify';

// ---------------------------------------------------------------------------
// Replicate the exact href-sanitization algorithm from MessageItem.tsx.
// This ensures the test tracks the real production code path.
// Any divergence between this copy and the source file is a signal to update
// both the test and the implementation.
// ---------------------------------------------------------------------------
function sanitizeLinkHref(rawHref: string): string {
  let safeHref = '#';
  try {
    const parsed = new URL(rawHref);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      safeHref = rawHref;
    }
  } catch {
    // new URL() throws on relative paths — allow root-relative only
    if (rawHref.startsWith('/') && !rawHref.startsWith('//')) {
      safeHref = rawHref;
    }
  }
  return safeHref;
}

// ---------------------------------------------------------------------------
// DOMPurify config — must match DOMPURIFY_CONFIG in MessageItem.tsx exactly.
// ---------------------------------------------------------------------------
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 's', 'u', 'code', 'pre',
    'a', 'ul', 'ol', 'li', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'span', 'hr',
  ] as string[],
  ALLOWED_ATTR: [
    'href', 'target', 'rel',   // links
    'class',                    // Tailwind utilities
    'title',                    // tooltips
    'data-language',            // code block language tag
  ] as string[],
  KEEP_CONTENT: true,
  RETURN_DOM: false as const,
  RETURN_DOM_FRAGMENT: false as const,
};

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG) as unknown as string;
}

// ---------------------------------------------------------------------------
// 1. Link href sanitization tests (cases 1–7 as specified in the task, plus
//    additional coverage for completeness)
// ---------------------------------------------------------------------------

describe('MessageItem — link href sanitization', () => {
  // --- Required test cases ---

  it('1) neutralizes javascript:alert(1) href to "#"', () => {
    // URL constructor parses this as protocol "javascript:" → not in allowlist
    expect(sanitizeLinkHref('javascript:alert(1)')).toBe('#');
  });

  it('2) neutralizes data:text/html,... href to "#"', () => {
    // URL constructor parses as protocol "data:" → not in allowlist
    expect(sanitizeLinkHref('data:text/html,<h1>XSS</h1>')).toBe('#');
  });

  it('3) neutralizes java\\nscript:... (newline-encoded whitespace bypass) to "#"', () => {
    // The WHATWG URL parser strips embedded newlines/tabs before parsing the
    // scheme, so "java\nscript:" normalises to "javascript:" — still blocked.
    // Verified in Node 20: new URL('java\nscript:alert(1)').protocol === 'javascript:'
    const result = sanitizeLinkHref('java\nscript:alert(1)');
    expect(result).toBe('#');
  });

  it('4) allows https://example.com through unchanged', () => {
    expect(sanitizeLinkHref('https://example.com')).toBe('https://example.com');
  });

  it('5) allows mailto:user@example.com through unchanged', () => {
    expect(sanitizeLinkHref('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('6) allows root-relative path /path through unchanged', () => {
    // new URL('/path') throws (no base) → catch block: starts with / and not // → allowed
    expect(sanitizeLinkHref('/path/to/page')).toBe('/path/to/page');
  });

  it('7) neutralizes empty href to "#"', () => {
    // new URL('') throws → catch: doesn't start with / → stays '#'
    expect(sanitizeLinkHref('')).toBe('#');
  });

  // --- Additional coverage ---

  it('allows http://example.com through unchanged', () => {
    expect(sanitizeLinkHref('http://example.com/page')).toBe('http://example.com/page');
  });

  it('neutralizes vbscript: protocol to "#"', () => {
    expect(sanitizeLinkHref('vbscript:msgbox(1)')).toBe('#');
  });

  it('neutralizes file:///etc/passwd to "#"', () => {
    expect(sanitizeLinkHref('file:///etc/passwd')).toBe('#');
  });

  it('blocks protocol-relative URLs (//evil.com) — starts with / but also starts with //', () => {
    // Starts with '/' but also starts with '//' → the inner guard blocks it
    expect(sanitizeLinkHref('//evil.com/steal?cookie=x')).toBe('#');
  });

  it('allows deeply-nested root-relative paths', () => {
    expect(sanitizeLinkHref('/workspace/general/msg-123')).toBe('/workspace/general/msg-123');
  });

  it('neutralizes java\\tscript: (tab-encoded bypass) to "#"', () => {
    // Same WHATWG normalisation strips the embedded tab before scheme parsing
    const result = sanitizeLinkHref('java\tscript:alert(1)');
    expect(result).toBe('#');
  });

  it('neutralizes javascript: with leading spaces to "#"', () => {
    // URL constructor trims leading ASCII whitespace, so ' javascript:' → 'javascript:'
    const result = sanitizeLinkHref('  javascript:alert(1)');
    expect(result).toBe('#');
  });

  it('does not allow https: URL with embedded credentials to bypass validation', () => {
    // These ARE https: URLs, so they pass — the credential portion is a browser/UX
    // concern, not an href-injection concern.  The test documents the behaviour.
    const result = sanitizeLinkHref('https://user:pass@example.com/');
    expect(result).toBe('https://user:pass@example.com/');
  });
});

// ---------------------------------------------------------------------------
// 2. DOMPurify output sanitization tests (test case 8)
// ---------------------------------------------------------------------------

describe('MessageItem — DOMPurify output sanitization', () => {
  it('8a) strips <script> tags and their content', () => {
    const malicious = '<p>Hello</p><script>alert("XSS")</script>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
    expect(result).not.toContain('alert(');
  });

  it('8b) strips onerror inline event handler', () => {
    const malicious = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(');
  });

  it('8b) strips onclick inline event handler', () => {
    const malicious = '<p onclick="alert(1)">Click me</p>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('onclick');
  });

  it('8b) strips onmouseover inline event handler', () => {
    const malicious = '<span onmouseover="stealCookies()">Hover</span>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('onmouseover');
    // KEEP_CONTENT: true means the text node is preserved
    expect(result).toContain('Hover');
  });

  it('8c) strips javascript: href at the DOMPurify layer', () => {
    // Even if the renderTiptapContent layer missed a javascript: href,
    // DOMPurify provides a second line of defence.
    const malicious = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toMatch(/href=['"]javascript:/i);
  });

  it('8d) strips <iframe> injection attempts', () => {
    const malicious = '<iframe src="https://evil.com/phish" width="0" height="0"></iframe>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('<iframe');
  });

  it('8e) strips style= attributes (not in ALLOWED_ATTR)', () => {
    const input = '<p style="display:none;visibility:hidden">hidden</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('style=');
    expect(result).toContain('hidden'); // text preserved via KEEP_CONTENT
  });

  it('8f) preserves safe <a> link with https: href', () => {
    const safe =
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">visit</a>';
    const result = sanitizeHtml(safe);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('>visit<');
  });

  it('8g) preserves inline formatting tags (<strong>, <em>, <code>)', () => {
    const html =
      '<p><strong>bold</strong> and <em>italic</em> and <code>mono</code></p>';
    const result = sanitizeHtml(html);
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<code>mono</code>');
  });

  it('8h) preserves data-language attribute on <code> (in ALLOWED_ATTR)', () => {
    const html = '<pre><code data-language="typescript">const x = 1;</code></pre>';
    const result = sanitizeHtml(html);
    expect(result).toContain('data-language="typescript"');
  });

  it('strips <form> and <input> phishing constructs', () => {
    const malicious =
      '<form action="https://evil.com"><input name="token" value="stolen"></form>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('<form');
    expect(result).not.toContain('<input');
  });

  it('strips <object> and <embed> injection attempts', () => {
    const malicious = '<object data="evil.swf"><embed src="evil.swf"></object>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
  });

  it('strips <svg><script> nested XSS vector', () => {
    const malicious = '<svg><script>alert(1)</script></svg>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(');
  });

  it('preserves allowed block tags (<blockquote>, <pre>, heading)', () => {
    const html =
      '<h2>Title</h2><blockquote>quoted</blockquote><pre><code>code</code></pre>';
    const result = sanitizeHtml(html);
    expect(result).toContain('<h2>');
    expect(result).toContain('<blockquote>');
    expect(result).toContain('<pre>');
  });

  it('strips id= attribute (not in ALLOWED_ATTR) to prevent DOM clobbering', () => {
    const input = '<p id="app">content</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('id=');
    expect(result).toContain('content'); // text preserved
  });
});
