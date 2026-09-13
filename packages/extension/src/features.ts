/**
 * THE EXTENSION'S FEATURE FLAGS — one file, the same rule the web app follows
 * (Reversibility charter rule 1). The web's flags live in
 * packages/web/src/config/features.ts and are documented in
 * docs/FEATURE_FLAGS.md; these are the extension's, documented in
 * docs/EXTENSION_FLAGS.md, and a test holds the two in step.
 *
 * Separate files because they are separate products with separate release
 * cycles: the web app deploys in a minute, the extension waits on a store
 * review. A flag that cannot be turned off at the same speed as its neighbour
 * has no business sharing a switchboard with it.
 */
export interface ExtensionFeatures {
  /**
   * T1 — the floorplan room tracer. A trace surface in the side panel where the
   * user taps the corners of one room over the listing's own floorplan and gets
   * its area, with a loupe so their finger never hides the corner. Everything it
   * owns lives in src/traceplan/ and nothing outside imports its internals.
   *
   * Off: the panel is exactly what it is today — the existing measure tool is
   * untouched, no trace surface is built, no module code runs, and nothing
   * about the plan image changes. Nothing is persisted either way this sprint.
   */
  traceplan: boolean;
}

export const extensionFeatures: ExtensionFeatures = {
  traceplan: true,
};
