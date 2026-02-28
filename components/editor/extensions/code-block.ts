import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'

// `common` includes JavaScript, TypeScript, Python, Go, Rust, JSON, CSS,
// XML (HTML), Bash/Shell, and ~25 more popular languages out of the box.
const lowlight = createLowlight(common)

export const codeBlockLowlight = CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: 'plaintext',
  HTMLAttributes: {
    class: 'hljs code-block',
  },
})
