import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

type OnboardingProps = {
  onClose: () => void
}

type TourStep = {
  eyebrow: string
  title: string
  body: string
  facts: Array<{
    label: string
    detail: string
  }>
}

const STEPS: TourStep[] = [
  {
    eyebrow: 'Your study board',
    title: 'Study what needs you now.',
    body: 'Tandem schedules cards from your answers, spots weak topics in your review history, and turns an exam date into a practical revision plan.',
    facts: [
      { label: 'Due cards', detail: 'Review the right material at the right time.' },
      { label: 'Weak topics', detail: 'See where another pass will help most.' },
      { label: 'Revision plan', detail: 'Keep the next study day concrete.' },
    ],
  },
  {
    eyebrow: 'Shared with your agent',
    title: 'No screenshots. No guessing.',
    body: 'The page exposes structured WebMCP tools, so an agent can understand the same workspace you see and help without clicking blindly through the interface.',
    facts: [
      { label: '20 tools', detail: 'Search, study, plan, explain, and organize.' },
      { label: 'Shared context', detail: 'Your agent can read the card currently on screen.' },
      { label: 'Visible actions', detail: 'Tool calls appear in the activity feed.' },
    ],
  },
  {
    eyebrow: 'You stay in control',
    title: 'The agent can help. You decide.',
    body: 'Core study actions still work by hand, and deleting a card waits for your approval. Your workspace remains local to this browser.',
    facts: [
      { label: 'Human-first', detail: 'Use every core study flow without an agent.' },
      { label: 'Approval gate', detail: 'Deleting a card always waits for your click.' },
      { label: 'Local workspace', detail: 'Study data stays in browser storage.' },
    ],
  },
]

export function Onboarding({ onClose }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const current = STEPS[step]!
  const isLastStep = step === STEPS.length - 1

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="onboarding-layer" onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        className="onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-copy"
        tabIndex={-1}
      >
        <div className="onboarding-topline">
          <div className="onboarding-brand" aria-label="Tandem">
            <span aria-hidden="true">T</span>
            Tandem
          </div>
          <button type="button" className="btn sm quiet" onClick={onClose}>
            Skip tour
          </button>
        </div>

        <div
          className="onboarding-progress"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-valuetext={`Step ${step + 1} of ${STEPS.length}`}
        >
          {STEPS.map((item, index) => (
            <span
              key={item.eyebrow}
              className={index <= step ? 'onboarding-progress-bar active' : 'onboarding-progress-bar'}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="onboarding-content" aria-live="polite">
          <p className="onboarding-eyebrow">{current.eyebrow}</p>
          <h2 id="onboarding-title">{current.title}</h2>
          <p id="onboarding-copy" className="onboarding-copy">
            {current.body}
          </p>

          <dl className="onboarding-facts">
            {current.facts.map((fact, index) => (
              <div className="onboarding-fact" key={fact.label}>
                <span className="onboarding-fact-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <dt>{fact.label}</dt>
                <dd>{fact.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="onboarding-actions">
          <span className="onboarding-step-count">
            {step + 1} / {STEPS.length}
          </span>
          <div className="onboarding-buttons">
            {step > 0 ? (
              <button type="button" className="btn ghost" onClick={() => setStep((value) => value - 1)}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (isLastStep) onClose()
                else setStep((value) => value + 1)
              }}
            >
              {isLastStep ? 'Explore the board' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
