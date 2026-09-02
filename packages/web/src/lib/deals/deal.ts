/** Saved-deal title + share text helpers (client side, pure). */
import type { UrlState } from '../../components/analyser/state';
import { fmtMoney } from '@gil-bricks/core';

const TYPE_WORDS: Record<string, string> = {
  D: 'Detached',
  S: 'Semi',
  T: 'Terraced',
  F: 'Flat',
  O: 'Property',
};

/** "Terraced · CF37 1HR · £150,000" (parts drop out when unknown). */
export function dealTitle(s: Pick<UrlState, 'type' | 'postcode' | 'price'>): string {
  const parts: string[] = [];
  if (s.type !== '' && TYPE_WORDS[s.type]) parts.push(TYPE_WORDS[s.type]);
  if (s.postcode.trim() !== '') parts.push(s.postcode.trim().toUpperCase());
  const price = Number(s.price);
  if (price > 0) parts.push(fmtMoney(price));
  return parts.length > 0 ? parts.join(' · ') : 'Saved deal';
}

/** Share text mirrors the analyser's: what + headline + link. */
export function dealShareText(title: string, keyFigure: string, url: string): string {
  const bits = [title];
  if (keyFigure !== '') bits.push(keyFigure);
  return `${bits.join(' — ')} ${url}`;
}
