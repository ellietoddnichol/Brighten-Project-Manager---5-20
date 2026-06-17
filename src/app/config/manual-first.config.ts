/** Manual-first job record mode — Firestore is live source of truth; sync/review stays in Admin. */
export const manualFirstConfig = {
  /** Hide sync-health, review-center, and missing-backup prompts on Home/Projects/Job pages. */
  hideMainWorkflowWarnings: true,

  /** Suppress review/urgent badges on main sidebar nav. */
  hideSidebarReviewBadges: true,

  /** Use Firestore for live editable job records (not MySQL writes). */
  firestoreLiveEdits: true,
};
