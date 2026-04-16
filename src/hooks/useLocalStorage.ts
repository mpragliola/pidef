/**
 * src/hooks/useLocalStorage.ts
 *
 * A thin wrapper around React's useState that automatically synchronises the
 * state value with localStorage.  This allows settings (brightness, rotation,
 * bookmark display mode, etc.) to survive page reloads and app restarts
 * without requiring a dedicated persistence layer.
 *
 * Why JSON serialisation?
 * localStorage can only store strings.  Using JSON.stringify / JSON.parse lets
 * us transparently store any JSON-serialisable TypeScript value (booleans,
 * numbers, objects, arrays) and get back the correctly typed value on read.
 * A try/catch on both directions guards against a corrupted or unexpected
 * stored value without crashing the app.
 */

import { useState, useCallback } from 'react';

/**
 * Persisted state hook backed by localStorage.
 *
 * @typeParam T — The type of the stored value.  Must be JSON-serialisable.
 *
 * @param key          - The localStorage key to read from and write to.
 * @param defaultValue - Value used when the key is absent or unreadable.
 *
 * @returns A `[value, setValue]` tuple identical in shape to `useState`,
 *          except that calling `setValue` also writes to localStorage.
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    // Lazy initialiser: this function runs once when the component first
    // mounts and is never called again on subsequent re-renders.  Passing
    // the initialiser as a function (rather than a plain value) is important
    // here because localStorage.getItem() is a synchronous I/O call — doing
    // it outside an initialiser would re-run it on every render cycle.
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;  // key not yet set → use default
      return JSON.parse(item) as T;
    } catch {
      // JSON.parse can throw if the stored string is malformed (e.g. the
      // localStorage entry was written by an older version of the app).
      // Fall back to the default so the app stays functional.
      return defaultValue;
    }
  });

  const setValue = useCallback((value: T) => {
    setState(value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore — e.g. storage quota exceeded or private-browsing restrictions
    }
    // `key` is the only dependency: if the caller ever changes the key prop
    // (unlikely in practice, but possible), we need a fresh callback that
    // closes over the new key so writes go to the right localStorage entry.
  }, [key]);

  return [state, setValue];
}
