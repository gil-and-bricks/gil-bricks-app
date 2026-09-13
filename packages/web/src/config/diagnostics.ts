/**
 * THE DIAGNOSTIC PAGE'S WORDS (M2).
 *
 * Plain enough to read aloud down a phone line, because that is what it is for:
 * the operator opens it, reads it back, and we both stop guessing.
 */
export const DIAGNOSTICS = {
  title: 'Diagnostics',
  description: 'What this browser can and cannot load.',
  heading: 'What your browser can see',
  intro: 'Everything here is measured in the browser you opened it with. Nothing is stored or sent.',

  /** The one host the refurb photos and floor plans come from. */
  host: 'media.rightmove.co.uk',

  policy: {
    heading: 'The security policy your browser received',
    lead: 'Fetched fresh, not from cache.',
    none: 'No Content-Security-Policy header was sent with this page.',
    unreadable: 'Could not read the policy:',
    named: (host: string): string => `✓ ${host} IS allowed to load images here.`,
    notNamed: (host: string): string => `✗ ${host} is NOT in img-src. Images from it will be refused.`,
    noMeta: '✓ No second policy in a meta tag — the header is the only one.',
    hasMeta: (n: number): string => `✗ ${n} meta-tag policy found. Two policies apply together, and the stricter wins.`,
  },

  image: {
    heading: 'Loading a real listing photo',
    lead: 'The same request the refurb section makes, to the same server.',
    url: 'https://media.rightmove.co.uk/property-photo/d0997424f/91604028/d0997424f09721ef340eb299b00b0dfd.jpeg',
    ok: (w: number, h: number): string => `✓ Loaded. ${w}×${h} pixels. This browser can display Rightmove images.`,
    blocked: '✗ Refused by the security policy. The exact refusal is below.',
    failed: '✗ Did not load, and the policy did not refuse it — so it is the network or the image itself.',
    noViolations: '(none — the browser refused nothing on this page)',
  },

  handoff: {
    heading: 'What your analyser link is carrying',
    lead: 'Paste the address of an analyser tab. This checks whether the extension put the photos in it.',
    label: 'Analyser address',
    placeholder: 'https://…/buy-to-let/analyser/?postcode=…',
    button: 'Check this link',
    empty: 'Paste an address first.',
    notAUrl: 'That is not a web address.',
    photosLabel: 'photos in the link:',
    planLabel: 'floor plan in the link:',
    absent: 'none',
    verdict: (photos: number, plan: boolean): string =>
      photos === 0 && !plan
        ? '✗ This link carries NO photos and NO floor plan. Nothing was sent, so there is nothing for the page to show.'
        : `✓ This link carries ${photos} photo${photos === 1 ? '' : 's'}${plan ? ' and a floor plan' : ' but no floor plan'}.`,
  },

  copy: {
    heading: 'Send this back',
    lead: 'One block with everything above in it.',
    button: 'Copy the report',
  },
} as const;
