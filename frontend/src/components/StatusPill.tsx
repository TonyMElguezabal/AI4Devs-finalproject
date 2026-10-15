import type { StatusClass } from "../styles/status";
import { statusIcon } from "../styles/status";
import { Icon } from "./Icon";

interface Props {
  statusClass: StatusClass;
  label: string;
}

/**
 * One status, drawn the same way everywhere (redesign-visual-design, JOS-198): the label is the signal, the
 * icon and the colour reinforce it. The class comes from `styles/status.ts`, never from a literal here.
 */
export function StatusPill({ statusClass, label }: Props) {
  return (
    <span className={`status-pill ${statusClass}`}>
      <Icon name={statusIcon(statusClass)} />
      {label}
    </span>
  );
}
