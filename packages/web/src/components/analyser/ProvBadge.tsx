/** Small, quiet provenance badge shown beside a prefilled field (E11). */
import { PROV_LABEL, sourceFor, type ProvSource } from './provenance';

const CLS: Record<ProvSource, string> = {
  listing: 'prov-fact',
  epc: 'prov-fact',
  typed: 'prov-typed',
  settings: 'prov-settings',
  carried: 'prov-estimate',
};

/** Renders the badge for a field key, or nothing when there's no source to show. */
export function ProvBadge({ field }: { field: string }) {
  const source = sourceFor(field);
  if (!source) return null;
  return <span class={`prov-badge ${CLS[source]}`}>{PROV_LABEL[source]}</span>;
}
