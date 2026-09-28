interface SquadMarkdownViewProps {
  /** Raw markdown / text content to display read-only. */
  content: string;
  /** Message shown when {@link content} is empty or whitespace-only. */
  emptyMessage?: string;
  /** Accessible label for the rendered region. */
  ariaLabel?: string;
}

/**
 * SquadMarkdownView Component
 *
 * Renders raw Squad markdown/text content **safely** as preformatted text.
 *
 * Security (charter): the panel webview has no HTML-sanitising markdown
 * pipeline, so this component never injects HTML. Content is rendered as plain
 * text inside a `<pre>` element — the browser escapes it — which fully avoids
 * any unsanitised-HTML / script-injection risk from workspace files while
 * keeping whitespace and formatting readable. A richer sanitised renderer can
 * replace this later without changing the call sites.
 */
export function SquadMarkdownView({ content, emptyMessage = "This document is empty.", ariaLabel }: SquadMarkdownViewProps) {
  const isEmpty = content.trim().length === 0;

  if (isEmpty) {
    return <p class="empty-message">{emptyMessage}</p>;
  }

  return (
    <pre class="squad-markdown" role="document" aria-label={ariaLabel} tabIndex={0}>
      {content}
    </pre>
  );
}
