import type { ThemeChoice } from '../core/theme'

const OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function ThemePicker({ value, onChange }: { value: ThemeChoice; onChange: (next: ThemeChoice) => void }) {
  return (
    <div className="theme-picker" role="group" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          title={option.value === 'system' ? 'Follow the system setting' : `Always use the ${option.value} theme`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
