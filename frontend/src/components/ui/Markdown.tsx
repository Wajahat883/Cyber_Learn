import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="absolute top-2 right-2 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted hover:text-text flex items-center gap-1"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const components: Components = {
  pre({ children, node: _node, ...rest }) {
    const text = extractText(children);
    return (
      <div className="relative group">
        <pre {...rest}>{children}</pre>
        <CopyButton text={text} />
      </div>
    );
  },
  a({ children, href, node: _node, ...rest }) {
    // Only http(s) and in-page links are followed; others render as plain text.
    if (!href || !/^(https?:|#|\/)/.test(href)) return <span>{children}</span>;
    return (
      <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    );
  },
  img() {
    // Remote images inside generated text are not loaded.
    return null;
  },
};

function extractText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) return extractText((node as { props: { children?: unknown } }).props.children);
  return '';
}

/**
 * Renders lesson Markdown. Raw HTML is never rendered (react-markdown escapes it
 * by default), which prevents stored XSS from generated or edited content (spec 15).
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  if (!children?.trim()) return null;
  return (
    <div className={`prose-cl ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export { CopyButton };
