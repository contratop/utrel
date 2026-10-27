import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Markdown enriquecido (GFM) saneado antes de inyectarlo en el DOM. */
export function renderMarkdown(text) {
  if (!text) return ''
  const html = marked.parse(String(text), { async: false })
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

export function Markdown({ text, className = '' }) {
  if (!text) return null
  return (
    <div
      className={`markdown ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  )
}

export default Markdown
