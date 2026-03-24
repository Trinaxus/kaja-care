export type CollectionName =
  | 'care_assignments'
  | 'care_day_preferences'
  | 'care_day_events'
  | 'care_day_notes'
  | 'handovers'
  | 'availability'
  | 'short_visits'
  | 'activity_log'
  | 'messages'
  | 'requests'
  | 'expenses'
  | 'logbook_entries'
  | 'profile_settings';

export type CollectionFilter = Record<string, string | number | boolean | Array<string | number | boolean>>;

function getBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_SERVER_BASE_URL as string | undefined;
  if (!baseUrl) {
    throw new Error('Server URL fehlt (VITE_SERVER_BASE_URL)');
  }
  return baseUrl;
}

function getToken(): string {
  const token = localStorage.getItem('authToken') || '';
  if (!token) {
    throw new Error('Kein Token gefunden. Bitte neu anmelden.');
  }
  return token;
}

export async function listItems<T>(name: CollectionName, filter: CollectionFilter = {}): Promise<T[]> {
  const baseUrl = getBaseUrl();
  const token = getToken();

  const url = new URL(`${baseUrl}/api/collections`);
  url.searchParams.set('name', name);
  if (filter && Object.keys(filter).length > 0) {
    url.searchParams.set('filter', JSON.stringify(filter));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Collection ${name} konnte nicht geladen werden`);
  }

  return Array.isArray(json.items) ? (json.items as T[]) : [];
}

export async function upsertItems<T extends Record<string, any>>(
  name: CollectionName,
  items: T | T[],
  keyFields: string[] = []
): Promise<T[]> {
  const baseUrl = getBaseUrl();
  const token = getToken();

  const body = {
    items: Array.isArray(items) ? items : [items],
    keyFields
  };

  const res = await fetch(`${baseUrl}/api/collections?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Collection ${name} konnte nicht gespeichert werden`);
  }

  return Array.isArray(json.items) ? (json.items as T[]) : [];
}

export async function deleteItems(name: CollectionName, filter: CollectionFilter): Promise<number> {
  const baseUrl = getBaseUrl();
  const token = getToken();

  const res = await fetch(`${baseUrl}/api/collections?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ filter })
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Collection ${name} konnte nicht gelöscht werden`);
  }

  return typeof json.deleted === 'number' ? json.deleted : 0;
}
