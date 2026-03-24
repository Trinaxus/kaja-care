import type { Profile } from './database.types';

const KNOWN_BY_ID: Record<string, { name: string; color: Profile['color'] }> = {
  '0d57db28-7e41-4a50-b3ea-2b3fc0708750': { name: 'Lisa', color: 'green' },
  '75a87153-16f4-4517-9b90-30502b190235': { name: 'Martin', color: 'blue' },
};

export function resolveProfileById(profiles: Profile[], id: string): Profile | null {
  const found = profiles.find((p) => p.id === id);
  if (found) return found;

  const known = KNOWN_BY_ID[id];
  if (!known) return null;

  const byName = profiles.find((p) => String(p.name || '').trim().toLowerCase() === known.name.toLowerCase());

  const nowIso = new Date().toISOString();
  return {
    id,
    name: known.name,
    color: (byName?.color as Profile['color']) || known.color,
    email: null,
    preferences: {},
    created_at: nowIso,
    updated_at: nowIso,
  };
}
