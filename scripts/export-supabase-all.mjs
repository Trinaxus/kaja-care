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
    writeBackend: false,
    backendDataDir: '',
    importDir: '',
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
    else if (a === '--write-backend') args.writeBackend = true;
    else if (a === '--backend-data-dir' && argv[i + 1]) args.backendDataDir = argv[++i];
    else if (a === '--import-dir' && argv[i + 1]) args.importDir = argv[++i];
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

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(raw);
    return json;
  } catch {
    return fallback;
  }
}

function mergeCollectionsStore(existingStore, nextStore) {
  const existingItems = Array.isArray(existingStore?.items) ? existingStore.items : [];
  const nextItems = Array.isArray(nextStore?.items) ? nextStore.items : [];

  const map = new Map();
  for (const it of existingItems) {
    if (it && typeof it === 'object' && it.id != null) {
      map.set(String(it.id), it);
    }
  }
  for (const it of nextItems) {
    if (it && typeof it === 'object' && it.id != null) {
      map.set(String(it.id), it);
    }
  }

  return {
    version: 1,
    updatedAt: Math.floor(Date.now() / 1000),
    items: [...map.values()],
  };
}

function mapProfileIdFields(obj, idMap) {
  if (!obj || typeof obj !== 'object') return obj;

  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  const candidates = [
    'from_profile_id',
    'to_profile_id',
    'actor_id',
    'caretaker_id',
    'created_by',
    'from_user_id',
    'to_user_id',
    'brings_user_id',
    'picks_up_user_id',
    'visitor_id',
  ];

  for (const k of candidates) {
    if (out[k] == null) continue;
    const raw = String(out[k]);
    if (idMap.has(raw)) out[k] = idMap.get(raw);
  }

  return out;
}

async function mergeExportIntoBackend({ importDir, backendCollectionsDir, backendDataDir }) {
  const absImportDir = path.isAbsolute(importDir) ? importDir : path.join(process.cwd(), importDir);
  const exportCollectionsDir = path.join(absImportDir, 'shared', 'collections');

  // Build mapping: Supabase profile ids -> backend user ids (match by name/displayName)
  const exportProfiles = await readJsonSafe(path.join(absImportDir, 'profiles.json'), []);
  const backendUsersStore = await readJsonSafe(path.join(backendDataDir, 'users.json'), { users: [] });
  const backendUsers = Array.isArray(backendUsersStore?.users) ? backendUsersStore.users : [];

  const normalizeName = (v) => String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9äöüß ]/gi, '');

  const byName = new Map();
  for (const u of backendUsers) {
    if (!u || typeof u !== 'object') continue;
    const name = String(u.displayName || u.email || '').trim();
    if (!name) continue;
    const id = String(u.id || '');
    if (!id) continue;
    byName.set(normalizeName(name), id);
  }

  const idMap = new Map();
  if (Array.isArray(exportProfiles)) {
    for (const p of exportProfiles) {
      if (!p || typeof p !== 'object') continue;
      const pid = String(p.id || '').trim();
      const pname = String(p.name || '').trim();
      if (!pid || !pname) continue;
      const norm = normalizeName(pname);
      let uid = byName.get(norm);

      if (!uid) {
        // Partial match: exported name is often short (e.g. "Lisa") while backend may be "Lisa Müller".
        for (const [bn, bid] of byName.entries()) {
          if (bn === norm) {
            uid = bid;
            break;
          }
          if (bn.startsWith(norm) || bn.includes(norm)) {
            uid = bid;
            break;
          }
        }
      }

      if (uid) idMap.set(pid, uid);
    }
  }

  // Fallback: if both sides have same count, map by normalized name sorting.
  if (idMap.size === 0 && Array.isArray(exportProfiles) && exportProfiles.length > 0 && backendUsers.length === exportProfiles.length) {
    const exp = exportProfiles
      .filter((p) => p && typeof p === 'object' && p.id && p.name)
      .map((p) => ({ id: String(p.id), name: normalizeName(p.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const back = backendUsers
      .filter((u) => u && typeof u === 'object' && (u.id) && (u.displayName || u.email))
      .map((u) => ({ id: String(u.id), name: normalizeName(u.displayName || u.email) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (exp.length === back.length && exp.length > 0) {
      for (let i = 0; i < exp.length; i++) {
        idMap.set(exp[i].id, back[i].id);
      }
    }
  }

  if (idMap.size > 0) {
    console.log('Import: profile id mapping (supabase -> backend):');
    for (const [k, v] of idMap.entries()) {
      console.log(`  ${k} -> ${v}`);
    }
  } else {
    console.warn('Import: could not build profile id mapping; leaving ids unchanged (messages may be hidden).');
  }

  // Sync backend users.json displayName/color to match exported profiles.
  // This ensures /api/users (and therefore UI profile ids/names) align with imported collections ids.
  if (Array.isArray(exportProfiles) && exportProfiles.length > 0) {
    const usersById = new Map();
    const usersByName = new Map();
    for (const u of backendUsers) {
      if (!u || typeof u !== 'object') continue;
      const uid = String(u.id || '').trim();
      if (!uid) continue;
      usersById.set(uid, u);

      const uname = normalizeName(u.displayName || u.email || '');
      if (uname) {
        // keep the first match (stable)
        if (!usersByName.has(uname)) usersByName.set(uname, u);
      }
    }

    let changed = false;

    for (const p of exportProfiles) {
      if (!p || typeof p !== 'object') continue;
      const pid = String(p.id || '').trim();
      if (!pid) continue;

      const desiredName = String(p.name || '').trim();
      const desiredColor = String(p.color || '').trim() || 'blue';
      const desiredPreferences = (p.preferences && typeof p.preferences === 'object') ? p.preferences : null;

      const existing = usersById.get(pid);
      if (existing) {
        if (desiredName && String(existing.displayName || '').trim() !== desiredName) {
          existing.displayName = desiredName;
          changed = true;
        }
        if (String(existing.color || '').trim() !== desiredColor) {
          existing.color = desiredColor;
          changed = true;
        }
        if (existing.disabled == null) {
          existing.disabled = false;
          changed = true;
        }
        if (desiredPreferences && (existing.preferences == null || JSON.stringify(existing.preferences) !== JSON.stringify(desiredPreferences))) {
          existing.preferences = desiredPreferences;
          changed = true;
        }
        continue;
      }

      // If a backend user exists with the same displayName but different id, rewrite their id.
      const nameKey = normalizeName(desiredName);
      const byName = nameKey ? usersByName.get(nameKey) : null;
      if (byName && String(byName.id || '').trim() !== pid) {
        const oldId = String(byName.id || '').trim();

        // If another user already has pid, merge into that and drop the old.
        const conflict = usersById.get(pid);
        if (conflict && conflict !== byName) {
          // merge basic fields
          if (desiredName && String(conflict.displayName || '').trim() === '') conflict.displayName = desiredName;
          if (String(conflict.color || '').trim() === '') conflict.color = desiredColor;

          // remove the old duplicate
          const idx = backendUsers.indexOf(byName);
          if (idx >= 0) backendUsers.splice(idx, 1);
        } else {
          byName.id = pid;
          usersById.set(pid, byName);
        }

        if (desiredPreferences && (byName.preferences == null || JSON.stringify(byName.preferences) !== JSON.stringify(desiredPreferences))) {
          byName.preferences = desiredPreferences;
        }

        // cleanup old id mapping
        if (oldId) usersById.delete(oldId);
        changed = true;
        continue;
      }

      backendUsers.push({
        id: pid,
        email: '',
        displayName: desiredName || pid,
        accessRole: 'user',
        userType: 'audience',
        color: desiredColor,
        preferences: desiredPreferences || {},
        disabled: false,
      });
      changed = true;
    }

    if (changed) {
      await writeJson(path.join(backendDataDir, 'users.json'), { ...backendUsersStore, users: backendUsers });
      console.log('Import: users.json updated from export profiles');
    }
  }

  let files;
  try {
    files = await fs.readdir(exportCollectionsDir, { withFileTypes: true });
  } catch {
    throw new Error(`Import dir missing collections: ${exportCollectionsDir}`);
  }

  for (const f of files) {
    if (!f.isFile()) continue;
    if (!f.name.toLowerCase().endsWith('.json')) continue;

    const src = path.join(exportCollectionsDir, f.name);
    const dst = path.join(backendCollectionsDir, f.name);

    const nextStore = await readJsonSafe(src, null);
    if (!nextStore || typeof nextStore !== 'object') continue;

    if (Array.isArray(nextStore.items) && idMap.size > 0) {
      nextStore.items = nextStore.items.map((it) => mapProfileIdFields(it, idMap));
    }

    const existing = await readJsonSafe(dst, { version: 1, updatedAt: Math.floor(Date.now() / 1000), items: [] });
    const merged = mergeCollectionsStore(existing, nextStore);
    await writeJson(dst, merged);
  }
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

  const backendDataDir = args.backendDataDir
    ? (path.isAbsolute(args.backendDataDir) ? args.backendDataDir : path.join(process.cwd(), args.backendDataDir))
    : path.join(process.cwd(), 'server', 'data');

  const backendCollectionsDir = path.join(backendDataDir, 'shared', 'collections');

  if (args.importDir) {
    await ensureDir(backendCollectionsDir);
    await mergeExportIntoBackend({
      importDir: args.importDir,
      backendCollectionsDir,
      backendDataDir,
    });
    console.log('Import done. Source:', args.importDir);
    console.log('Backend collections dir:', backendCollectionsDir);
    return;
  }

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
      const store = toCollectionsStore(rows);
      await writeJson(path.join(collectionsDir, `${t}.json`), store);

      if (args.writeBackend) {
        const backendFile = path.join(backendCollectionsDir, `${t}.json`);
        const existing = await readJsonSafe(backendFile, { version: 1, updatedAt: Math.floor(Date.now() / 1000), items: [] });
        const merged = mergeCollectionsStore(existing, store);
        await writeJson(backendFile, merged);
      }
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
