import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ── Tiny chainable Supabase fake ─────────────────────────────────────────────
const db = { revision_thumbnails: [], thumbnail_comments: [], projects: [] }
const inserts = []
const rpc = vi.fn(async () => ({ data: null, error: null }))
function from(table) {
  const q = {
    select: () => q, eq: () => q, order: () => q,
    maybeSingle: async () => ({ data: db[table][0] || null, error: null }),
    single: async () => ({ data: { id: 'new-thumb' }, error: null }),
    insert: (row) => { inserts.push({ table, row }); return Object.assign(Promise.resolve({ error: null }), q) },
    update: () => q, delete: () => q,
    then: (res) => res({ data: db[table], error: null }),
  }
  return q
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (t) => from(t), rpc: (...a) => rpc(...a) } }))
vi.mock('../lib/r2', () => ({ uploadToR2: vi.fn() }))
vi.mock('../lib/myClient', () => ({ clientProfileIds: async () => [] }))
vi.mock('../lib/notify', () => ({ notifyMany: async () => {} }))

import ThumbnailReview from '../components/projects/ThumbnailReview'
import CaptionConcept from '../components/projects/CaptionConcept'

const revision = { id: 'r1', revision_number: 1, status: 'pending_client_review' }
const project  = { id: 'p1', name: 'Spring Launch', client_id: 'c1' }

beforeEach(() => {
  db.revision_thumbnails = []; db.thumbnail_comments = []; db.projects = []
  inserts.length = 0; rpc.mockClear()
})

describe('ThumbnailReview', () => {
  it('offers an upload to editors when there is no thumbnail', async () => {
    render(<ThumbnailReview revision={revision} project={project} myId="ed" canUpload />)
    expect(await screen.findByText(/Upload a thumbnail for this cut/)).toBeTruthy()
  })

  it('stays hidden from clients until a thumbnail exists', async () => {
    const { container } = render(<ThumbnailReview revision={revision} project={project} myId="cl" canReview />)
    await waitFor(() => expect(container.innerHTML).toBe(''))
  })

  it('shows pins and lets a reviewer drop a new note on the latest version', async () => {
    db.revision_thumbnails = [
      { id: 't2', version: 2, image_url: 'v2.jpg', status: 'in_review' },
      { id: 't1', version: 1, image_url: 'v1.jpg', status: 'changes_requested' },
    ]
    db.thumbnail_comments = [{ id: 'c1', x_pct: 10, y_pct: 20, body: 'Bigger logo', status: 'open', profile_id: 'x' }]
    render(<ThumbnailReview revision={revision} project={project} myId="cl" canReview />)

    const img = await screen.findByAltText('Thumbnail v2')
    expect(screen.getByText('v2 (latest)')).toBeTruthy()
    expect(await screen.findByText('Bigger logo')).toBeTruthy()

    img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 })
    fireEvent.click(img, { clientX: 50, clientY: 50 })
    fireEvent.change(screen.getByPlaceholderText('What should change here?'), { target: { value: 'Warmer color' } })
    fireEvent.click(screen.getByText('Add note'))
    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toMatchObject({
      table: 'thumbnail_comments',
      row: { thumbnail_id: 't2', x_pct: 25, y_pct: 50, body: 'Warmer color', profile_id: 'cl' },
    })
  })

  it('approves through the review_thumbnail function', async () => {
    db.revision_thumbnails = [{ id: 't1', version: 1, image_url: 'v1.jpg', status: 'in_review' }]
    render(<ThumbnailReview revision={revision} project={project} myId="cl" canReview />)
    fireEvent.click(await screen.findByText('Approve'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('review_thumbnail', { p_thumbnail_id: 't1', p_status: 'approved' }))
  })
})

describe('CaptionConcept platform captions', () => {
  it('hides the whole card from clients when nothing is written', async () => {
    db.projects = [{ caption_platforms: {} }]
    const { container } = render(<CaptionConcept projectId="p1" initialValue="" canEdit={false} />)
    await waitFor(() => expect(container.innerHTML).toBe(''))
  })

  it('shows clients only the platforms that were written', async () => {
    db.projects = [{ caption_platforms: { tiktok: 'For the TikTok crowd' } }]
    render(<CaptionConcept projectId="p1" initialValue="" canEdit={false} />)
    expect(await screen.findByText('For the TikTok crowd')).toBeTruthy()
    expect(screen.queryByText('Instagram')).toBeNull()
  })

  it('saves one platform at a time for the team', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    db.projects = [{ caption_platforms: {} }]
    render(<CaptionConcept projectId="p1" initialValue="Main copy" canEdit />)
    fireEvent.click(await screen.findByText('Platform captions'))
    fireEvent.click(screen.getByRole('tab', { name: /LinkedIn/ }))
    fireEvent.click(screen.getByText('Start from main caption'))
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(rpc).toHaveBeenCalledWith('set_project_caption', { p_project_id: 'p1', p_platform: 'linkedin', p_text: 'Main copy' })
    vi.useRealTimers()
  })
})
