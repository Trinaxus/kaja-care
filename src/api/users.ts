export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  color: string;
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

export async function fetchUsers(): Promise<PublicUser[]> {
  const baseUrl = getBaseUrl();
  const token = getToken();

  const res = await fetch(`${baseUrl}/api/users`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || 'User konnten nicht geladen werden');
  }

  return Array.isArray(json.users) ? (json.users as PublicUser[]) : [];
}
