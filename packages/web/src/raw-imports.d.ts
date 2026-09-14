/**
 * `?raw` IMPORTS, DECLARED WHERE TYPECHECK CAN ALWAYS SEE THEM.
 *
 * Vite serves `import x from './y.css?raw'` as a string, and the types for that
 * arrive through `vite/client` — which reaches this project only via
 * `.astro/types.d.ts`, a GENERATED file. So `tsc --noEmit` passed on any
 * machine that had already run a build and failed in CI, which typechecks
 * before building. Exactly the failure CLAUDE.md warns about for tests that
 * read build artefacts, in a new costume: the artefact here is a type.
 *
 * Declared in a committed file, so the check no longer depends on whether
 * somebody happened to build first.
 */
declare module '*?raw' {
  const contents: string;
  export default contents;
}
