/** Saved-deals rules shared by S6.1/S6.2. */

export const MAX_DEALS_PER_USER = 100;

/** Can this user save another deal? (Cap enforced in code, not schema.) */
export function canSaveAnotherDeal(currentCount: number): boolean {
  return currentCount < MAX_DEALS_PER_USER;
}
