const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function prepareSchema(root = process.cwd()) {
  const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
    .filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!migrations.length) throw Error('No migrations found');
  const sources = ['supabase_schema_v3.sql', 'supabase_schema_v5_sellers_pii.sql',
    'supabase_schema_v6_webhook_reliability.sql', ...migrations.map(name => `supabase/migrations/${name}`)];
  const files = sources.map(name => {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    return {name, text, sha256: createHash('sha256').update(text).digest('hex')};
  });
  // This is a review package for a NEW empty Supabase project, never an upgrade.
  // Do not run legacy V2 (store_id) against canonical V3 (seller_id), and do not
  // replay V4's stock repair, which overwrites intentional sold-out inventory.
  const guard = `DO $$ BEGIN
 IF to_regclass('public.sellers') IS NOT NULL OR to_regclass('public.products') IS NOT NULL
    OR to_regclass('public.orders') IS NOT NULL OR to_regclass('public.stores') IS NOT NULL THEN
   RAISE EXCEPTION 'Empty RouteFlow database required. Use reviewed incremental migrations for existing data.';
 END IF;
END $$;`;
  const stripTransactions = text => text.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '');
  const sql = ['-- REVIEW PACKAGE: NEW empty Supabase database only. No execution is performed by this script.',
    '-- Preserve backup and verify restore before applying to any production target.', 'BEGIN;', guard,
    ...files.map(f => `-- SOURCE: ${f.name}\n${stripTransactions(f.text)}`),
    // Zero is the safe default: the seller sets actual stock in the product form.
    "ALTER TABLE public.products ALTER COLUMN stock SET DEFAULT 0;",
    "ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_non_negative;",
    "ALTER TABLE public.products ADD CONSTRAINT products_stock_non_negative CHECK (stock >= 0);",
    'GRANT USAGE ON SCHEMA public TO service_role;',
    'GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;',
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;', 'COMMIT;', ''].join('\n\n');
  return {sql,manifest:{mode:'EMPTY_DATABASE_ONLY',remoteExecuted:false,
    excludedLegacyFiles:['supabase_schema_v2.sql','supabase_migrate_v2_clerk.sql','supabase_schema_v4_stock.sql'],
    sources:files.map(({name,sha256})=>({name,sha256})),sqlSha256:createHash('sha256').update(sql).digest('hex')}};
}
if (require.main === module) {
  const result = prepareSchema();
  const directory = path.join(process.cwd(), '.routeflow-data', 'production-package');
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'bootstrap.sql'),result.sql);
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(result.manifest,null,2));
  console.log(`Prepared ${result.manifest.sources.length} schema sources in ${directory}. No database changed. Execution on a clean Supabase project still needs verification.`);
}
module.exports = { prepareSchema };
