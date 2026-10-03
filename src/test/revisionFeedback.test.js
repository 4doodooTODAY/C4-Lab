import { describe, it, expect } from 'vitest'
import { isFeedbackToAddress, feedbackCount } from '../lib/revisionFeedback'

describe('revision feedback rule', () => {
  it("counts client notes left in 'pending', which is where they always stay", () => {
    expect(isFeedbackToAddress({ status: 'pending' })).toBe(true)
    expect(isFeedbackToAddress({ status: 'accepted' })).toBe(true)
    expect(isFeedbackToAddress({ status: 'declined' })).toBe(false)
  })
  it('counts everything the client did not decline', () => {
    expect(feedbackCount([{ status: 'pending' }, { status: 'declined' }, { status: 'accepted' }])).toBe(2)
    expect(feedbackCount(null)).toBe(0)
  })
})
