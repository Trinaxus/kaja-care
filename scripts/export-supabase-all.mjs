import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    out: 'supabase-export-all',
    format: 'raw',
    migrations: '',
    include: '',
    url: '',
    anonKey: '',
    schema: '',
    discover: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--format' && argv[i + 1]) args.format = argv[++i];
    else if (a === '--migrations' && argv[i + 1]) args.migrations = argv[++i];
    else if (a === '--include' && argv[i + 1]) args.include = argv[++i];
    else if (a === '--url' && argv[i + 1]) args.url = argv[++i];
    else if ((a === '--anon-key' || a === '--anonKey') && argv[i + 1]) args.anonKey = argv[++i];
    else if (a === '--schema' && argv[i + 1]) args.schema = argv[++i];
    else if (a === '--discover') args.discover = true;
    else if (a === '--no-discover') args.discover = false;
    else if (a === '--help' || a === '-h') args.help = true;
  }

  return args;
}

function parseDotEnv(content) {
  const out = {};
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function loadEnvFromFiles(projectRoot) {
  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, 'server', '.env'),
    path.join(projectRoot, 'server', '.env.local'),
  ];

  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = parseDotEnv(content);
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] == null) process.env[k] = v;
      }
    } catch {
      // ignore missing/unreadable
    }
  }
}

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function assertNotPlaceholder(name, value) {
  const v = String(value || '').trim();
  if (!v) return;
  const upper = v.toUpperCase();
  if (upper.includes('DEINPROJEKT') || upper.includes('DEIN_ANON_KEY') || upper.includes('YOUR_')) {
    throw new Error(`Placeholder detected for ${name}. Please provide your real Supabase ${name}.`);
  }
}

function buildRestUrl(baseUrl, table, query) {
  const base = baseUrl.replace(/\/$/, '');
  const q = query ? `?${query}` : '';
  return `${base}/rest/v1/${table}${q}`;
}

function buildRestRootUrl(baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/rest/v1/`;
}

async function discoverExposedEntities({ baseUrl, anonKey, schema }) {
  const url = buildRestRootUrl(baseUrl);
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/openapi+json',
    ...(schema ? { 'Accept-Profile': schema, 'Content-Profile': schema } : {})
  };

  let res;
  try {
    res = await fetch(url, { method: 'GET', headers });
  } catch (e) {
    const msg = e && typeof e === 'object' && 'cause' in e && e.cause ? `${e.message} (cause: ${String(e.cause)})` : String(e?.message || e);
    throw new Error(`discover failed for ${url}: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`discover failed (${res.status}): ${text}`);
  }

  const spec = await res.json();
  const paths = spec && typeof spec === 'object' ? spec.paths : null;
  if (!paths || typeof paths !== 'object') return [];

  const names = new Set();
  for (const p of Object.keys(paths)) {
    // typical: "/table_name"
    if (!p || p === '/' || !p.startsWith('/')) continue;
    const seg = p.slice(1).split('/')[0];
    if (!seg) continue;
    // skip non-entities
    if (seg.startsWith('rpc/')) continue;
    if (seg === 'rpc') continue;
    names.add(seg);
  }

  return [...names].sort();
}

async function supaGetJson({ baseUrl, anonKey, schema, table, query }) {
  const url = buildRestUrl(baseUrl, table, query);
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
        ...(schema ? { 'Accept-Profile': schema, 'Content-Profile': schema } : {})
      }
    });
  } catch (e) {
    const msg = e && typeof e === 'object' && 'cause' in e && e.cause ? `${e.message} (cause: ${String(e.cause)})` : String(e?.message || e);
    throw new Error(`fetch failed for ${url}: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${table} failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function toCollectionsStore(items) {
  return {
    version: 1,
    updatedAt: Math.floor(Date.now() / 1000),
    items
  };
}

function extractTableNamesFromSql(sql) {
  const out = new Set();

  // CREATE TABLE [IF NOT EXISTS] <name>
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const name = m[1];
    if (!name) continue;
    // ignore auth/storage schemas and internal tables if they appear without schema
    if (name.startsWith('pg_')) continue;
    out.add(name);
  }

  return [...out];
}

async function listMigrationSqlFiles(migrationsDir) {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.sql'))
    .map((e) => path.join(migrationsDir, e.name))
    .sort();
}

const COLLECTIONS_TABLES = new Set([
  'care_assignments',
  'availability',
  'handovers',
  'care_day_preferences',
  'care_day_events',
  'care_day_notes',
  'short_visits',
  'activity_log',
  'messages',
  'requests',
  'expenses',
  'logbook_entries'
]);

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/export-supabase-all.mjs --out <dir> --format <raw|collections> --migrations <dir>\n\nAuth options (one of):\n  - set env vars VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY\n  - or pass --url <...> --anon-key <...>\n\nSchema options:\n  - default schema is public\n  - pass --schema <schema> (e.g. kajacare) or set SUPABASE_SCHEMA\n\nDiscovery options:\n  - default: --discover (reads /rest/v1/ OpenAPI and exports everything exposed)\n  - disable with --no-discover\n\nNote: script also auto-loads .env/.env.local and server/.env/server/.env.local if present.\n\nOptional:\n  --include profiles,care_assignments,... (comma-separated extra tables)`);
    process.exit(0);
  }

  await loadEnvFromFiles(process.cwd());

  if (args.url) process.env.VITE_SUPABASE_URL = args.url;
  if (args.anonKey) process.env.VITE_SUPABASE_ANON_KEY = args.anonKey;

  const baseUrl = getEnv('VITE_SUPABASE_URL');
  const anonKey = getEnv('VITE_SUPABASE_ANON_KEY');

  const schema = (args.schema || process.env.SUPABASE_SCHEMA || 'public').trim();

  assertNotPlaceholder('URL', baseUrl);
  assertNotPlaceholder('ANON_KEY', anonKey);

  const outDir = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
  await ensureDir(outDir);

  const tables = new Set();

  // Discover all entities exposed via PostgREST (tables/views).
  if (args.discover) {
    try {
      const discovered = await discoverExposedEntities({
        baseUrl,
        anonKey,
        schema: schema === 'public' ? '' : schema,
      });
      for (const t of discovered) tables.add(t);
    } catch (e) {
      const msg = String(e?.message || e);
      await writeJson(path.join(outDir, 'failures_discovery.json'), { error: msg });
      console.warn('Discovery failed, continuing without discovery:', msg);
    }
  }

  if (args.migrations) {
    const migDir = path.isAbsolute(args.migrations) ? args.migrations : path.join(process.cwd(), args.migrations);
    const files = await listMigrationSqlFiles(migDir);
    for (const f of files) {
      const sql = await fs.readFile(f, 'utf8');
      for (const t of extractTableNamesFromSql(sql)) tables.add(t);
    }
  }

  if (args.include) {
    for (const t of args.include.split(',').map((s) => s.trim()).filter(Boolean)) tables.add(t);
  }

  // Always include profiles for names
  tables.add('profiles');

  const tableList = [...tables].sort();
  await writeJson(path.join(outDir, 'tables.json'), tableList);

  const results = {};
  const failures = {};

  for (const t of tableList) {
    try {
      results[t] = await supaGetJson({ baseUrl, anonKey, schema: schema === 'public' ? '' : schema, table: t, query: 'select=*' });
    } catch (e) {
      failures[t] = String(e?.message || e);
    }
  }

  const counts = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Array.isArray(v) ? v.length : null]));
  await writeJson(path.join(outDir, 'counts.json'), counts);
  await writeJson(path.join(outDir, 'failures.json'), failures);

  if (args.format === 'collections') {
    // Write known Collections tables directly into the backend JSON store format.
    const collectionsDir = path.join(outDir, 'shared', 'collections');
    await ensureDir(collectionsDir);

    // profiles not part of Collections API in current backend; keep separate
    if (results.profiles) await writeJson(path.join(outDir, 'profiles.json'), results.profiles);

    for (const [t, rows] of Object.entries(results)) {
      if (t === 'profiles') continue;
      if (!COLLECTIONS_TABLES.has(t)) {
        // still write raw for everything else
        await writeJson(path.join(outDir, 'raw', `${t}.json`), rows);
        continue;
      }
      await writeJson(path.join(collectionsDir, `${t}.json`), toCollectionsStore(rows));
    }
  } else {
    for (const [t, rows] of Object.entries(results)) {
      await writeJson(path.join(outDir, `${t}.json`), rows);
    }
  }

  console.log('Export done. Tables:', tableList.length);
  console.log('Succeeded:', Object.keys(results).length, 'Failed:', Object.keys(failures).length);
  console.log('Output dir:', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
