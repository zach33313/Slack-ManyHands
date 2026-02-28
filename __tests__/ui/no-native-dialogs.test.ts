/**
 * __tests__/ui/no-native-dialogs.test.ts
 *
 * Static-analysis tests enforcing that native browser dialogs
 * (window.confirm, window.prompt, window.alert) are never called in source.
 * All confirmations and interactive inputs must use the Radix UI-backed
 * Dialog component from @/components/ui/dialog.
 *
 * Tests:
 *  1. Grep: no window.confirm/prompt/alert call sites in any .ts/.tsx source.
 *  2. CanvasEditor uses a custom Radix Dialog for URL input (not window.prompt).
 *  3. Confirmation dialogs have proper Cancel + Confirm button structure.
 *  4. Every file that renders a Dialog imports from @/components/ui/dialog.
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '../..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '__tests__',
  '.git',
  'dist',
  'coverage',
  '.worker-memory',
  'docs',
  'prisma',
  'public',
]);

// Recursively collect every .ts / .tsx file under dir, honouring SKIP_DIRS.
function walkSourceFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results.push(...walkSourceFiles(path.join(dir, entry.name)));
      }
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relPath), 'utf-8');
}

// Check every non-comment line in content against pattern.
// Returns line objects for violations.
// Lines starting with // or * (block comment continuation) are skipped,
// so text like "replaces window.prompt" inside comments is not flagged.
function findInNonCommentLines(
  content: string,
  pattern: RegExp
): Array<{ line: string; lineNumber: number }> {
  return content.split('\n').flatMap((line, i) => {
    const trimmed = line.trimStart();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('{/*')
    ) {
      return [];
    }
    return pattern.test(line) ? [{ line, lineNumber: i + 1 }] : [];
  });
}

// Collect all source files once — shared across all tests.
const ALL_SOURCE_FILES = walkSourceFiles(PROJECT_ROOT);

// ---------------------------------------------------------------------------
// Helper that asserts no source file contains an actual call site
// ---------------------------------------------------------------------------
function assertNoCallSite(pattern: RegExp, label: string): void {
  const violations: string[] = [];

  for (const filePath of ALL_SOURCE_FILES) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const hits = findInNonCommentLines(content, pattern);
    for (const { lineNumber } of hits) {
      violations.push(path.relative(PROJECT_ROOT, filePath) + ':' + lineNumber);
    }
  }

  if (violations.length > 0) {
    const list = violations.join('\n  - ');
    throw new Error(
      'Found ' + violations.length + ' call(s) to ' + label + ':\n  - ' + list +
      '\nReplace with a Radix UI <Dialog> from @/components/ui/dialog.'
    );
  }

  expect(violations).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// 1. No native browser dialog call sites
// ---------------------------------------------------------------------------

describe('No native browser dialog calls in source', () => {
  it('1a) no source file calls window.confirm()', () => {
    assertNoCallSite(/\bwindow\.confirm\s*\(/, 'window.confirm()');
  });

  it('1b) no source file calls window.prompt()', () => {
    assertNoCallSite(/\bwindow\.prompt\s*\(/, 'window.prompt()');
  });

  it('1c) no source file calls window.alert()', () => {
    assertNoCallSite(/\bwindow\.alert\s*\(/, 'window.alert()');
  });

  it('1d) no bare confirm() call — catches missing window. prefix', () => {
    // Allows "handleConfirm", "handleConfirmDelete" etc. by requiring
    // whitespace or punctuation before "confirm".
    assertNoCallSite(/(?:^|[=(,\s;])confirm\s*\(['"`]/, 'bare confirm()');
  });

  it('1e) no bare prompt() call — catches missing window. prefix', () => {
    assertNoCallSite(/(?:^|[=(,\s;])prompt\s*\(['"`]/, 'bare prompt()');
  });

  it('1f) no bare alert() call — catches missing window. prefix', () => {
    assertNoCallSite(/(?:^|[=(,\s;])alert\s*\(['"`]/, 'bare alert()');
  });
});

// ---------------------------------------------------------------------------
// 2. CanvasEditor — custom Dialog replaces window.prompt
// ---------------------------------------------------------------------------

describe('CanvasEditor — custom Dialog for URL input', () => {
  const FILE = 'canvas/components/CanvasEditor.tsx';
  let content: string;

  beforeAll(() => {
    content = readSource(FILE);
  });

  it('2a) imports Dialog components from @/components/ui/dialog', () => {
    expect(content).toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
  });

  it('2b) imports at minimum Dialog and DialogContent', () => {
    expect(content).toMatch(/\bDialog\b/);
    expect(content).toMatch(/\bDialogContent\b/);
  });

  it('2c) does NOT call window.prompt()', () => {
    const hits = findInNonCommentLines(content, /\bwindow\.prompt\s*\(/);
    expect(hits).toHaveLength(0);
  });

  it('2d) has linkDialogOpen state for dialog open/close control', () => {
    expect(content).toMatch(/linkDialogOpen/);
  });

  it('2e) renders a Dialog JSX element for the link input', () => {
    expect(content).toMatch(/<Dialog[\s>]/);
  });

  it('2f) dialog has a URL-type input field (type="url")', () => {
    expect(content).toMatch(/type="url"/);
  });

  it('2g) dialog footer has a Cancel button', () => {
    expect(content).toMatch(/Cancel/);
  });

  it('2h) dialog footer has an Apply or Remove Link confirm button', () => {
    expect(content).toMatch(/Apply|Remove Link/);
  });

  it('2i) dialog uses DialogContent wrapper', () => {
    expect(content).toMatch(/<DialogContent/);
  });

  it('2j) dialog has DialogHeader and DialogTitle', () => {
    expect(content).toMatch(/<DialogHeader/);
    expect(content).toMatch(/<DialogTitle/);
  });

  it('2k) dialog has a DialogFooter for button layout', () => {
    expect(content).toMatch(/<DialogFooter/);
  });
});

// ---------------------------------------------------------------------------
// 3. Confirmation dialogs — Cancel + Confirm button structure
// ---------------------------------------------------------------------------

describe('MessageActions — delete confirmation dialog', () => {
  const FILE = 'messages/components/MessageActions.tsx';
  let content: string;

  beforeAll(() => {
    content = readSource(FILE);
  });

  it('3a) imports Dialog from @/components/ui/dialog', () => {
    expect(content).toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
  });

  it('3b) manages deleteDialogOpen boolean state', () => {
    expect(content).toMatch(/deleteDialogOpen/);
  });

  it('3c) renders a Dialog element for delete confirmation', () => {
    expect(content).toMatch(/<Dialog[\s>]/);
  });

  it('3d) dialog has a Cancel button', () => {
    expect(content).toMatch(/Cancel/);
  });

  it('3e) dialog has a destructive Delete confirm button', () => {
    expect(content).toMatch(/\bDelete\b/);
  });

  it('3f) dialog uses DialogFooter to lay out buttons', () => {
    expect(content).toMatch(/<DialogFooter/);
  });

  it('3g) cancel handler closes the dialog (setDeleteDialogOpen false)', () => {
    expect(content).toMatch(/setDeleteDialogOpen\s*\(\s*false\s*\)/);
  });

  it('3h) confirm handler emits message:delete socket event', () => {
    expect(content).toMatch(/message:delete/);
    expect(content).toMatch(/socket\.emit/);
  });

  it('3i) does NOT call window.confirm()', () => {
    const hits = findInNonCommentLines(content, /\bwindow\.confirm\s*\(/);
    expect(hits).toHaveLength(0);
  });
});

describe('WorkspaceSettings — member removal confirmation dialog', () => {
  const FILE = 'workspaces/components/WorkspaceSettings.tsx';
  let content: string;

  beforeAll(() => {
    content = readSource(FILE);
  });

  it('3j) imports Dialog from @/components/ui/dialog', () => {
    expect(content).toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
  });

  it('3k) manages memberToRemove state to drive dialog open/close', () => {
    expect(content).toMatch(/memberToRemove/);
  });

  it('3l) renders a Dialog element for member removal confirmation', () => {
    expect(content).toMatch(/<Dialog[\s>]/);
  });

  it('3m) dialog has a Cancel button', () => {
    expect(content).toMatch(/Cancel/);
  });

  it('3n) dialog has a Remove confirm button', () => {
    expect(content).toMatch(/\bRemove\b/);
  });

  it('3o) does NOT call window.confirm()', () => {
    const hits = findInNonCommentLines(content, /\bwindow\.confirm\s*\(/);
    expect(hits).toHaveLength(0);
  });
});

describe('EditorToolbar — link insertion dialog', () => {
  const FILE = 'components/editor/EditorToolbar.tsx';
  let content: string;

  beforeAll(() => {
    content = readSource(FILE);
  });

  it('3p) imports Dialog from @/components/ui/dialog', () => {
    expect(content).toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
  });

  it('3q) manages linkDialogOpen boolean state', () => {
    expect(content).toMatch(/linkDialogOpen/);
  });

  it('3r) dialog has a Cancel button', () => {
    expect(content).toMatch(/Cancel/);
  });

  it('3s) dialog has an Insert or Apply confirm button', () => {
    expect(content).toMatch(/Insert|Apply/);
  });

  it('3t) does NOT call window.prompt()', () => {
    const hits = findInNonCommentLines(content, /\bwindow\.prompt\s*\(/);
    expect(hits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Every file that renders <Dialog …> imports from @/components/ui/dialog
// ---------------------------------------------------------------------------

describe('All Dialog usage imports from @/components/ui/dialog', () => {
  const PRIMITIVE_FILE = path.join(PROJECT_ROOT, 'components/ui/dialog.tsx');

  // Files that use the Dialog JSX element (not the primitive wrapper itself).
  const JSX_DIALOG_RE = /<Dialog[\s>]/;
  const CANONICAL_IMPORT_RE = /from\s+['"]@\/components\/ui\/dialog['"]/;

  let dialogFiles: string[] = [];

  beforeAll(() => {
    dialogFiles = ALL_SOURCE_FILES.filter((filePath) => {
      if (filePath === PRIMITIVE_FILE) return false;
      try {
        const src = fs.readFileSync(filePath, 'utf-8');
        return JSX_DIALOG_RE.test(src);
      } catch {
        return false;
      }
    });
  });

  it('4a) at least one component file uses a Dialog element (sanity check)', () => {
    expect(dialogFiles.length).toBeGreaterThan(0);
  });

  it('4b) every file that renders Dialog imports from @/components/ui/dialog', () => {
    const violations: string[] = [];

    for (const filePath of dialogFiles) {
      let src: string;
      try {
        src = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }
      if (!CANONICAL_IMPORT_RE.test(src)) {
        violations.push(path.relative(PROJECT_ROOT, filePath));
      }
    }

    if (violations.length > 0) {
      throw new Error(
        'Files using Dialog without importing from @/components/ui/dialog:\n  - ' +
          violations.join('\n  - ')
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('4c) known dialog-heavy files are in the discovered set', () => {
    const relPaths = dialogFiles.map((f) => path.relative(PROJECT_ROOT, f));
    const mustContain = [
      'canvas/components/CanvasEditor.tsx',
      'messages/components/MessageActions.tsx',
      'workspaces/components/WorkspaceSettings.tsx',
    ];
    for (const expected of mustContain) {
      expect(relPaths).toContain(expected);
    }
  });

  it('4d) the dialog primitive exports all expected named exports', () => {
    const dialogSource = readSource('components/ui/dialog.tsx');
    const expectedExports = [
      'Dialog',
      'DialogContent',
      'DialogHeader',
      'DialogFooter',
      'DialogTitle',
      'DialogDescription',
      'DialogClose',
      'DialogTrigger',
    ];
    for (const exportName of expectedExports) {
      expect(dialogSource).toMatch(new RegExp('\\b' + exportName + '\\b'));
    }
  });

  it('4e) the dialog primitive wraps @radix-ui/react-dialog', () => {
    const dialogSource = readSource('components/ui/dialog.tsx');
    expect(dialogSource).toMatch(/from\s+['"]@radix-ui\/react-dialog['"]/);
  });
});
