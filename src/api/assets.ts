type AssetName = 'calendar' | 'logbook' | 'expenses';
type AssetScope = 'user' | 'shared';

export type AssetEnvelope<TItem = any> = {
  version: number;
  updatedAt: number;
  items: TItem[];
};

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

export async function fetchAsset<TItem>(asset: AssetName, scope: AssetScope = 'user'): Promise<AssetEnvelope<TItem>> {
  const baseUrl = getBaseUrl();
  const token = getToken();

  const res = await fetch(`${baseUrl}/api/assets?asset=${encodeURIComponent(asset)}&scope=${encodeURIComponent(scope)}` , {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Asset ${asset} konnte nicht geladen werden`);
  }

  const data = json.data as AssetEnvelope<TItem>;
  return {
    version: typeof data?.version === 'number' ? data.version : 1,
    updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : Date.now(),
    items: Array.isArray(data?.items) ? data.items : []
  };
}

export async function saveAsset<TItem>(asset: AssetName, envelope: AssetEnvelope<TItem>, scope: AssetScope = 'user'): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = getToken();

  const res = await fetch(`${baseUrl}/api/assets?asset=${encodeURIComponent(asset)}&scope=${encodeURIComponent(scope)}` , {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(envelope)
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || `Asset ${asset} konnte nicht gespeichert werden`);
  }
}
