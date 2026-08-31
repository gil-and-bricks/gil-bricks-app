import { describe, expect, it } from 'vitest';
import { analyseHmo, checkRoomSizes, ROOM_MIN_CHILD, type HmoInputs } from './hmo';

const T = { minCashflowGreen: 400, minRoiGreen: 12, icrBasic: 1.25, icrHigher: 1.45 };
const base: HmoInputs = {
  price: 180000, country: 'E92000001', rooms: 5, roomRent: 550, billsIncluded: true,
  refurb: 0, buyingAs: 'basic', selfManaged: false, depositPct: 25, ratePct: 6,
  opCostPct: 40, licenceFee: 1200, licenceYears: 5, compliancePerYear: 600,
  legals: 1500, stressRatePct: 5.5, taxBasis: 'additional', roomSizeFailures: 0, thresholds: T,
};

describe('HMO worked example — £180k, 5 rooms × £550, bills incl., agent 40%', () => {
  // Hand-computed:
  //   SDLT additional £180k: 5%×125,000 + 7%×55,000 = 6,250 + 3,850 = £10,100
  //   deposit 45,000; loan 135,000; mortgage 135,000×6%/12 = £675/mo
  //   gross = 5×550×12 = £33,000; op 40% = £13,200; compliance 600; licence 1,200/5 = 240
  //   NOI = 33,000 − 13,200 − 600 − 240 = £18,960
  //   cashflow before tax = 18,960/12 − 675 = £905/mo
  //   tax (basic): taxable 33,000−14,040 = 18,960 → 20% = 3,792;
  //     S24 credit 20%×min(8,100 interest, 18,960) = 1,620 → £2,172/yr = £181/mo
  //   after-tax = £724/mo; cash in = 45,000+10,100+1,500 = £56,600
  //   ROI = 724×12 ÷ 56,600 = 15.35%; ICR = 33,000 ÷ 7,425 = 4.44
  //   gross yield = 33,000/191,600 = 17.22%; net = 18,960/191,600 = 9.90%
  const a = analyseHmo(base);
  it('income, costs, NOI', () => {
    expect(a.stampDutyTax).toBe(10100);
    expect(a.grossIncome.value).toBe(33000);
    expect(a.operatingCosts.value).toBeCloseTo(13200, 6);
    expect(a.noi.value).toBeCloseTo(18960, 6);
  });
  it('cashflow £905 before, £724 after tax', () => {
    expect(a.cashflowBeforeTax.value).toBeCloseTo(905, 2);
    expect(a.taxPerYear.value).toBeCloseTo(2172, 1);
    expect(a.cashflowAfterTax.value).toBeCloseTo(724, 1);
  });
  it('ROI 15.35%, ICR 4.44, yields 17.2/9.9', () => {
    expect(a.cashIn.value).toBe(56600);
    expect(a.roi.value).toBeCloseTo(15.35, 1);
    expect(a.icr.value).toBeCloseTo(4.444, 2);
    expect(a.icr.passes).toBe(true);
    expect(a.grossYield.value).toBeCloseTo(17.22, 1);
    expect(a.netYield.value).toBeCloseTo(9.90, 1);
  });
  it('GREEN with the mandatory-licence flag at 5 rooms', () => {
    expect(a.verdict).toBe('green');
    expect(a.licence.level).toBe('mandatory');
    expect(a.lever).toBeNull();
  });
});

describe('room-size checker (statutory minimums)', () => {
  it('flags each threshold correctly', () => {
    const r = checkRoomSizes([
      { sqm: 6.51, occupancy: 'single' },
      { sqm: 6.5, occupancy: 'single' },
      { sqm: 10.22, occupancy: 'double' },
      { sqm: 10.0, occupancy: 'double' },
      { sqm: 4.64, occupancy: 'child' },
      { sqm: 4.5, occupancy: 'single' },
    ]);
    expect(r.map((x) => x.ok)).toEqual([true, false, true, false, true, false]);
    expect(r[5].message).toMatch(/cannot be used as a bedroom/);
  });
  it(`the ${ROOM_MIN_CHILD} floor is absolute — even a child room fails below it`, () => {
    expect(checkRoomSizes([{ sqm: 4.6, occupancy: 'child' }])[0].ok).toBe(false);
  });
  it('any failing room caps the verdict at amber', () => {
    const a = analyseHmo({ ...base, roomSizeFailures: 1 });
    expect(a.verdict).toBe('amber');
    expect(a.verdictCopy).toMatch(/one room fails/);
    expect(a.lever).toBeNull(); // rent can't fix an illegal room
  });
});

describe('colours, licence levels, lever', () => {
  it('3–4 rooms get the additional-licensing note', () => {
    const a = analyseHmo({ ...base, rooms: 4 });
    expect(a.licence.level).toBe('maybe');
    expect(a.licence.copy).toMatch(/additional licensing/);
  });
  it('amber with a dual lever when returns are thin — and the lever holds at its boundary', () => {
    // 3 rooms × £450: gross 16,200; op 6,480; NOI 8,880; cf before = 740−675 = £65
    const thin = { ...base, rooms: 3, roomRent: 450 };
    const a = analyseHmo(thin);
    expect(a.verdict).toBe('amber');
    expect(a.lever).toMatch(/more rent per room/);
    const m = /£([\d,]+) more rent per room/.exec(a.lever ?? '');
    expect(m).not.toBeNull();
    const rentUp = Number((m as RegExpExecArray)[1].replace(/,/g, ''));
    expect(analyseHmo({ ...thin, roomRent: thin.roomRent + rentUp }).verdict).toBe('green');
    expect(analyseHmo({ ...thin, roomRent: thin.roomRent + rentUp - 5 }).verdict).not.toBe('green');
  });
  it('red when the mortgage swallows the rooms', () => {
    const a = analyseHmo({ ...base, rooms: 3, roomRent: 350, depositPct: 10 });
    expect(a.verdict).toBe('red');
  });
  it('company path uses corporation tax', () => {
    const a = analyseHmo({ ...base, buyingAs: 'ltd' });
    // profit = 33,000 − 14,040 − 8,100 = 10,860 → 19% = £2,063.40
    expect(a.taxPerYear.value).toBeCloseTo(2063.4, 1);
  });
  it('higher-rate flips the ICR threshold to 1.45', () => {
    expect(analyseHmo({ ...base, buyingAs: 'higher' }).icr.threshold).toBe(1.45);
  });
});
