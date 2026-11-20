import { useCallback, useSyncExternalStore } from 'react'

/**
 * Screen state that outlives the screen: the sidebar unmounts the page, so a wizard halfway
 * through (or the job it started) would be lost on every page switch. Kept in memory for the
 * renderer's lifetime only — a reload starts clean, and jobs themselves live in the Main.
 *
 * Not a global store: each key belongs to one screen, which reads and writes only its own.
 */
const values = new Map<string, unknown>()
const listeners = new Map<string, Set<() => void>>()

function subscribe(key: string, fn: () => void): () => void {
  let set = listeners.get(key)
  if (!set) listeners.set(key, (set = new Set()))
  set.add(fn)
  return () => set.delete(fn)
}

function write(key: string, value: unknown): void {
  if (Object.is(values.get(key), value)) return
  values.set(key, value)
  listeners.get(key)?.forEach((fn) => fn())
}

/** `useState` whose value survives the component unmounting. */
export function usePageState<T>(
  key: string,
  initial: T
): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    useCallback((fn: () => void) => subscribe(key, fn), [key]),
    () => (values.has(key) ? (values.get(key) as T) : initial)
  )
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = (values.has(key) ? values.get(key) : initial) as T
      write(key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next)
    },
    // `initial` is only read when the key was never written: a new identity changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  )
  return [value, set]
}

/** `useReducer` whose state survives the component unmounting. */
export function usePageReducer<S, A>(
  key: string,
  reducer: (s: S, a: A) => S,
  initial: S
): [S, (action: A) => void] {
  const [state, set] = usePageState(key, initial)
  const dispatch = useCallback((a: A) => set((s) => reducer(s, a)), [set, reducer])
  return [state, dispatch]
}

/** Forget every screen's state (tests). */
export function resetPageState(): void {
  const keys = [...values.keys()]
  values.clear()
  keys.forEach((k) => listeners.get(k)?.forEach((fn) => fn()))
}
