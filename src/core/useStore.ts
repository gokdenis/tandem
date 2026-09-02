import { useSyncExternalStore } from 'react'
import { store } from './store'
import type { State } from './types'

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(store.getSnapshot()),
  )
}

export function useAppState(): State {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
