import { useState } from 'react'
import { useLabStore } from '../store/useLabStore'

/** The lesson for a preset: its question and the steps to answer it. */
export function GuideCard() {
  const guide = useLabStore((s) => s.guide)
  const [open, setOpen] = useState(true)
  if (!guide) return null

  return (
    <aside className="guide" data-testid="guide">
      <button className="guide__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="eyebrow">Lesson</span>
        <span className="guide__chevron">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <>
          <p className="guide__question">{guide.question}</p>
          <ol className="guide__steps">
            {guide.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </>
      )}
    </aside>
  )
}
