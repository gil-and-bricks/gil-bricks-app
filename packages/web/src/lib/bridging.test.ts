import { describe, expect, it } from 'vitest';
import { BRIDGING, BRIDGING_RULES, BROKER, brokerReady } from '../config/bridging';
import {
  depositPasses, EMPTY_ENQUIRY, isComplete, isPhone, loanAmount, phoneDigits, qualify, step1Errors, step2Errors, storyQuality,
  type Enquiry,
} from './bridging';

/** A complete, coherent enquiry — the shape every case below varies from. */
const GOOD_STORY =
  'I have agreed a three-bed terrace in Swansea at £120,000. It needs a new kitchen, bathroom and rewire, about £25,000. ' +
  'I am putting in £45,000 of my own cash and want to bridge the rest. Once the work is done I will refinance onto a ' +
  'buy-to-let mortgage at around £165,000 and repay the bridge from that.';
const good: Enquiry = {
  loan: '95000', deposit: '25-plus', property: 'found', entity: 'ltd', exit: 'refinance',
  story: GOOD_STORY, timing: '4-weeks', credit: 'none', phone: '07700 900123', consent: true,
};

describe('bridging enquiry — the questions', () => {
  it('step 1 is not complete until all four are answered', () => {
    expect(Object.keys(step1Errors(EMPTY_ENQUIRY)).sort()).toEqual(['deposit', 'entity', 'loan', 'property']);
    expect(step1Errors(good)).toEqual({});
    expect(step1Errors({ ...good, loan: '' }).loan).toBe(true);
    expect(step1Errors({ ...good, loan: '0' }).loan).toBe(true);
    expect(step1Errors({ ...good, deposit: 'nonsense' as never }).deposit).toBe(true);
  });

  it('step 2 needs the exit, the story, timing, credit, a phone and the tick', () => {
    expect(Object.keys(step2Errors(EMPTY_ENQUIRY)).sort()).toEqual(['consent', 'credit', 'exit', 'phone', 'story', 'timing']);
    expect(step2Errors(good)).toEqual({});
    expect(step2Errors({ ...good, consent: false }).consent).toBe(true);
    expect(step2Errors({ ...good, story: 'Too short.' }).story).toBe(true);
  });

  it('the free text has a real minimum, in characters', () => {
    const justUnder = 'a'.repeat(BRIDGING_RULES.minStoryChars - 1);
    expect(step2Errors({ ...good, story: justUnder }).story).toBe(true);
    expect(BRIDGING_RULES.minStoryChars).toBeGreaterThanOrEqual(150);
  });

  it('a phone number has to look like one', () => {
    expect(isPhone('07700 900123')).toBe(true);
    expect(isPhone('+44 7700 900123')).toBe(true);
    expect(isPhone('01792 123456')).toBe(true);
    expect(isPhone('12345')).toBe(false);
    expect(isPhone('not a phone')).toBe(false);
    expect(phoneDigits('+44 (0)7700 900-123')).toBe('4407700900123');
  });

  it('reads the loan as a number however it is typed', () => {
    expect(loanAmount('£95,000')).toBe(95000);
    expect(loanAmount('')).toBe(0);
    expect(loanAmount('abc')).toBe(0);
  });
});

describe('bridging enquiry — qualification, one case per rule', () => {
  it('QUALIFIED: deposit, a real deal, a stated exit echoed in the story', () => {
    const d = qualify(good);
    expect(d.outcome).toBe('qualified');
    expect(d.reasons).toEqual([]);
    expect(isComplete(good)).toBe(true);
  });

  it('QUALIFIED: an auction deal is a real deal', () => {
    expect(qualify({ ...good, property: 'auction' }).outcome).toBe('qualified');
  });

  it('NOT YET: deposit under 10%', () => {
    const d = qualify({ ...good, deposit: 'under-10' });
    expect(d.outcome).toBe('not-yet');
    expect(d.reasons).toContain('deposit-below-minimum');
  });

  it('NOT YET: "not sure" about the deposit is not a deposit', () => {
    expect(qualify({ ...good, deposit: 'not-sure' }).reasons).toContain('deposit-below-minimum');
  });

  it('NOT YET: still looking for a property', () => {
    expect(qualify({ ...good, property: 'looking' }).reasons).toContain('no-property-yet');
  });

  it('NOT YET: just researching', () => {
    expect(qualify({ ...good, timing: 'researching' }).reasons).toContain('just-researching');
  });

  it('NOT YET: a loan below the lender minimum', () => {
    const d = qualify({ ...good, loan: String(BRIDGING_RULES.minLoan - 1) });
    expect(d.outcome).toBe('not-yet');
    expect(d.reasons).toContain('loan-below-minimum');
  });

  it('NOT YET: the free text is too short', () => {
    expect(qualify({ ...good, story: 'I want a bridge for a house.' }).reasons).toContain('story-too-short');
  });

  it('NOT YET: the free text is long but says nothing (padding)', () => {
    const padded = 'money money money money money money money money money money money money money money money money money money money money money money money money money money money money money money';
    const d = qualify({ ...good, story: padded });
    expect(d.outcome).toBe('not-yet');
    expect(d.reasons.some((r) => r.startsWith('story-'))).toBe(true);
  });

  it('NOT YET: a long story that never says how the loan gets repaid', () => {
    const noExit =
      'It is a lovely three bedroom house on a quiet street near the park with a big garden and a garage. ' +
      'The kitchen is dated and the bathroom needs doing but the roof looks fine and the windows were done recently.';
    expect(qualify({ ...good, story: noExit }).reasons).toContain('story-no-repayment-route');
  });

  it('NOT YET: no repayment route picked at all', () => {
    expect(qualify({ ...good, exit: '' }).reasons).toContain('no-repayment-route');
  });

  it('NOT YET: the page’s own labels pasted back are not an answer', () => {
    const pasted = 'In your own words, what is the deal and how will you pay the loan back? A short paragraph. This is the part the broker reads first. How will you pay the bridge back How much do you want to borrow';
    expect(qualify({ ...good, story: pasted }).outcome).toBe('not-yet');
  });

  it('NOT YET: one sentence pasted twice is padding, however long', () => {
    const twice = 'I will refinance onto a buy-to-let mortgage once the works are done and repay the bridge from that. I will refinance onto a buy-to-let mortgage once the works are done and repay the bridge from that.';
    expect(qualify({ ...good, story: twice }).outcome).toBe('not-yet');
  });

  it('NOT YET: the story must match the exit they picked, not just any exit word', () => {
    const sellStory = 'I have agreed a terrace at £120,000 and will do a full refurbishment for about £25,000 of works. When it is finished I will sell it on the open market for around £165,000 and take the profit.';
    expect(qualify({ ...good, exit: 'refinance', story: sellStory }).outcome).toBe('not-yet');
    expect(qualify({ ...good, exit: 'sell', story: sellStory }).outcome).toBe('qualified');
  });

  it('QUALIFIED: ordinary English about repaying counts, not just our jargon', () => {
    const plain = 'I have agreed a three-bed terrace at £120,000 and it needs about £25,000 of work. I am putting in £45,000 of my own cash. When the work is finished I will pay off the bridge from the proceeds of the sale.';
    expect(qualify({ ...good, exit: 'sell', story: plain }).outcome).toBe('qualified');
  });

  it('the deposit gate follows the configured band, not a hardcoded one', () => {
    expect(depositPasses('25-plus')).toBe(true);
    expect(depositPasses('10-24')).toBe(true);
    expect(depositPasses('under-10')).toBe(false);
    expect(depositPasses('not-sure')).toBe(false);
    expect(depositPasses('')).toBe(false);
  });

  it('every reason is a stable key, so the operator can read WHY later', () => {
    for (const r of qualify({ ...EMPTY_ENQUIRY, story: 'x' }).reasons) {
      expect(r).toMatch(/^[a-z][a-z-]+$/);
    }
  });

  it('credit answers never disqualify on their own', () => {
    for (const credit of ['none', 'some', 'discuss'] as const) {
      expect(qualify({ ...good, credit }).outcome).toBe('qualified');
    }
  });

  it('buying personally, in a company, or not sure — none of them disqualify', () => {
    for (const entity of ['personal', 'ltd', 'not-sure'] as const) {
      expect(qualify({ ...good, entity }).outcome).toBe('qualified');
    }
  });
});

describe('bridging page copy — what it may never say', () => {
  const allCopy = JSON.stringify(BRIDGING).toLowerCase();
  it('never promises a rate, a deal or an outcome', () => {
    for (const phrase of ['best rate', 'best deal', 'cheapest', 'guarantee', 'approved', 'we will find you', 'lowest rate']) {
      expect(allCopy).not.toContain(phrase);
    }
  });
  it('never names a lender and never recommends a product', () => {
    for (const phrase of ['we recommend', 'you should borrow', 'lender:', 'together money', 'shawbrook', 'precise mortgages']) {
      expect(allCopy).not.toContain(phrase);
    }
  });
  it('says plainly that it is an introduction, not advice', () => {
    const said = BRIDGING.disclaimer('PropLaunch').toLowerCase();
    expect(said).toContain('not a broker');
    expect(said).toContain('no financial advice');
    expect(allCopy).toContain('introduction');
  });
  it('carries the risk note: short-term, secured, costs more, mostly unregulated', () => {
    const risk = BRIDGING.risk.items.join(' ').toLowerCase();
    expect(risk).toContain('short-term');
    expect(risk).toContain('secured');
    expect(risk).toContain('costs more');
    expect(risk).toContain('fca');
    expect(risk).toContain('lose the property');
  });
  it('the not-yet email helps and never rejects or advises', () => {
    const email = BRIDGING.notYetEmail.body.join(' ').toLowerCase();
    expect(email).not.toContain('reject');
    expect(email).not.toContain('you should');
    expect(email).toContain('analyser');
    expect(email).toContain('area data');
    expect(email).toContain('youtube');
  });
  it('no one can be asked to consent to sharing data with an unnamed broker', () => {
    // The form only renders when brokerReady(); placeholders keep it shut.
    if (brokerReady()) {
      for (const v of [BROKER.name, BROKER.email, BROKER.inbox]) {
        expect(v).not.toContain('TBC');
        expect(v).not.toContain('example.com');
      }
      expect(BROKER.kitTagQualified.trim()).not.toBe('');
      expect(BROKER.kitTagNotYet.trim()).not.toBe('');
    } else {
      expect(BROKER.name + BROKER.email + BROKER.inbox).toMatch(/TBC|example\.com/);
    }
  });

  it('every reason a person can be told has a line of its own', () => {
    const keys = [
      'loan-below-minimum', 'deposit-below-minimum', 'no-property-yet', 'no-repayment-route',
      'just-researching', 'story-too-short', 'story-too-few-words', 'story-repetitive', 'story-no-repayment-route',
    ];
    for (const k of keys) expect(BRIDGING.result.reasons[k], k).toBeTruthy();
  });
});
