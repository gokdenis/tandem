import { useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'tandem.theme'

/**
 * The theme is a per-browser preference rather than part of the workspace, so
 * it lives under its own key: resetting the sample decks should not change how
 * the page looks, and the choice should survive that reset.
 */
export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* private mode: fall back to following the system */
  }
  return 'system'
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

export function useTheme(): [ThemeChoice, (next: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme)

  useEffect(() => {
    applyTheme(choice)
    try {
      localStorage.setItem(KEY, choice)
    } catch {
      /* the page still looks right, it just will not remember */
    }
  }, [choice])

  return [choice, setChoice]
}
