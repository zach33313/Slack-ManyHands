# Tiptap Extensions for Slack-like Message Composer

> **RECOMMENDATION**: Use Tiptap v3 with StarterKit (selectively disabled) + extension-mention + extension-emoji + extension-code-block-lowlight + custom slash commands via @tiptap/suggestion + @tiptap/static-renderer for read-only rendering.

---

## Target Tiptap Version

Use **Tiptap v3** (`@tiptap/core` ^3.20.0). v3 is stable as of late 2024 and drops tippy.js in favor of `@floating-ui/dom`. All guidance below targets v3.

---

## INSTALLATION

```bash
npm install \
  @tiptap/starter-kit \
  @tiptap/extension-mention \
  @tiptap/suggestion \
  @tiptap/extension-emoji \
  @tiptap/extension-code-block-lowlight \
  lowlight \
  @floating-ui/dom \
  @tiptap/static-renderer \
  emoji-mart \
  @emoji-mart/data \
  @emoji-mart/react
```

---

## 1. StarterKit vs Individual Extensions

### RECOMMENDATION: Use StarterKit, but disable what Slack doesn't need

**What StarterKit v3 includes:**

| Category | Extensions |
|---|---|
| Nodes | Blockquote, BulletList, CodeBlock, Document, HardBreak, Heading, HorizontalRule, ListItem, OrderedList, Paragraph, Text |
| Marks | Bold, Code, Italic, Strike, Link (new v3), Underline (new v3) |
| Functionality | Dropcursor, Gapcursor, UndoRedo (renamed from History in v3), ListKeymap (new v3), TrailingNode (new v3) |

**For a Slack-like composer, disable:**
- `heading` — Slack doesn't have H1/H2/H3
- `blockquote` — not needed for simple messages
- `horizontalRule` — not needed
- `codeBlock` — replace with `CodeBlockLowlight`
- `link` — re-add separately if custom config needed

### USAGE EXAMPLE

```javascript
import StarterKit from '@tiptap/starter-kit'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'

const lowlight = createLowlight(common)

const editor = new Editor({
  extensions: [
    StarterKit.configure({
      // Disable extensions replaced by better alternatives
      codeBlock: false,           // Using CodeBlockLowlight instead
      // Disable extensions not needed for Slack-like chat
      heading: false,
      blockquote: false,
      horizontalRule: false,
      // Keep: bold, italic, strike, code, link, underline, bulletList, orderedList, undoRedo
    }),
    CodeBlockLowlight.configure({ lowlight }),
  ],
})
```

**v3 Breaking Change**: `history: false` is now `undoRedo: false` — required if using Tiptap Collaboration.

### ALTERNATIVES CONSIDERED

- **All individual extensions**: More granular bundle control, but requires importing 10+ packages. Only worth it for very size-sensitive builds.
- **v2 StarterKit**: Does not include Link/Underline by default; do not mix v2 and v3 packages.

---

## 2. @user Mention Autocomplete

### RECOMMENDATION: Use `@tiptap/extension-mention` with `@floating-ui/dom` (v3)

**v3 Breaking Change**: `tippy.js` was removed. All popups now use `@floating-ui/dom`.

**Known issue**: [GitHub #6350](https://github.com/ueberdosis/tiptap/issues/6350) — floating-ui mention example doesn't clean up React renderer div on close. Add cleanup logic in `onExit`.

### USAGE EXAMPLE

```javascript
import { Mention } from '@tiptap/extension-mention'
import { PluginKey } from '@tiptap/pm/state'
import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/dom'

const MentionExtension = Mention.configure({
  HTMLAttributes: {
    class: 'mention',
  },

  renderText({ options, node }) {
    return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`
  },

  renderHTML({ options, node }) {
    return [
      'a',
      {
        ...options.HTMLAttributes,
        href: `/users/${node.attrs.id}`,
        'data-user-id': node.attrs.id,
      },
      `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`,
    ]
  },

  deleteTriggerWithBackspace: false,

  suggestion: {
    char: '@',
    allowSpaces: false,
    startOfLine: false,

    // Async items — replace with your API call
    items: async ({ query }) => {
      return [
        { id: 'user-1', label: 'Alice', avatar: '/avatars/alice.png' },
        { id: 'user-2', label: 'Bob', avatar: '/avatars/bob.png' },
      ].filter(u =>
        u.label.toLowerCase().startsWith(query.toLowerCase())
      )
      // Production: return await fetch(`/api/users?q=${query}`).then(r => r.json())
    },

    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: 'mention', attrs: props },
          { type: 'text', text: ' ' },
        ])
        .run()
    },

    render: () => {
      let popup
      let cleanup

      return {
        onStart: (props) => {
          popup = document.createElement('div')
          popup.className = 'mention-dropdown'
          document.body.appendChild(popup)

          // Use floating-ui for positioning
          const referenceEl = {
            getBoundingClientRect: props.clientRect,
          }
          cleanup = autoUpdate(referenceEl, popup, () => {
            computePosition(referenceEl, popup, {
              placement: 'bottom-start',
              middleware: [offset(6), flip(), shift()],
            }).then(({ x, y }) => {
              Object.assign(popup.style, {
                left: `${x}px`,
                top: `${y}px`,
                position: 'absolute',
              })
            })
          })

          // Render your React dropdown into popup div here
          // ReactDOM.createRoot(popup).render(<MentionDropdown {...props} />)
        },

        onUpdate: (props) => {
          // Update dropdown items with new props
        },

        onKeyDown: ({ event }) => {
          if (event.key === 'Escape') {
            popup?.remove()
            cleanup?.()
            return true
          }
          // Forward arrow keys to dropdown component
          return false
        },

        onExit: () => {
          cleanup?.()
          popup?.remove() // Critical: fix for #6350 memory leak
        },
      }
    },
  },
})
```

### Multiple Trigger Types (@users, #channels)

```javascript
// Add separate Mention instances with different pluginKeys
const UserMention = Mention.configure({
  suggestion: {
    char: '@',
    pluginKey: new PluginKey('mention-users'),
    items: ({ query }) => fetchUsers(query),
    // ... render, command
  },
})

const ChannelMention = Mention.configure({
  suggestion: {
    char: '#',
    pluginKey: new PluginKey('mention-channels'),
    items: ({ query }) => fetchChannels(query),
    // ... render, command
  },
})
```

### INTEGRATION NOTES

- Store mentions as `{ id, label }` in Tiptap JSON — query by `id` when rendering
- Style the `.mention` class with a blue/purple pill background to match Slack
- The `items` function supports async — safe to debounce API calls

---

## 3. Emoji Insertion

### RECOMMENDATION: Use both — `@tiptap/extension-emoji` for `:shortcode:` trigger + `emoji-mart` for toolbar picker button

### Option A: @tiptap/extension-emoji (Official)

- **Weekly downloads**: ~102,642
- **Version**: 3.18.0
- **License**: MIT (free)
- **GitHub**: Part of Tiptap monorepo

```javascript
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji'

Emoji.configure({
  emojis: gitHubEmojis,       // Includes GitHub custom emojis like :octocat:
  enableEmoticons: true,       // Convert :) to 😊 automatically
  HTMLAttributes: { class: 'emoji' },
})
```

**What it does**: Converts `:shortcode:` text to inline ProseMirror nodes. The `:` char triggers an autocomplete dropdown (built on Suggestion). On copy-out, converts back to Unicode.

**Custom/org emojis:**
```javascript
import { emojis } from '@tiptap/extension-emoji'

Emoji.configure({
  emojis: [
    ...emojis,
    {
      name: 'company-logo',
      shortcodes: ['company', 'logo'],
      tags: ['brand'],
      group: 'Custom',
      fallbackImage: 'https://cdn.example.com/logo.png',
    },
  ],
})
```

### Option B: emoji-mart (Picker button)

- **GitHub stars**: ~15,000 (missive/emoji-mart)
- **Version**: v5.6.0
- **Bundle**: 84 KB gzipped (data lazy-loadable separately)

```jsx
import { Picker } from '@emoji-mart/react'
import data from '@emoji-mart/data'

function EmojiPickerButton({ editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (emoji) => {
    editor.chain().focus().insertContent(emoji.native).run()
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} aria-label="Insert emoji">
        😊
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: '100%', zIndex: 100 }}>
          <Picker
            data={data}
            onEmojiSelect={handleSelect}
            theme="auto"
            previewPosition="none"
            skinTonePosition="none"
          />
        </div>
      )}
    </div>
  )
}
```

**Lazy-load data** to reduce initial bundle:
```javascript
const data = fetch('https://cdn.jsdelivr.net/npm/@emoji-mart/data')
  .then(r => r.json())
// Pass as: <Picker data={data} ... />
```

### Comparison

| Criterion | @tiptap/extension-emoji | emoji-mart |
|---|---|---|
| `:shortcode:` typing trigger | Built-in | Manual Suggestion setup |
| Browse/search picker UI | Basic | Excellent (categories, search, skin tones) |
| Custom/org emojis | Yes (fallback images) | Yes (custom categories) |
| Bundle (data) | Bundled (~200KB) | Lazy-loadable (84KB gzipped) |
| GitHub stars | Monorepo | ~15k |
| Maintenance | Official Tiptap | Active (v5) |

**Use both**: `@tiptap/extension-emoji` for `:` shortcode autocomplete while typing + `emoji-mart` in the toolbar for browse-by-category picking.

---

## 4. Code Block Syntax Highlighting

### RECOMMENDATION: Use `@tiptap/extension-code-block-lowlight` for the editor; optionally `tiptap-extension-code-block-shiki` if you need dark mode with inline styles

### Option A: CodeBlockLowlight (Official) — RECOMMENDED

```bash
npm install @tiptap/extension-code-block-lowlight lowlight
```

```javascript
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import 'highlight.js/styles/github-dark.css' // or atom-one-dark, vs2015, monokai

// common: JS, TS, Python, CSS, HTML, JSON, Bash, SQL, Markdown (~20 languages)
const lowlight = createLowlight(common)

// Register additional languages on demand:
// import typescript from 'highlight.js/lib/languages/typescript'
// lowlight.register({ typescript })

StarterKit.configure({ codeBlock: false }) // IMPORTANT: disable plain CodeBlock

CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: 'javascript',
  enableTabIndentation: true,
  tabSize: 2,
  HTMLAttributes: { class: 'hljs code-block' },
})
```

**Pros**: Official package, ~190 languages (highlight.js grammars), battle-tested CSS themes, small bundle with `common` preset.
**Cons**: Requires importing an external CSS file for theme.

### Option B: tiptap-extension-code-block-shiki (Third-party)

```bash
npm install shiki tiptap-extension-code-block-shiki
```

- **GitHub stars**: 66 (released October 2025)
- **Styling**: Inline styles — no external CSS needed
- **Theme engine**: Same as VS Code (TextMate grammars)

```typescript
import CodeBlockShiki from 'tiptap-extension-code-block-shiki'

CodeBlockShiki.configure({
  defaultTheme: 'tokyo-night',
  // Or separate light/dark themes:
  themes: {
    light: 'github-light',
    dark: 'github-dark',
  },
  defaultLanguage: 'typescript',
})
```

**Pros**: No CSS file, inline styles work anywhere, VS Code-quality themes (tokyo-night, dracula, nord), light/dark mode support built-in.
**Cons**: Third-party (only 66 stars), async language loading causes brief flash on first render, heavier than lowlight for basic use.

### Option C: CodeBlockPrism (Third-party)

```bash
npm install tiptap-extension-code-block-prism prismjs
```

Uses `refractor` (Prism-compatible). Marginally more language coverage than lowlight for niche grammars (JSX, TSX, GraphQL, Liquid). Low GitHub stars. Not recommended unless you specifically need Prism.

### Option D: Plain CodeBlock (No Highlighting)

Use the built-in `CodeBlock` from StarterKit for the **composer** (users don't need live highlighting while typing). Apply highlighting only at **render time** via `generateHTML` or `renderToHTMLString`. This is the Slack approach — no syntax highlighting in the input box.

### Syntax Highlighter Comparison

| Option | Maintainer | Stars | Styling | Languages | Async | Themes |
|---|---|---|---|---|---|---|
| CodeBlockLowlight | Official Tiptap | Monorepo | External CSS | ~190 (HL.js) | No | 100+ HL.js themes |
| CodeBlockShiki | Community | 66 | Inline styles | ~200 (TextMate) | Yes | VS Code themes |
| CodeBlockPrism | Community | Low | External CSS | ~300 (Prism) | No | Prism themes |
| Plain CodeBlock | Official Tiptap | Monorepo | None | N/A | N/A | None |
| CodeBlockShiki + lowlight | N/A | N/A | Both | N/A | N/A | Both |

**Decision guide**:
- Simple chat app, CSS themes OK → **CodeBlockLowlight**
- Need inline styles / dark mode toggle without CSS → **CodeBlockShiki**
- Slack-accurate (no highlighting in composer) → **Plain CodeBlock + static renderer at display time**

---

## 5. Slash Command Autocomplete

### RECOMMENDATION: Build custom with `@tiptap/suggestion` — no official package exists yet

The official slash command extension is experimental and unpublished. Implement manually using `@tiptap/suggestion`.

### USAGE EXAMPLE

```javascript
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'

const SlashCommandKey = new PluginKey('slash-command')

// Define available commands
const SLASH_COMMANDS = [
  {
    title: 'Bold',
    subtext: 'Make text bold',
    icon: 'B',
    aliases: ['b', 'strong'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBold().run()
    },
  },
  {
    title: 'Code Block',
    subtext: 'Insert a code block',
    icon: '</>',
    aliases: ['code', 'pre', 'codeblock'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: 'Bullet List',
    subtext: 'Create an unordered list',
    icon: '•',
    aliases: ['ul', 'list', 'unordered'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Ordered List',
    subtext: 'Create a numbered list',
    icon: '1.',
    aliases: ['ol', 'ordered', 'numbered'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
]

const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: SlashCommandKey,
        startOfLine: false,
        allowSpaces: false,

        items: ({ query }) => {
          if (!query) return SLASH_COMMANDS.slice(0, 5) // Show top 5 when empty
          return SLASH_COMMANDS.filter(
            item =>
              item.title.toLowerCase().includes(query.toLowerCase()) ||
              item.aliases?.some(a => a.includes(query.toLowerCase()))
          )
        },

        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },

        render: () => {
          let popup
          let cleanup

          return {
            onStart: (props) => {
              popup = document.createElement('div')
              popup.className = 'slash-command-menu'
              document.body.appendChild(popup)
              // Position with floating-ui, same pattern as mention popup above
              // Mount React component: ReactDOM.createRoot(popup).render(<SlashMenu {...props} />)
            },
            onUpdate: (props) => {
              // Update component props
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                cleanup?.()
                popup?.remove()
                return true
              }
              // Forward ArrowUp/ArrowDown/Enter to dropdown
              return false
            },
            onExit: () => {
              cleanup?.()
              popup?.remove()
            },
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
```

**Add to editor:**
```javascript
extensions: [StarterKit.configure({ ... }), SlashCommand]
```

### Third-party Options

- **`@harshtalks/slash-tiptap`**: Built on `@tiptap/suggestion` + `cmdk` for dropdown. Headless, flexible, good starting point. Verify v3 compatibility before using.
- **`tiptap-slash-react`**: More opinionated, requires v3 compatibility check.

### INTEGRATION NOTES

- Trigger only on `/` at word start to avoid conflicts (e.g., URLs with `/`)
- Add `startOfLine: false` and filter out contexts inside code blocks with a `allow` predicate
- Use `deleteRange(range)` in each command to remove the `/query` text before executing

---

## 6. Read-Only Rendering in Message Bubbles

### RECOMMENDATION: Use `@tiptap/static-renderer` with `renderToHTMLString` or `renderToReactElement` for message lists

Never use `EditorContent editable:false` for message lists — it creates one full ProseMirror instance per message.

### Option A: Static Renderer — `renderToHTMLString` (RECOMMENDED for message lists)

```bash
npm install @tiptap/static-renderer
```

**No DOM required — works in SSR (Next.js, server components).**

```javascript
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string'
import StarterKit from '@tiptap/starter-kit'
import { Mention } from '@tiptap/extension-mention'

// Pass same extensions as the editor
const html = renderToHTMLString({
  extensions: [StarterKit, Mention],
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'mention', attrs: { id: 'user-1', label: 'Alice' } },
        ],
      },
    ],
  },
})
// → '<p>Hello <span data-type="mention" data-id="user-1">@Alice</span></p>'
```

**Custom node mappings** (for message bubble styling):
```javascript
renderToHTMLString({
  extensions: [StarterKit, Mention],
  content: jsonContent,
  options: {
    nodeMapping: {
      paragraph({ children }) {
        return `<span class="msg-para">${children}</span>`
      },
      code_block({ node, children }) {
        const lang = node.attrs.language || ''
        return `<pre class="msg-code" data-lang="${lang}"><code>${children}</code></pre>`
      },
      mention({ node }) {
        const { id, label } = node.attrs
        return `<a href="/users/${id}" class="mention">@${label}</a>`
      },
    },
  },
})
```

### Option B: renderToReactElement (React-specific, avoids dangerouslySetInnerHTML)

```javascript
import { renderToReactElement } from '@tiptap/static-renderer/pm/react'

function MessageBubble({ content }) {
  const element = useMemo(
    () => renderToReactElement({ extensions: [StarterKit], content }),
    [content]
  )
  return <div className="message-bubble">{element}</div>
}
```

### Option C: generateHTML (client or server)

```javascript
import { generateHTML } from '@tiptap/html' // SSR-safe
// import { generateHTML } from '@tiptap/core' // browser only

import { Document, Paragraph, Text, Bold, Italic, Strike, Code } from '@tiptap/core'
import { Mention } from '@tiptap/extension-mention'

const extensions = [Document, Paragraph, Text, Bold, Italic, Strike, Code, Mention]

function MessageBubble({ content }) {
  const html = useMemo(() => generateHTML(content, extensions), [content])
  return (
    <div
      className="message-bubble prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

**Key distinction**: `generateHTML` from `@tiptap/html` is SSR-safe. `generateHTML` from `@tiptap/core` is browser-only (uses real DOM).

### Option D: EditorContent editable:false (Avoid for lists)

```javascript
// ⚠️ Only use for 1-3 items — not for message lists
const editor = useEditor({
  editable: false,
  content: jsonContent,
  extensions: [StarterKit],
})
return <EditorContent editor={editor} />
```

**Only benefit**: Correctly renders React nodeViews. For everything else, use static renderer.

### Rendering Method Comparison

| Method | SSR Support | nodeViews | Perf (100+ msgs) | XSS Risk | Complexity |
|---|---|---|---|---|---|
| `renderToHTMLString` | Yes | No | Excellent | Low (sanitize output) | Low |
| `renderToReactElement` | Yes | No | Excellent | None | Low |
| `generateHTML` (@tiptap/html) | Yes | No | Good | Medium (dangerouslySetInnerHTML) | Low |
| `generateHTML` (@tiptap/core) | Browser only | No | Good | Medium | Low |
| `EditorContent editable:false` | No | Yes | Poor | None | Low |

**XSS note**: When using `dangerouslySetInnerHTML` with `generateHTML` output, sanitize with DOMPurify:
```javascript
import DOMPurify from 'dompurify'
const html = DOMPurify.sanitize(generateHTML(content, extensions))
```

`renderToReactElement` does not need DOMPurify since React handles escaping.

---

## Complete Editor Setup Example

```javascript
// editor.js — full Slack-like composer configuration
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Mention } from '@tiptap/extension-mention'
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import 'highlight.js/styles/github-dark.css'

const lowlight = createLowlight(common)

export const createSlackEditor = (element, { onUserFetch, onChannelFetch }) =>
  new Editor({
    element,
    extensions: [
      StarterKit.configure({
        codeBlock: false,   // replaced by CodeBlockLowlight
        heading: false,     // not in Slack
        blockquote: false,  // not in Slack
        horizontalRule: false,
      }),

      Mention.configure({
        HTMLAttributes: { class: 'mention mention--user' },
        suggestion: {
          char: '@',
          items: async ({ query }) => onUserFetch(query),
          // render: () => { ... } — see Section 2
        },
      }),

      Mention.extend({ name: 'channel' }).configure({
        HTMLAttributes: { class: 'mention mention--channel' },
        suggestion: {
          char: '#',
          items: async ({ query }) => onChannelFetch(query),
        },
      }),

      Emoji.configure({
        emojis: gitHubEmojis,
        enableEmoticons: true,
      }),

      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'javascript',
        enableTabIndentation: true,
      }),

      SlashCommand, // custom extension from Section 5
    ],
  })
```

---

## Summary Table

| Feature | Package | Notes |
|---|---|---|
| Base editor | `@tiptap/starter-kit` ^3.20.0 | Disable heading, blockquote, HR, codeBlock |
| @user mentions | `@tiptap/extension-mention` | floating-ui for popup (not tippy in v3) |
| #channel mentions | `@tiptap/extension-mention` (second instance) | Different `pluginKey` |
| :emoji: shortcode | `@tiptap/extension-emoji` | Free, MIT, ~100k weekly downloads |
| Emoji picker (toolbar) | `emoji-mart` v5 + `@emoji-mart/data` | Lazy-load data; 84KB gzipped |
| Code highlighting | `@tiptap/extension-code-block-lowlight` | With `lowlight` v3 `createLowlight(common)` |
| /slash commands | Custom via `@tiptap/suggestion` | No official package; ~20 lines of wiring |
| Message rendering | `@tiptap/static-renderer` | `renderToReactElement` — no dangerouslySetInnerHTML |
| Popup positioning | `@floating-ui/dom` | Required for all popups in v3 |

---

## References

- [Tiptap v3 Release Notes](https://tiptap.dev/docs/resources/whats-new)
- [StarterKit Extension Docs](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)
- [Upgrade v2 → v3 Guide](https://tiptap.dev/docs/guides/upgrade-tiptap-v2)
- [Mention Extension Docs](https://tiptap.dev/docs/editor/extensions/nodes/mention)
- [Suggestion Utility Docs](https://tiptap.dev/docs/editor/api/utilities/suggestion)
- [Emoji Extension Docs](https://tiptap.dev/docs/editor/extensions/nodes/emoji)
- [CodeBlockLowlight Docs](https://tiptap.dev/docs/editor/extensions/nodes/code-block-lowlight)
- [Static Renderer Docs](https://tiptap.dev/docs/editor/api/utilities/static-renderer)
- [emoji-mart GitHub](https://github.com/missive/emoji-mart)
- [tiptap-extension-code-block-shiki GitHub](https://github.com/timomeh/tiptap-extension-code-block-shiki)
- [Slash Commands Experiment](https://tiptap.dev/docs/examples/experiments/slash-commands)
- [GitHub Issue #6350 — floating-ui cleanup bug](https://github.com/ueberdosis/tiptap/issues/6350)
- [GitHub Issue #7029 — static renderer nodeView mismatch](https://github.com/ueberdosis/tiptap/issues/7029)
