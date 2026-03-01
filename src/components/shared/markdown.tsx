'use client';

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Heading anchor helpers (for TOC linking)
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MarkdownProps {
  /** Markdown string to render (pass as children or content) */
  children?: string;
  /** Alternative to children — same string, different prop name */
  content?: string;
  className?: string;
  /** When true, headings get slug-based `id` attributes for TOC anchor linking */
  withAnchors?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function NonMemoizedMarkdown({ children, content, className, withAnchors }: MarkdownProps) {
  const text = children ?? content ?? '';

  const anchorComponents = useMemo<Partial<Components> | null>(() => {
    if (!withAnchors) return null;

    const slugCounts = new Map<string, number>();

    function makeHeadingId(raw: string): string {
      const base = slugify(raw);
      const count = slugCounts.get(base) ?? 0;
      slugCounts.set(base, count + 1);
      return count > 0 ? `${base}-${count}` : base;
    }

    return {
      h1: ({ children }) => {
        const t = String(children);
        return <h1 id={makeHeadingId(t)} className="text-xl font-bold mt-6 mb-3 text-foreground">{children}</h1>;
      },
      h2: ({ children }) => {
        const t = String(children);
        return <h2 id={makeHeadingId(t)} className="text-lg font-semibold mt-5 mb-2 text-foreground">{children}</h2>;
      },
      h3: ({ children }) => {
        const t = String(children);
        return <h3 id={makeHeadingId(t)} className="text-base font-semibold mt-4 mb-2 text-foreground">{children}</h3>;
      },
      h4: ({ children }) => {
        const t = String(children);
        return <h4 id={makeHeadingId(t)} className="text-sm font-semibold mt-3 mb-1 text-foreground">{children}</h4>;
      },
    };
  }, [withAnchors]);

  const components = useMemo<Components>(() => ({
    // Headings — use anchor variants if enabled, otherwise plain styled headings
    ...(anchorComponents ?? {
      h1: ({ children }) => (
        <h1 className="text-xl font-bold mt-6 mb-3 text-foreground">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-lg font-semibold mt-5 mb-2 text-foreground">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-base font-semibold mt-4 mb-2 text-foreground">{children}</h3>
      ),
    }),
    p: ({ children }) => (
      <p className="mb-3 leading-relaxed text-foreground/90">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="text-foreground/90">{children}</li>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-pfc-ember" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={cn('block', className)} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="mb-3 overflow-x-auto rounded-lg border bg-muted p-4 text-sm font-mono">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-3 border-l-2 border-pfc-ember pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="mb-3 overflow-x-auto">
        <table className="w-full border-collapse border border-border text-sm">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-border px-3 py-2">{children}</td>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-pfc-violet hover:underline"
      >
        {children}
      </a>
    ),
    hr: () => <hr className="my-4 border-border" />,
  }), [anchorComponents]);

  return (
    <div className={cn('prose-pfc', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prev, next) =>
    prev.children === next.children &&
    prev.content === next.content &&
    prev.withAnchors === next.withAnchors &&
    prev.className === next.className,
);

/**
 * Backward-compat alias — renders markdown with heading anchors for TOC linking.
 * Prefer `<Markdown withAnchors>` for new code.
 */
export const MarkdownContent = memo(
  function MarkdownContentWrapper({ content, className }: { content: string; className?: string }) {
    return <NonMemoizedMarkdown content={content} className={className} withAnchors />;
  },
);
