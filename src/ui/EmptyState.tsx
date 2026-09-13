import { EXAMPLES } from './examples'
import { importProject } from '../persistence/autosave'

export function EmptyState() {
  return (
    <div className="empty" data-testid="empty-state">
      <div className="empty__card">
        <div className="eyebrow">Empty sheet</div>
        <p className="empty__text">Drag components in from the left, or start from an example:</p>
        <div className="empty__list">
          {EXAMPLES.map((ex) => (
            <button key={ex.id} className="btn empty__example" data-testid={`empty-example-${ex.id}`} onClick={() => importProject(ex)}>
              {ex.guide ? 'Lesson · ' : ''}
              {ex.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
