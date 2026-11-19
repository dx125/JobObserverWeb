import DOMPurify from 'dompurify';
import { useMemo } from 'react';

// Job descriptions are scraped third-party HTML: always sanitize before injecting (ADR-007).
// DOMPurify strips scripts, event handlers and javascript:/data: URLs by default.
let hooked = false;
function ensureLinkHook(): void {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function sanitizeHtml(html: string): string {
  ensureLinkHook();
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function HtmlContent({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  return <div className="html-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}
