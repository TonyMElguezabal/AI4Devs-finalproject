import { useState } from "react";
import { retryRefusalSentence } from "../retryRefusals";

interface Props {
  label: string;
  onRetry: () => Promise<unknown>;
}

/**
 * The retry button every phase shares (retry-decomposition, JOS-156, Decision 8). Disabled while the request is
 * outstanding; a refusal shows as a sentence. It never changes the phase: the live update does.
 */
export function PhaseRetryButton({ label, onRetry }: Props) {
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setRefusal(null);
    try {
      await onRetry();
    } catch (error) {
      setRefusal(retryRefusalSentence(error instanceof Error ? error.message : ""));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" disabled={pending} onClick={handleClick}>
        {label}
      </button>
      {refusal && <p role="status">{refusal}</p>}
    </>
  );
}
