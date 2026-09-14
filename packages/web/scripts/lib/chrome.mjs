/**
 * DM1 — LAUNCH ARGUMENTS SHARED BY EVERY BROWSER GATE.
 *
 * WHY A RESOLVER OVERRIDE EXISTS AT ALL. The gates run against the LIVE site,
 * and the first time they are pointed at a brand-new domain the machine running
 * them may not resolve it yet: a resolver that has already been asked for the
 * name caches the negative answer for the zone's SOA minimum, and some
 * resolvers refresh that on every subsequent miss, so it can outlast the
 * cutover by a long way. That is a fact about the runner's DNS, not about the
 * product — and a gate that cannot be run is a gate that does not bite.
 *
 * With RESOLVE set, Chrome is told where the host lives and the request is
 * otherwise completely real: real TLS, real SNI, real Host header, real
 * certificate validation against the real name. It proves everything except DNS
 * itself, which is why the gates PRINT that they are using it rather than
 * quietly passing — an override nobody can see is how a gate starts lying.
 *
 *   RESOLVE="proplaunch.ai:104.21.18.245" npm run map-gate -w packages/web
 *
 * The same technique the extension gate already uses to serve saved portal
 * pages under the portals' own hostnames.
 */
export function chromeArgs(extra = []) {
  const rule = process.env.RESOLVE ?? '';
  if (rule === '') return ['--no-sandbox', ...extra];
  const maps = rule.split(',').map((r) => {
    const [host, ip] = r.split(':');
    if (!host || !ip) throw new Error(`RESOLVE must be host:ip[,host:ip] — got "${r}"`);
    return `MAP ${host.trim()} ${ip.trim()}`;
  });
  console.log(`    ⚠ DNS OVERRIDDEN for this run: ${maps.join(', ')} — TLS and Host are still real, DNS is not being tested`);
  return ['--no-sandbox', `--host-resolver-rules=${maps.join(', ')}`, ...extra];
}
