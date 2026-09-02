import { assertPositive, type WithBreakdown } from './breakdown';
import { fmtMoney } from './format';

/** 1 square metre = 10.7639 square feet (docs/definitions.md). */
export const SQFT_PER_SQM = 10.7639;

export function sqmToSqft(sqm: number): number {
  assertPositive({ sqm });
  return sqm * SQFT_PER_SQM;
}

/** £/sqm = price ÷ EPC total floor area. */
export function ppsqm(price: number, floorAreaSqm: number): WithBreakdown {
  assertPositive({ price, floorAreaSqm });
  const value = price / floorAreaSqm;
  return {
    value,
    breakdown: {
      label: 'Price per square metre',
      formula: 'price ÷ floor area',
      substituted: `${fmtMoney(price)} ÷ ${floorAreaSqm} sqm`,
      result: `${fmtMoney(value)} per sqm`,
      note: 'floor area comes from the property’s energy certificate (EPC)',
    },
  };
}

/** £/sqft — the same price over the floor area converted to square feet. */
export function ppsqft(price: number, floorAreaSqm: number): WithBreakdown {
  assertPositive({ price, floorAreaSqm });
  const sqft = floorAreaSqm * SQFT_PER_SQM;
  const value = price / sqft;
  return {
    value,
    breakdown: {
      label: 'Price per square foot',
      formula: 'price ÷ (floor area × 10.7639)',
      substituted: `${fmtMoney(price)} ÷ (${floorAreaSqm} sqm × 10.7639)`,
      result: `${fmtMoney(value)} per sqft`,
      note: '1 square metre = 10.7639 square feet',
    },
  };
}
