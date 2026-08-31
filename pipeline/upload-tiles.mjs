/**
 * Upload the England & Wales PMTiles extract to R2 (S7.1). The ~1.1GB file
 * exceeds wrangler's put cap, so this uses R2's S3-compatible endpoint with
 * credentials DERIVED from CLOUDFLARE_API_TOKEN (same derivation as
 * upload.mjs), streaming the file in one PUT (S3 single-PUT limit 5GB).
 * Runs in CI via .github/workflows/map-tiles.yml — the yearly refresh path
 * (docs/MAP_OPERATOR_NOTE.md).
 */
import { createHash, createHmac } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { request } from 'node:https';

const BUCKET = 'gil-bricks-data';
const KEY = 'map/ew.pmtiles';
const FILE = process.argv[2] ?? 'pipeline/.data/map/ew.pmtiles';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!TOKEN || !ACCOUNT) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required (CI secrets).');
  process.exit(1);
}

const verify = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/tokens/verify`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
const vBody = await verify.json();
if (!verify.ok || !vBody.success || vBody.result?.status !== 'active') {
  throw new Error(`token verification failed: HTTP ${verify.status}`);
}
const accessKeyId = vBody.result.id;
const secretKey = createHash('sha256').update(TOKEN).digest('hex');
const host = `${ACCOUNT}.r2.cloudflarestorage.com`;

const size = statSync(FILE).size;
console.log(`uploading ${FILE} (${(size / 1e6).toFixed(0)} MB) → r2://${BUCKET}/${KEY}`);

const sha256hex = (d) => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();

// Streaming upload → UNSIGNED-PAYLOAD (valid for sigv4 over HTTPS).
const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const date = now.slice(0, 8);
const payloadHash = 'UNSIGNED-PAYLOAD';
const path = `/${BUCKET}/${KEY}`;
const canonical = ['PUT', path, '', `host:${host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${now}`, '', 'host;x-amz-content-sha256;x-amz-date', payloadHash].join('\n');
const scope = `${date}/auto/s3/aws4_request`;
const sts = ['AWS4-HMAC-SHA256', now, scope, sha256hex(canonical)].join('\n');
const key4 = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, date), 'auto'), 's3'), 'aws4_request');
const sig = createHmac('sha256', key4).update(sts).digest('hex');

await new Promise((resolve, reject) => {
  const req = request(
    {
      host,
      path,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
        'x-amz-date': now,
        'x-amz-content-sha256': payloadHash,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`,
      },
    },
    (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 200) resolve(undefined);
        else reject(new Error(`PUT failed: HTTP ${res.statusCode} ${body.slice(0, 300)}`));
      });
    },
  );
  req.on('error', reject);
  createReadStream(FILE).pipe(req);
});
console.log('upload complete');
