import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({}) }))
vi.mock('../components/ui/MediaThumb', () => ({ default: () => <div data-testid="thumb" /> }))

import { ReviewQueueCard } from '../pages/creative/ProjectWorkflow'

const project = { id: 'p1', media_type: 'video' }
const revs = [
  { id: 'r1', revision_number: 1, status: 'approved' },
  { id: 'r2', revision_number: 2, status: 'pending_client_review' },
  { id: 'r3', revision_number: 3, status: 'draft' },
]

describe('ReviewQueueCard', () => {
  it('renders nothing when no cut is in review', () => {
    const { container } = render(
      <ReviewQueueCard project={project} revisions={[revs[0]]} navigate={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows cuts in review and hides unsent drafts from non-editors', () => {
    render(<ReviewQueueCard project={project} revisions={revs} isCreative navigate={vi.fn()} />)
    expect(screen.getByText('Ready to review')).toBeTruthy()
    expect(screen.getAllByTestId('thumb')).toHaveLength(1)
    expect(screen.queryByText(/draft/)).toBeNull()
  })

  it('shows the draft to editors', () => {
    render(<ReviewQueueCard project={project} revisions={revs} isEditor navigate={vi.fn()} />)
    expect(screen.getAllByTestId('thumb')).toHaveLength(2)
    expect(screen.getByText('Review and send')).toBeTruthy()
  })

  it('opens the cut review page', () => {
    const navigate = vi.fn()
    render(<ReviewQueueCard project={project} revisions={revs} navigate={navigate} />)
    fireEvent.click(screen.getByText(/View cut/))
    expect(navigate).toHaveBeenCalledWith('/projects/p1/revision/r2')
  })

  it('leaves admin approvals to the approval panel', () => {
    const { container } = render(
      <ReviewQueueCard project={project} isAdmin
        revisions={[{ id: 'a', revision_number: 1, status: 'pending_admin_review' }]} navigate={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })
})
