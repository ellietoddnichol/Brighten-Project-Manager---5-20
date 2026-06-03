const cache = new Map<string, unknown>();

/** Load JSON from /mock-data/* (static assets, not bundled into JS). */
export async function loadMockDataJson<T>(relativePath: string): Promise<T> {
  const normalized = relativePath.replace(/^\/+/, '');
  const url = `/mock-data/${normalized}`;
  if (cache.has(url)) return cache.get(url) as T;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to load mock data (${resp.status}): ${url}`);
  }
  const data = (await resp.json()) as T;
  cache.set(url, data);
  return data;
}

/** Lazy loader for seed JSON used by Settings import tools. */
export function createLazyJsonLoader<T>(relativePath: string) {
  let loaded: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    peek(): T | null {
      return loaded;
    },
    async get(): Promise<T> {
      if (loaded) return loaded;
      if (!pending) {
        pending = loadMockDataJson<T>(relativePath).then(data => {
          loaded = data;
          return data;
        });
      }
      return pending;
    },
  };
}
