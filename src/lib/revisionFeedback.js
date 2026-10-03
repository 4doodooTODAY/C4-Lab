// ── Which revision comments are feedback the editor must act on ──────────────
// Comments carry a status: pending, accepted, declined. Accept/decline exists
// so the client can vet the photographer's notes. Nothing ever moves a
// client's (or an admin's) own comment out of 'pending', so filtering on
// 'accepted' alone hid every piece of client feedback from the editor.
// The rule: everything except what the client declined.
export function isFeedbackToAddress(comment) {
  return comment?.status !== 'declined'
}

/** Count of notes the editor has to work through. */
export function feedbackCount(comments) {
  return (comments || []).filter(isFeedbackToAddress).length
}
