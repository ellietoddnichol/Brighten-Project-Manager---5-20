import { StatusTone } from '@app/components/ui/status-chip';
import { ProjectStatus } from '@app/models/types';

/** Map legacy pay-app chip tones to canonical status-chip tones. */
export function payAppChipTone(tone: 'slate' | 'amber' | 'emerald' | 'indigo'): StatusTone {
  switch (tone) {
    case 'amber':
      return 'amber';
    case 'emerald':
      return 'green';
    case 'indigo':
      return 'violet';
    default:
      return 'slate';
  }
}

/** Map project lifecycle status to status-chip tone. */
export function projectStatusTone(status: ProjectStatus | undefined): StatusTone {
  switch (status) {
    case 'Active':
      return 'orange';
    case 'Awarded':
      return 'green';
    case 'Closeout':
      return 'amber';
    case 'Closed':
      return 'slate';
    case 'Lead / Precon':
    case 'Setup Needed':
    default:
      return 'slate';
  }
}

export function milestoneStatusTone(status: string | undefined): StatusTone {
  switch (status) {
    case 'In Progress':
      return 'blue';
    case 'Delayed':
      return 'red';
    case 'Complete':
      return 'green';
    case 'Canceled':
      return 'slate';
    default:
      return 'slate';
  }
}

export function issueStatusTone(status: string | undefined): StatusTone {
  switch (status) {
    case 'Open':
      return 'red';
    case 'Waiting':
      return 'amber';
    case 'Resolved':
      return 'green';
    case 'Closed':
      return 'slate';
    default:
      return 'slate';
  }
}

export function taskStatusTone(status: string | undefined): StatusTone {
  switch (status) {
    case 'In Progress':
    case 'Waiting':
      return 'blue';
    case 'Complete':
      return 'green';
    case 'Canceled':
      return 'red';
    default:
      return 'slate';
  }
}

export function priorityTone(priority: string | undefined): StatusTone {
  switch (priority) {
    case 'Critical':
      return 'red';
    case 'High':
      return 'orange';
    case 'Medium':
      return 'blue';
    case 'Low':
    default:
      return 'slate';
  }
}
