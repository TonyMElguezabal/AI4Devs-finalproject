import type { KeyboardEvent, ReactNode } from "react";

interface Props {
  /** The accessible name of the menu button, for example "More actions for OpenAI". */
  label: string;
  /** The actions, as buttons. */
  children: ReactNode;
}

/**
 * admin-tabs-and-tables (JOS-270), Decision 8 — a disclosure of secondary actions: a native `<details>`, closed when an
 * action is chosen or Escape is pressed. It is not an ARIA menu: the actions are ordinary buttons.
 */
export function ActionMenu({ label, children }: Props) {
  const close = (details: HTMLDetailsElement | null) => details?.removeAttribute("open");

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.stopPropagation();
    close(event.currentTarget);
    event.currentTarget.querySelector("summary")?.focus();
  }

  return (
    <details className="menu" onKeyDown={handleKeyDown}>
      <summary aria-label={label}>
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="menu-items" onClick={(event) => close(event.currentTarget.closest("details"))}>
        {children}
      </div>
    </details>
  );
}
