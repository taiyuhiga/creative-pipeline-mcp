import { checkProviderAvailability, type ProviderAvailability } from "./appAvailability.js";
import { providersForDomain, type ProviderDomain } from "./providerCapabilities.js";

export interface ProviderResolution {
  domain: ProviderDomain;
  selected?: ProviderAvailability;
  candidates: ProviderAvailability[];
  reason: string;
}

export function resolveProvider(
  domain: ProviderDomain,
  options: { preferredProvider?: string; allowExperimental?: boolean; requireAvailable?: boolean } = {}
): ProviderResolution {
  const candidates = providersForDomain(domain)
    .filter((provider) => options.allowExperimental !== false || provider.stability !== "experimental")
    .map(checkProviderAvailability);
  const preferred = options.preferredProvider
    ? candidates.find((candidate) => candidate.provider === options.preferredProvider)
    : undefined;
  const available = candidates.find((candidate) => candidate.available);
  const selected = preferred && (!options.requireAvailable || preferred.available)
    ? preferred
    : available ?? (options.requireAvailable ? undefined : candidates[0]);
  return {
    domain,
    selected,
    candidates,
    reason: selected
      ? selected.available
        ? "selected_available_provider"
        : "selected_manifest_provider_unavailable_locally"
      : "no_provider_available"
  };
}
