/**
 * Loader for src/config/rates.json — the single home of every tax rate
 * (CLAUDE.md: config-driven, effective-dated, operator-editable). The
 * engine picks the newest entry whose effectiveFrom is on or before the
 * given date.
 */
import ratesJson from '../../config/rates.json';

export interface RateSource {
  url: string;
  accessed: string;
}

export interface Band {
  /** Upper bound of the band in £; null = no limit. */
  upTo: number | null;
  rate: number;
}

interface Dated {
  effectiveFrom: string;
  source: RateSource;
}

export interface BandTable extends Dated {
  bands: Band[];
  maxPrice?: number;
}

export interface IncomeTaxEntry extends Dated {
  personalAllowance: number;
  rates: { basic: number; higher: number; additional: number };
}

export interface Class4NicEntry extends Dated {
  lowerLimit: number;
  upperLimit: number;
  mainRate: number;
  upperRate: number;
}

export interface CorporationTaxEntry extends Dated {
  smallRate: number;
  mainRate: number;
  lowerLimit: number;
  upperLimit: number;
  marginalReliefFraction: number;
}

export interface FinanceCostCreditEntry extends Dated {
  rate: number;
}

/** Newest entry effective on or before `onDate` (ISO yyyy-mm-dd). Exported for tests. */
export function pickEffective<T extends Dated>(entries: T[], onDate: string): T {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
    throw new RangeError(`onDate must be yyyy-mm-dd (got ${String(onDate)})`);
  }
  const eligible = entries
    .filter((e) => e.effectiveFrom <= onDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  if (eligible.length === 0) {
    throw new RangeError(`No rates effective on ${onDate} (earliest is ${entries.map((e) => e.effectiveFrom).sort()[0]})`);
  }
  return eligible[0];
}

/** Today's date in the UK (Europe/London) — rate changes land on UK dates. */
export const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

export const rates = ratesJson;

export function getIncomeTax(onDate = today()): IncomeTaxEntry {
  return pickEffective(ratesJson.incomeTax as IncomeTaxEntry[], onDate);
}
export function getClass4Nic(onDate = today()): Class4NicEntry {
  return pickEffective(ratesJson.class4Nic as Class4NicEntry[], onDate);
}
export function getCorporationTax(onDate = today()): CorporationTaxEntry {
  return pickEffective(ratesJson.corporationTax as CorporationTaxEntry[], onDate);
}
export function getFinanceCostCredit(onDate = today()): FinanceCostCreditEntry {
  return pickEffective(ratesJson.financeCostCredit as FinanceCostCreditEntry[], onDate);
}
