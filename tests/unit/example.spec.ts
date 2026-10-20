import { describe, expect, test } from 'vitest';
import { createCsv } from '@/utils/csv';
import { getUserFacingError } from '@/utils/errors';
import { availableReportActions } from '@/services/workflow';
import type { FacilityReport, UserProfile } from '@/models/domain';

const reporter: UserProfile = {
  uid: 'reporter-1',
  fullName: 'Campus Reporter',
  email: 'reporter@minsu.edu.ph',
  role: 'student',
  identifier: '2026-001',
  department: 'Science',
  contact: '',
  active: true,
};

function report(status: FacilityReport['status'], assignedToUid: string | null = null): Pick<FacilityReport, 'status' | 'assignedToUid' | 'reporterUid'> {
  return { status, assignedToUid, reporterUid: reporter.uid };
}

describe('report workflow permissions', () => {
  test('only administrators can review submitted reports', () => {
    const submitted = report('Submitted');
    expect(availableReportActions(submitted, reporter)).toEqual([]);
    expect(availableReportActions(submitted, { ...reporter, uid: 'admin-1', role: 'admin' }).map((action) => action.status)).toEqual(['Under Review']);
  });

  test('maintenance actions are limited to the assigned staff member', () => {
    const assigned = report('Assigned', 'maintenance-1');
    const staff: UserProfile = { ...reporter, uid: 'maintenance-1', role: 'maintenance' };
    const otherStaff: UserProfile = { ...staff, uid: 'maintenance-2' };
    expect(availableReportActions(assigned, staff).map((action) => action.status)).toEqual(['In Progress']);
    expect(availableReportActions(assigned, otherStaff)).toEqual([]);
  });

  test('a reporter can reopen their resolved report but not another user’s', () => {
    const resolved = report('Resolved');
    expect(availableReportActions(resolved, reporter).map((action) => action.status)).toEqual(['Reopened']);
    expect(availableReportActions({ ...resolved, reporterUid: 'someone-else' }, reporter)).toEqual([]);
  });
});

describe('CSV export', () => {
  test('quotes fields and escapes embedded quotes', () => {
    expect(createCsv([{ title: 'Broken "main" light', status: 'Submitted' }], ['title', 'status']))
      .toBe('"title","status"\r\n"Broken ""main"" light","Submitted"');
  });

  test('serializes empty values safely', () => {
    expect(createCsv([{ title: 'Roof leak', assignee: null }], ['title', 'assignee']))
      .toBe('"title","assignee"\r\n"Roof leak",""');
  });
});

describe('user-facing errors', () => {
  test('replaces Firebase composite-index URLs with a concise instruction', () => {
    const error = new Error('The query requires an index. You can create it here: https://console.firebase.google.com/long-index-url');
    expect(getUserFacingError(error, 'Unable to load data.'))
      .toBe('This view needs a Firestore index. Deploy the project indexes and wait for them to finish building.');
  });

  test('preserves useful errors and uses a fallback for unknown failures', () => {
    expect(getUserFacingError(new Error('Permission denied.'), 'Unable to load data.')).toBe('Permission denied.');
    expect(getUserFacingError(null, 'Unable to load data.')).toBe('Unable to load data.');
  });
});
