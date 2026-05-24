/**
 * High-performance, IndexedDB-backed offline persistent audio cache
 * Saves synthesized audio base64 streams securely to prevent repetitive API requests and quota exhaustion.
 */

const DB_NAME = "StudioAudioCacheDB";
const STORE_NAME = "AudioCacheStore";
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
const memoryCache: Record<string, string> = {};

/**
 * Initializes the IndexedDB database safely, handling incognito mode blocks gracefully.
 */
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }

    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event: any) => {
        dbInstance = event.target.result;
        resolve(dbInstance!);
      };

      request.onerror = (event: any) => {
        console.warn("IndexedDB failed to open, reverting to memory caching:", event.target.error);
        reject(event.target.error);
      };
    } catch (e) {
      console.warn("IndexedDB initialization threw, reverting to memory-only:", e);
      reject(e);
    }
  });
}

/**
 * Generates a unique, reproducible cache key based on voice delivery specs
 */
function makeCacheKey(text: string, voice: string, emotion: string): string {
  const normalizedText = (text || "").trim().toLowerCase();
  const normalizedVoice = (voice || "").trim().toLowerCase();
  const normalizedEmotion = (emotion || "").trim().toLowerCase();
  return `${normalizedVoice}::${normalizedEmotion}::${normalizedText}`;
}

/**
 * Gets a cached audio data URL if present, otherwise returns null.
 */
export async function getCachedAudio(
  text: string,
  voice: string,
  emotion: string
): Promise<string | null> {
  const key = makeCacheKey(text, voice, emotion);

  // Check memory cache first
  if (memoryCache[key]) {
    return memoryCache[key];
  }

  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Keep memory cache hot
          memoryCache[key] = result;
          resolve(result);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    // Graceful fallback to null if db not initialized
    return null;
  }
}

/**
 * Saves a generated audio data URL to persistent cache.
 */
export async function setCachedAudio(
  text: string,
  voice: string,
  emotion: string,
  audioUrl: string
): Promise<void> {
  if (!audioUrl) return;
  const key = makeCacheKey(text, voice, emotion);

  // Update memory cache
  memoryCache[key] = audioUrl;

  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(audioUrl, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event: any) => {
        console.warn("IndexedDB put failed:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (err) {
    // Silently proceed on save errors (avoid breaking runtime logic)
    console.debug("Set audio cache skipped persistent storage due to:", err);
  }
}

/**
 * Clears all cached audio data.
 */
export async function clearAudioCache(): Promise<void> {
  // Clear memory cache
  for (const k of Object.keys(memoryCache)) {
    delete memoryCache[k];
  }

  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("Speech synthesis cache fully cleared.");
        resolve();
      };

      request.onerror = (event: any) => {
        reject(event.target.error);
      };
    });
  } catch (err) {
    console.warn("Clear audio cache failed:", err);
  }
}
