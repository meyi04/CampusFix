import type { FacilityReport, ReportStatus, UserProfile } from '@/models/domain';

export interface ReportAction {
  status: ReportStatus;
  label: string;
  primary: boolean;
}

export function availableReportActions(
  report: Pick<FacilityReport, 'status' | 'assignedToUid' | 'reporterUid'>,
  profile: UserProfile | null,
): ReportAction[] {
  if (!profile) return [];
  const { status } = report;

  if (profile.role === 'admin') {
    if (status === 'Submitted') return [{ status: 'Under Review', label: 'Start review', primary: true }];
    if (status === 'Under Review') return [
      { status: 'Approved', label: 'Approve report', primary: true },
      { status: 'Needs Clarification', label: 'Request more information', primary: false },
      { status: 'Rejected', label: 'Reject report', primary: false },
    ];
    if (status === 'Needs Clarification' || status === 'Reopened') return [{ status: 'Under Review', label: 'Resume review', primary: true }];
    if (status === 'Approved') return [{ status: 'Assigned', label: 'Assign work order', primary: true }];
    if (status === 'Pending Verification') return [
      { status: 'Resolved', label: 'Verify and resolve', primary: true },
      { status: 'In Progress', label: 'Return to maintenance', primary: false },
    ];
    if (status === 'Resolved') return [{ status: 'Closed', label: 'Close report', primary: true }];
  }

  if (profile.role === 'maintenance' && report.assignedToUid === profile.uid) {
    if (status === 'Assigned') return [{ status: 'In Progress', label: 'Accept and start work', primary: true }];
    if (status === 'In Progress') return [{ status: 'Pending Verification', label: 'Submit for verification', primary: true }];
  }

  if (profile.uid === report.reporterUid && status === 'Resolved') {
    return [{ status: 'Reopened', label: 'Reopen unresolved issue', primary: false }];
  }
  return [];
}
