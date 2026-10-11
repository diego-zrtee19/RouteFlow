const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {prepareSchema} = require('../scripts/prepare-production-schema.cjs');
test('new production schema excludes incompatible V2 and inventory repair',()=>{
 const {sql,manifest}=prepareSchema();
 assert.equal(manifest.mode,'EMPTY_DATABASE_ONLY');assert.equal(manifest.remoteExecuted,false);
 assert.ok(manifest.sources.every(s=>!s.name.includes('v2')&&!s.name.includes('v4_stock')));
 assert.match(sql,/Empty RouteFlow database required/);
 assert.match(sql,/stock SET DEFAULT 0/);
 assert.doesNotMatch(sql,/UPDATE products\s+SET stock = 10/);
});
test('schema review artifact has exactly one transaction and verifiable source hashes',()=>{
 const {sql,manifest}=prepareSchema();
 assert.equal(sql.match(/^BEGIN;$/gm).length,1);assert.equal(sql.match(/^COMMIT;$/gm).length,1);
 assert.equal(manifest.sqlSha256,createHash('sha256').update(sql).digest('hex'));
 assert.ok(manifest.sources.every(s=>/^[0-9a-f]{64}$/.test(s.sha256)));
 assert.match(sql,/claim_refund_request/);assert.match(sql,/complete_coordinated_delivery/);
});
