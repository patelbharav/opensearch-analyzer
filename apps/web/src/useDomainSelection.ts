import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";
import { useEmbed } from "./embed.js";

const STORAGE_KEY = "osa-selected-domain-id";

export function useDomainSelection() {
  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => api.listDomains(),
  });
  const domains = domainsQuery.data?.domains ?? [];

  const [selectedDomainId, setSelectedDomainIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setSelectedDomainId = (id: string | null) => {
    setSelectedDomainIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  };

  // If the parent (embed mode) pushes a domain ARN, auto-select it.
  const { parentDomainArn } = useEmbed();
  useEffect(() => {
    if (!parentDomainArn) return;
    const match = domains.find((d) => d.arn === parentDomainArn);
    if (match) setSelectedDomainId(match.id);
  }, [parentDomainArn, domains]);

  // If the stored domain ID no longer exists in the list (e.g. deleted),
  // fall back to the first domain.
  const storedStillExists = domains.some((d) => d.id === selectedDomainId);
  const effectiveDomainId =
    storedStillExists && selectedDomainId
      ? selectedDomainId
      : domains.length > 0
        ? domains[0]!.id
        : null;

  // Keep storage in sync with effective selection.
  useEffect(() => {
    if (effectiveDomainId && effectiveDomainId !== selectedDomainId) {
      setSelectedDomainId(effectiveDomainId);
    }
  }, [effectiveDomainId]);

  return {
    domains,
    domainsLoading: domainsQuery.isLoading,
    selectedDomainId: effectiveDomainId,
    setSelectedDomainId,
  };
}
