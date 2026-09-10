/**
 * SHARE ON WHATSAPP — and only ever WhatsApp.
 *
 * The button names WhatsApp, so it must open WhatsApp. It used to call the Web
 * Share API whenever the browser had one and only fall back to WhatsApp when it
 * did not. On a Mac that is the macOS panel offering Mail, Messages, Notes and
 * Freeform; on a phone it is the OS sheet. Either way a menu stood between the
 * person and the one app the button had named, and WhatsApp was a guess away.
 *
 * WhatsApp's own share link needs no menu. Handed this URL, WhatsApp opens the
 * desktop app when the person has one and WhatsApp Web when they do not — its
 * routing to do, not ours to decide for them.
 *
 * NEVER reach for the Web Share API here or anywhere else. whatsapp.test.ts
 * reads every source file in all three packages and fails if a call comes back,
 * on any surface — which is why this note names it in words, not in code.
 */

/** WhatsApp's own click-to-chat endpoint. No recipient, so WhatsApp asks who. */
const WHATSAPP_SHARE = 'https://wa.me/';

/** The share URL for a message. The link is part of `text` — WhatsApp makes any
 *  URL in the message tappable, so it needs no separate parameter. */
export function whatsappShareUrl(text: string): string {
  return `${WHATSAPP_SHARE}?text=${encodeURIComponent(text)}`;
}

/**
 * Open WhatsApp in a new tab.
 *
 * SYNCHRONOUS on purpose. It is called straight out of the click, so the
 * browser still sees a user gesture and never treats it as a blocked popup.
 * The old code reached its WhatsApp line only after the Web Share call had
 * rejected — by then the gesture was spent and the tab could be blocked,
 * which is how "I pressed it and nothing happened" used to be possible.
 */
export function openWhatsApp(text: string): void {
  window.open(whatsappShareUrl(text), '_blank', 'noopener');
}
