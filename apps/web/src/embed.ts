import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface EmbedContextValue {
  /** True if rendered inside an iframe or with ?embed=1. */
  embedded: boolean;
  /** Origin of the parent frame, if known and trusted. */
  parentOrigin: string | null;
  /** Domain ARN the parent has selected (postMessage handshake). */
  parentDomainArn: string | null;
}

export const EmbedContext = createContext<EmbedContextValue>({
  embedded: false,
  parentOrigin: null,
  parentDomainArn: null,
});

/** Origins we'll accept postMessage from. */
const TRUSTED_ORIGIN_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)?console\.aws\.amazon\.com$/i,
  /^http:\/\/localhost:3001$/i, // demo host
];

export function isTrustedOrigin(origin: string): boolean {
  return TRUSTED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

export function detectEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "1") return true;
  try {
    return window.parent !== window;
  } catch {
    // Cross-origin parent access throws — definitely embedded.
    return true;
  }
}

export function useEmbed(): EmbedContextValue {
  return useContext(EmbedContext);
}

export interface ParentMessage {
  type: string;
  [k: string]: unknown;
}

/**
 * Hook that listens for `osa.select-domain` messages from a trusted parent.
 * Returns the most recently received ARN (or null).
 */
export function useParentDomainArn(embedded: boolean): {
  parentOrigin: string | null;
  parentDomainArn: string | null;
} {
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);
  const [parentDomainArn, setParentDomainArn] = useState<string | null>(null);

  useEffect(() => {
    if (!embedded) return;

    const onMessage = (e: MessageEvent) => {
      if (!isTrustedOrigin(e.origin)) return;
      const data = e.data as ParentMessage | null;
      if (!data || typeof data !== "object" || typeof data.type !== "string") return;

      if (data.type === "osa.select-domain") {
        const arn = typeof data.arn === "string" ? data.arn : null;
        if (arn) {
          setParentOrigin(e.origin);
          setParentDomainArn(arn);
        }
      }
    };
    window.addEventListener("message", onMessage);

    // Announce we're ready so the parent can push the current domain.
    try {
      window.parent.postMessage({ type: "osa.ready" }, "*");
    } catch {
      // ignore
    }

    return () => window.removeEventListener("message", onMessage);
  }, [embedded]);

  return useMemo(
    () => ({ parentOrigin, parentDomainArn }),
    [parentOrigin, parentDomainArn],
  );
}
