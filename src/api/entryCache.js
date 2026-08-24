// src/api/entryCache.js
//
// The two-tier (memory + Web Storage) cache-entry engine shared by the
// dashboard's two caches: the GET cache in ./http.js and the SWR cache behind
// ../hooks/useCachedFetch.js. Both had their own byte-for-byte copy of this
// logic — read-through with expiry eviction, storage hydration, quota-safe
// writes, prefix invalidation — which is subtle enough that a fix in one would
// silently miss the other. (The session-scope desync bug fixed earlier was
// exactly that failure mode.)
//
// Each caller keeps what genuinely differs:
//   • storagePrefix — the two caches deliberately own separate namespaces.
//   • deriveKey     — http.js scopes at the call site and passes identity here;
//                     useCachedFetch scopes per call (session::tenant::key).
//   • unscopeKey    — inverse of deriveKey, used to match a caller-supplied
//                     prefix against the raw (unscoped) key.
//   • persistence   — which Web Storage backs the second tier. See the option
//                     below: session (dies with the tab) vs local (survives to
//                     the next sign-in).
//
// Every instance owns its own memory Map; instances never share state.

function now() {
  return Date.now();
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isEntryExpired(entry, storageMaxAgeMs) {
  if (!entry || !entry.ts) return true;
  return now() - Number(entry.ts) > storageMaxAgeMs;
}

export function createEntryCache({
  storagePrefix,
  deriveKey = (key) => String(key ?? ""),
  unscopeKey = (key) => key,
  // "session" (default) keeps the old behaviour: entries die with the tab.
  // "local" survives tab close and sign-out, which is what a cache has to do
  // to be worth anything on the NEXT login — sessionStorage guarantees every
  // first visit of the day paints an empty dashboard and waits on the network.
  //
  // Only opt in where the payload is a view the same operator will look at
  // again, and only alongside the two guards that make it safe: keys are
  // partitioned by session scope (subject:email) so another principal on this
  // browser can never read these entries, and performLogout() clears the cache
  // outright. Entries are still bounded by the caller's storageMaxAgeMs.
  persistence = "session",
}) {
  const memCache = new Map();

  /**
   * The backing Storage, or null when unavailable. Access is wrapped because
   * both stores throw on access (not just on write) in some privacy modes and
   * in sandboxed iframes — a cache must degrade to memory-only there, never
   * take the page down.
   */
  function store() {
    if (typeof window === "undefined") return null;
    try {
      return persistence === "local"
        ? window.localStorage ?? null
        : window.sessionStorage ?? null;
    } catch {
      return null;
    }
  }

  function storageKeyFor(scopedKey) {
    return `${storagePrefix}${scopedKey}`;
  }

  /**
   * Read-through: memory first, then Web Storage (hydrating memory on a
   * hit). An entry past `storageMaxAgeMs` is evicted from both tiers and read
   * as a miss. Returns the raw `{data, ts}` entry, or null.
   */
  function read(key, storageMaxAgeMs) {
    const scopedKey = deriveKey(key);

    if (memCache.has(scopedKey)) {
      const entry = memCache.get(scopedKey);
      if (!isEntryExpired(entry, storageMaxAgeMs)) return entry;
      memCache.delete(scopedKey);
    }

    const storage = store();
    if (!storage) return null;

    try {
      const raw = storage.getItem(storageKeyFor(scopedKey));
      if (!raw) return null;

      const parsed = safeJsonParse(raw);
      if (!parsed || isEntryExpired(parsed, storageMaxAgeMs)) {
        storage.removeItem(storageKeyFor(scopedKey));
        return null;
      }

      memCache.set(scopedKey, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  /** Write both tiers. A storage failure (quota, non-serializable) is
   *  non-fatal — the memory tier still serves the rest of the tab session. */
  function write(key, data) {
    const scopedKey = deriveKey(key);
    const entry = { data, ts: now() };

    memCache.set(scopedKey, entry);

    const storage = store();
    if (!storage) return entry;

    try {
      storage.setItem(storageKeyFor(scopedKey), JSON.stringify(entry));
    } catch {
      // Non-fatal — see above.
    }

    return entry;
  }

  /** Drop exactly one entry from both tiers. */
  function invalidate(key) {
    if (!key) return;
    const scopedKey = deriveKey(key);
    memCache.delete(scopedKey);

    const storage = store();
    if (!storage) return;
    try {
      storage.removeItem(storageKeyFor(scopedKey));
    } catch {
      // best effort
    }
  }

  /** Drop every entry whose UNSCOPED key starts with `prefix`. */
  function invalidatePrefix(prefix) {
    if (!prefix) return;

    Array.from(memCache.keys()).forEach((scopedKey) => {
      if (unscopeKey(scopedKey).startsWith(prefix)) memCache.delete(scopedKey);
    });

    const storage = store();
    if (!storage) return;

    try {
      const toRemove = [];
      for (let i = 0; i < storage.length; i += 1) {
        const storageKey = storage.key(i);
        if (
          storageKey &&
          storageKey.startsWith(storagePrefix) &&
          unscopeKey(storageKey.slice(storagePrefix.length)).startsWith(prefix)
        ) {
          toRemove.push(storageKey);
        }
      }
      toRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // best effort
    }
  }

  /** Wipe every entry this cache owns, in both tiers. */
  function clear() {
    memCache.clear();

    const storage = store();
    if (!storage) return;

    try {
      const toRemove = [];
      for (let i = 0; i < storage.length; i += 1) {
        const storageKey = storage.key(i);
        if (storageKey && storageKey.startsWith(storagePrefix)) toRemove.push(storageKey);
      }
      toRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // best effort
    }
  }

  return { read, write, invalidate, invalidatePrefix, clear, memCache };
}
