/**
 * __tests__/api/link-preview.ssrf.test.ts
 *
 * Tests for the SSRF guard in link-previews/actions.ts: isSafeUrl()
 *
 * isSafeUrl() must block:
 *   - loopback addresses (localhost, 127.x.x.x, ::1)
 *   - private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)
 *   - link-local / cloud metadata IPs (169.254.169.254)
 *   - bare hostnames without a dot (intranet, db, redis)
 *   - non-http/https schemes (ftp, file, data)
 *   - hostnames that DNS-resolve to private IPs (rebinding protection)
 *
 * isSafeUrl() must allow:
 *   - well-formed https:// or http:// URLs whose hostnames resolve to public IPs
 */

// ---------------------------------------------------------------------------
// Mock node:dns BEFORE any imports — Jest hoists jest.mock() calls but we
// also need the mockLookup reference available to configure per-test.
// ---------------------------------------------------------------------------
const mockLookup = jest.fn();

jest.mock('node:dns', () => ({
  // CJS-compatible shape: `import dns from 'node:dns'` → dns.promises.lookup
  promises: {
    lookup: mockLookup,
  },
}));

// ---------------------------------------------------------------------------
// Mock prisma — imported at module level in actions.ts; not needed by
// isSafeUrl() but required so the module loads without a real DB connection.
// ---------------------------------------------------------------------------
jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    linkPreview: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock open-graph-scraper — dynamically imported in scrapeOG(); not used by
// isSafeUrl() but the module factory must be present so Jest doesn't error.
// ---------------------------------------------------------------------------
jest.mock('open-graph-scraper', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------
import { isSafeUrl } from '../../link-previews/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make dns.promises.lookup resolve with a single public IPv4 address. */
function mockDnsResolvePublic(address = '93.184.216.34') {
  mockLookup.mockResolvedValue([{ address, family: 4 }]);
}

/** Make dns.promises.lookup resolve with a private IPv4 address (DNS rebinding). */
function mockDnsResolvePrivate(address: string) {
  mockLookup.mockResolvedValue([{ address, family: 4 }]);
}

/** Make dns.promises.lookup reject (e.g. NXDOMAIN). */
function mockDnsFail() {
  mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('isSafeUrl() — SSRF guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Blocked: loopback hostnames
  // -------------------------------------------------------------------------

  it('blocks http://localhost/secret (localhost hostname)', async () => {
    const result = await isSafeUrl('http://localhost/secret');
    expect(result).toBe(false);
    // Blocked before DNS — no lookup should occur
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://127.0.0.1/admin (IPv4 loopback literal)', async () => {
    const result = await isSafeUrl('http://127.0.0.1/admin');
    expect(result).toBe(false);
    // IPv4 literals are checked without DNS
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://127.255.255.255/ (127.0.0.0/8 boundary)', async () => {
    const result = await isSafeUrl('http://127.255.255.255/');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Blocked: private IPv4 ranges
  // -------------------------------------------------------------------------

  it('blocks http://10.0.0.1/internal (RFC-1918 10.0.0.0/8)', async () => {
    const result = await isSafeUrl('http://10.0.0.1/internal');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://10.255.255.255/ (10.0.0.0/8 upper boundary)', async () => {
    const result = await isSafeUrl('http://10.255.255.255/');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://172.16.0.1/internal (RFC-1918 172.16.0.0/12 start)', async () => {
    const result = await isSafeUrl('http://172.16.0.1/internal');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://172.31.255.255/ (172.16.0.0/12 upper boundary)', async () => {
    const result = await isSafeUrl('http://172.31.255.255/');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://192.168.1.1/router (RFC-1918 192.168.0.0/16)', async () => {
    const result = await isSafeUrl('http://192.168.1.1/router');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://192.168.0.1/ (192.168.0.0/16 start)', async () => {
    const result = await isSafeUrl('http://192.168.0.1/');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Blocked: link-local / cloud metadata
  // -------------------------------------------------------------------------

  it('blocks http://169.254.169.254/latest/meta-data/ (AWS EC2 metadata endpoint)', async () => {
    const result = await isSafeUrl('http://169.254.169.254/latest/meta-data/');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://169.254.0.1/ (169.254.0.0/16 link-local start)', async () => {
    const result = await isSafeUrl('http://169.254.0.1/');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Blocked: IPv6 loopback
  // -------------------------------------------------------------------------

  it('blocks http://[::1]/secret (IPv6 loopback literal)', async () => {
    const result = await isSafeUrl('http://[::1]/secret');
    expect(result).toBe(false);
    // IPv6 literals are checked without DNS
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://[::1]:8080/ (IPv6 loopback with port)', async () => {
    const result = await isSafeUrl('http://[::1]:8080/');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Blocked: bare hostnames (no dot — internal service names)
  // -------------------------------------------------------------------------

  it('blocks http://intranet (bare hostname, no dot)', async () => {
    const result = await isSafeUrl('http://intranet');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://db/query (bare hostname "db")', async () => {
    const result = await isSafeUrl('http://db/query');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://redis:6379/ (bare hostname "redis" with port)', async () => {
    const result = await isSafeUrl('http://redis:6379/');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Blocked: non-http/https schemes
  // -------------------------------------------------------------------------

  it('blocks ftp://example.com (ftp scheme)', async () => {
    const result = await isSafeUrl('ftp://example.com');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks file:///etc/passwd (file scheme)', async () => {
    const result = await isSafeUrl('file:///etc/passwd');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks data:text/html,<script>alert(1)</script> (data URI)', async () => {
    const result = await isSafeUrl('data:text/html,<script>alert(1)</script>');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks javascript:alert(1) (javascript scheme)', async () => {
    const result = await isSafeUrl('javascript:alert(1)');
    expect(result).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Blocked: invalid / malformed URLs
  // -------------------------------------------------------------------------

  it('blocks empty string', async () => {
    const result = await isSafeUrl('');
    expect(result).toBe(false);
  });

  it('blocks non-URL string', async () => {
    const result = await isSafeUrl('not-a-url-at-all');
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Allowed: public HTTPS/HTTP URLs (DNS resolves to safe IPs)
  // -------------------------------------------------------------------------

  it('allows https://example.com (public hostname resolving to safe IP)', async () => {
    // DNS resolves to example.com's real IP — publicly routable
    mockDnsResolvePublic('93.184.216.34');

    const result = await isSafeUrl('https://example.com');

    expect(result).toBe(true);
    expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  it('allows http://example.com (http scheme is also permitted)', async () => {
    mockDnsResolvePublic('93.184.216.34');

    const result = await isSafeUrl('http://example.com');

    expect(result).toBe(true);
  });

  it('allows https://www.github.com/user/repo (subdomain + path)', async () => {
    mockDnsResolvePublic('140.82.121.4');

    const result = await isSafeUrl('https://www.github.com/user/repo');

    expect(result).toBe(true);
    expect(mockLookup).toHaveBeenCalledWith('www.github.com', { all: true });
  });

  it('allows https://example.com:443/ (explicit default port)', async () => {
    mockDnsResolvePublic('93.184.216.34');

    const result = await isSafeUrl('https://example.com:443/');

    expect(result).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Blocked: DNS rebinding — public hostname resolves to private IP
  // -------------------------------------------------------------------------

  it('blocks hostname that DNS-resolves to 10.x.x.x (DNS rebinding)', async () => {
    // Attacker-controlled DNS: attacker.com → 10.0.0.1
    mockDnsResolvePrivate('10.0.0.1');

    const result = await isSafeUrl('https://attacker.com');

    expect(result).toBe(false);
    expect(mockLookup).toHaveBeenCalledWith('attacker.com', { all: true });
  });

  it('blocks hostname that DNS-resolves to 127.0.0.1 (DNS rebinding to loopback)', async () => {
    mockDnsResolvePrivate('127.0.0.1');

    const result = await isSafeUrl('https://malicious.example.com');

    expect(result).toBe(false);
  });

  it('blocks hostname that DNS-resolves to 192.168.x.x (DNS rebinding)', async () => {
    mockDnsResolvePrivate('192.168.100.1');

    const result = await isSafeUrl('https://legit-looking.com');

    expect(result).toBe(false);
  });

  it('blocks hostname that DNS-resolves to 169.254.169.254 (DNS rebinding to metadata)', async () => {
    mockDnsResolvePrivate('169.254.169.254');

    const result = await isSafeUrl('https://metadata-steal.com');

    expect(result).toBe(false);
  });

  it('blocks when ANY resolved address is private (all: true check)', async () => {
    // Return both a public IP and a private IP — must fail because private is present
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 }, // public
      { address: '10.0.0.1', family: 4 },       // private
    ]);

    const result = await isSafeUrl('https://multi-answer.example.com');

    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Blocked: DNS resolution failure → treat as unsafe
  // -------------------------------------------------------------------------

  it('blocks hostname that fails DNS lookup (NXDOMAIN)', async () => {
    mockDnsFail();

    const result = await isSafeUrl('https://this-domain-does-not-exist.example');

    expect(result).toBe(false);
  });
});
