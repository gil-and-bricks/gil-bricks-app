/** THROWAWAY refuter probe — delete after running. */
import { describe, expect, it } from 'vitest';
import { todayLine, rankUrgent, datesOn } from './urgency';
import type { BoardDeal } from './board';
import { features } from '../../config/features';

const NOW = Date.parse('2026-09-20T12:00:00Z');
const daysAgo = (n: number): string => new Date(NOW - n * 86_400_000).toISOString();
const tomorrow = new Date(NOW + 86_400_000).toISOString().slice(0, 10);

const d = {
  id: 'x', strategy: 'btl', title: '12 High St',
  url_params: 'postcode=CF37+1HR&paon=12&price=150000&type=T&rent=1200&refurbCost=30000',
  stage: 'worth-a-look', current_score: 7.2, status: 'live',
  headline_figure: 'ROI 8%', key_figure: 'ROI 8%', stage_since: daysAgo(0),
  is_auction: false, verdict_line: 'Cashflows.', updated_at: daysAgo(0),
  sold_evidence: '{"estimate":157500,"high":172500}',
  chase_date: tomorrow,
} as unknown as BoardDeal;

describe('FINDING: dealDates=false still lets a stored date own the today line', () => {
  it('flag ON: the deadline line is produced (positive control)', () => {
    features.dealDates = true;
    const line = todayLine({ deals: [d], facts: [], changes: [], now: NOW });
    console.log('FLAG ON  ->', JSON.stringify(line));
    expect(line.reason).toBe('deadline');
  });

  it('flag OFF: the deadline tier must be silent — FAILS if the finding is real', () => {
    features.dealDates = false;
    try {
      const line = todayLine({ deals: [d], facts: [], changes: [], now: NOW });
      const ranked = rankUrgent({ deals: [d], facts: [], changes: [], now: NOW });
      console.log('FLAG OFF ->', JSON.stringify(line));
      console.log('FLAG OFF ranked reasons ->', JSON.stringify(ranked.map((r) => r.reason)));
      console.log('datesOn still reads the column ->', JSON.stringify(datesOn(d)));
      expect(line.reason).not.toBe('deadline');
      expect(line.text).not.toContain('chase date');
      expect(ranked.some((r) => r.reason === 'deadline')).toBe(false);
    } finally {
      features.dealDates = true;
    }
  });
});
