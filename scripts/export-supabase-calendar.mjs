import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = { out: 'supabase-export', format: 'raw' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    } else if (a === '--format' && argv[i + 1]) {
      args.format = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function buildRestUrl(baseUrl, table, query) {
  const base = baseUrl.replace(/\/$/, '');
  const q = query ? `?${query}` : '';
  return `${base}/rest/v1/${table}${q}`;
}

async function supaGetJson({ baseUrl, anonKey, table, query }) {
  const url = buildRestUrl(baseUrl, table, query);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json'
    }
  });

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

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/export-supabase-calendar.mjs --out <dir> --format <raw|collections>\n\nEnv vars required:\n  VITE_SUPABASE_URL\n  VITE_SUPABASE_ANON_KEY`);
    process.exit(0);
  }

  const baseUrl = getEnv('VITE_SUPABASE_URL');
  const anonKey = getEnv('VITE_SUPABASE_ANON_KEY');

  const outDir = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);

  const tables = [
    'profiles',
    'care_assignments',
    'care_day_preferences',
    'care_day_events',
    'care_day_notes',
    'handovers',
    'availability',
    'short_visits'
  ];

  const results = {};
  for (const t of tables) {
    // default: export all rows
    results[t] = await supaGetJson({ baseUrl, anonKey, table: t, query: 'select=*' });
  }

  if (args.format === 'collections') {
    const collectionsDir = path.join(outDir, 'shared', 'collections');
    await ensureDir(collectionsDir);

    // profiles are not part of Collections API in your PHP backend; export separately
    await writeJson(path.join(outDir, 'profiles.json'), results.profiles);

    for (const t of tables) {
      if (t === 'profiles') continue;
      await writeJson(path.join(collectionsDir, `${t}.json`), toCollectionsStore(results[t]));
    }
  } else {
    for (const t of tables) {
      await writeJson(path.join(outDir, `${t}.json`), results[t]);
    }
  }

  const counts = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Array.isArray(v) ? v.length : null]));
  await writeJson(path.join(outDir, 'counts.json'), counts);

  console.log('Export done. Row counts:', counts);
  console.log('Output dir:', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
