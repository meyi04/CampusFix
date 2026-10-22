// @vitest-environment node

import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getBytes, ref as storageRef, uploadBytes } from 'firebase/storage';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const projectId = 'demo-campusfix-rules-test';
let environment: RulesTestEnvironment;

const userProfiles = [
  { uid: 'reporter-1', fullName: 'Reporter One', email: 'reporter@minsu.edu.ph', role: 'student', active: true },
  { uid: 'reporter-2', fullName: 'Reporter Two', email: 'other@minsu.edu.ph', role: 'faculty', active: true },
  { uid: 'reporter-3', fullName: 'Reporter Three', email: 'third@minsu.edu.ph', role: 'student', active: true },
  { uid: 'maintenance-1', fullName: 'Maintenance One', email: 'maintenance@minsu.edu.ph', role: 'maintenance', active: true },
  { uid: 'admin-1', fullName: 'Administrator One', email: 'admin@minsu.edu.ph', role: 'admin', active: true },
];

async function seed() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    for (const profile of userProfiles) await setDoc(doc(database, 'users', profile.uid), profile);
    await setDoc(doc(database, 'buildings', 'building-1'), { name: 'Main Building', active: true });
    await setDoc(doc(database, 'facilityCategories', 'category-1'), { name: 'Electrical', active: true });
    await setDoc(doc(database, 'reports', 'report-1'), {
      id: 'report-1',
      title: 'Broken classroom light',
      description: 'The ceiling light is flickering and does not stay on.',
      category: 'Electrical',
      categoryId: 'category-1',
      buildingId: 'building-1',
      buildingName: 'Main Building',
      room: '204',
      priority: 'Normal',
      status: 'Submitted',
      imageUrls: [],
      reporterUid: 'reporter-1',
      reporterName: 'Reporter One',
      assignedToUid: null,
      assignedToName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(database, 'reports', 'report-2'), {
      id: 'report-2',
      title: 'Broken laboratory fixture',
      description: 'The light near the lab bench is not working.',
      category: 'Electrical',
      categoryId: 'category-1',
      buildingId: 'building-1',
      buildingName: 'Main Building',
      room: 'Lab 1',
      priority: 'High',
      status: 'Assigned',
      imageUrls: [],
      reporterUid: 'reporter-2',
      reporterName: 'Reporter Two',
      assignedToUid: 'maintenance-1',
      assignedToName: 'Maintenance One',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(database, 'reportPhotos', 'report-1-photo-0'), {
      reportId: 'report-1',
      photoId: 'report-1-photo',
      uploaderUid: 'reporter-1',
      photoIndex: 0,
      chunkIndex: 0,
      chunkCount: 1,
      kind: 'report',
      contentType: 'image/png',
      fileName: 'light.png',
      data: 'YQ==',
      createdAt: new Date(),
    });
  });
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await seed();
});
afterEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
});
afterAll(async () => environment.cleanup());

function authenticated(uid: string, _role: string) {
  return environment.authenticatedContext(uid, { testRole: _role }).firestore();
}

function authenticatedStorage(uid: string, role: string) {
  return environment.authenticatedContext(uid, { role }).storage();
}

describe('Firestore access control', () => {
  test('reporters can read their own report, but not another person’s report', async () => {
    const reporter = authenticated('reporter-1', 'student');
    await assertSucceeds(getDoc(doc(reporter, 'reports', 'report-1')));
    await assertFails(getDoc(doc(reporter, 'reports', 'report-2')));
  });

  test('photo chunks are readable only by authorized viewers of their report', async () => {
    const photo = doc(authenticated('reporter-1', 'student'), 'reportPhotos', 'report-1-photo-0');
    await assertSucceeds(getDoc(photo));
    await assertSucceeds(getDoc(doc(authenticated('admin-1', 'admin'), 'reportPhotos', 'report-1-photo-0')));
    await assertFails(getDoc(doc(authenticated('reporter-2', 'faculty'), 'reportPhotos', 'report-1-photo-0')));
    await assertFails(getDoc(doc(authenticated('maintenance-1', 'maintenance'), 'reportPhotos', 'report-1-photo-0')));
  });

  test('only assigned maintenance staff can create maintenance photo chunks', async () => {
    const photo = {
      reportId: 'report-2',
      photoId: 'work-photo-1',
      uploaderUid: 'maintenance-1',
      photoIndex: 0,
      chunkIndex: 0,
      chunkCount: 1,
      kind: 'maintenance',
      phase: 'before',
      contentType: 'image/jpeg',
      fileName: 'before.jpg',
      data: 'YQ==',
      createdAt: serverTimestamp(),
    };
    const staff = authenticated('maintenance-1', 'maintenance');
    const batch = writeBatch(staff);
    batch.set(doc(staff, 'reportPhotos', 'work-photo-1'), photo);
    batch.update(doc(staff, 'reports', 'report-2'), {
      maintenancePhotos: [{ photoId: 'work-photo-1', phase: 'before', uploadedBy: 'maintenance-1' }],
      updatedAt: serverTimestamp(),
      lastHistoryId: 'work-photo-history',
    });
    batch.set(doc(staff, 'reportHistory', 'work-photo-history'), {
      id: 'work-photo-history',
      reportId: 'report-2',
      previousStatus: 'Assigned',
      newStatus: 'Assigned',
      actorUid: 'maintenance-1',
      actorName: 'Maintenance One',
      notes: 'Before photo added',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    await assertFails(setDoc(
      doc(authenticated('reporter-2', 'faculty'), 'reportPhotos', 'work-photo-chunk-2'),
      { ...photo, photoId: 'work-photo-2', uploaderUid: 'reporter-2' },
    ));
  });

  test('users cannot list accounts, edit their profile, or grant themselves privileged roles', async () => {
    const reporter = authenticated('reporter-1', 'student');
    await assertFails(getDocs(collection(reporter, 'users')));
    await assertFails(updateDoc(doc(reporter, 'users', 'reporter-1'), { fullName: 'Changed Name' }));
    await assertFails(updateDoc(doc(reporter, 'users', 'reporter-1'), { role: 'admin' }));
  });

  test('an administrator can change another account role in Firestore with an audit entry', async () => {
    const admin = authenticated('admin-1', 'admin');
    const batch = writeBatch(admin);
    batch.update(doc(admin, 'users', 'reporter-1'), {
      role: 'maintenance',
      lastAuditId: 'role-audit-1',
    });
    batch.set(doc(admin, 'auditLogs', 'role-audit-1'), {
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      action: 'user.role.changed',
      targetUid: 'reporter-1',
      previousRole: 'student',
      role: 'maintenance',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    expect((await getDoc(doc(admin, 'users', 'reporter-1'))).data()?.role).toBe('maintenance');
  });

  test('registration can create a signed-in user’s student or faculty profile', async () => {
    const database = environment.authenticatedContext('new-user', {
      email: 'new-user@minsu.edu.ph',
    }).firestore();
    await assertSucceeds(setDoc(doc(database, 'users', 'new-user'), {
      uid: 'new-user',
      fullName: 'New Campus User',
      email: 'new-user@minsu.edu.ph',
      role: 'student',
      identifier: '2026-999',
      department: 'Science',
      contact: '',
      active: true,
      createdAt: serverTimestamp(),
    }));
  });

  test('a signed-in user can create their own maintenance profile for open staff registration', async () => {
    const database = environment.authenticatedContext('new-maintenance', {
      email: 'new-maintenance@minsu.edu.ph',
    }).firestore();
    await assertSucceeds(setDoc(doc(database, 'users', 'new-maintenance'), {
      uid: 'new-maintenance',
      fullName: 'New Maintenance Staff',
      email: 'new-maintenance@minsu.edu.ph',
      role: 'maintenance',
      identifier: 'STAFF-101',
      department: 'Facilities',
      contact: '',
      active: true,
      createdAt: serverTimestamp(),
    }));
  });

  test('maintenance staff can only access their assigned work orders', async () => {
    const staff = authenticated('maintenance-1', 'maintenance');
    await assertSucceeds(getDoc(doc(staff, 'reports', 'report-2')));
    await assertFails(getDoc(doc(staff, 'reports', 'report-1')));
  });

  test('an administrator can transition a report with a matching history and audit record', async () => {
    const admin = authenticated('admin-1', 'admin');
    const batch = writeBatch(admin);
    batch.update(doc(admin, 'reports', 'report-1'), {
      status: 'Under Review',
      updatedAt: serverTimestamp(),
      lastHistoryId: 'history-1',
      lastAuditId: 'audit-1',
    });
    batch.set(doc(admin, 'reportHistory', 'history-1'), {
      id: 'history-1',
      reportId: 'report-1',
      previousStatus: 'Submitted',
      newStatus: 'Under Review',
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      notes: 'Review started',
      createdAt: serverTimestamp(),
    });
    batch.set(doc(admin, 'auditLogs', 'audit-1'), {
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      action: 'report.status.changed',
      reportId: 'report-1',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    expect((await getDoc(doc(admin, 'reports', 'report-1'))).data()?.status).toBe('Under Review');
  });

  test('an administrator cannot transition a report without its linked audit record', async () => {
    const admin = authenticated('admin-1', 'admin');
    const batch = writeBatch(admin);
    batch.update(doc(admin, 'reports', 'report-1'), {
      status: 'Under Review',
      updatedAt: serverTimestamp(),
      lastHistoryId: 'history-without-audit',
    });
    batch.set(doc(admin, 'reportHistory', 'history-without-audit'), {
      id: 'history-without-audit',
      reportId: 'report-1',
      previousStatus: 'Submitted',
      newStatus: 'Under Review',
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      notes: 'Review started',
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  test('account activation changes require a matching audit record', async () => {
    const admin = authenticated('admin-1', 'admin');
    const batch = writeBatch(admin);
    batch.update(doc(admin, 'users', 'reporter-1'), {
      active: false,
      lastAuditId: 'account-audit',
    });
    batch.set(doc(admin, 'auditLogs', 'account-audit'), {
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      action: 'user.active.changed',
      targetUid: 'reporter-1',
      active: false,
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  test('a reporter cannot change report status directly', async () => {
    const reporter = authenticated('reporter-1', 'student');
    await assertFails(updateDoc(doc(reporter, 'reports', 'report-1'), {
      status: 'Resolved',
      updatedAt: serverTimestamp(),
    }));
  });

  test('a new report must create its history and notification atomically', async () => {
    const reporter = authenticated('reporter-1', 'student');
    const batch = writeBatch(reporter);
    const reportRef = doc(reporter, 'reports', 'report-new');
    batch.set(reportRef, {
      id: 'report-new',
      title: 'Broken hallway light',
      description: 'The hallway light near the stairs is completely out.',
      category: 'Electrical',
      categoryId: 'category-1',
      buildingId: 'building-1',
      buildingName: 'Main Building',
      room: 'Stairwell',
      priority: 'Normal',
      status: 'Submitted',
      lastHistoryId: 'history-new',
      imageUrls: [],
      reporterUid: 'reporter-1',
      reporterName: 'Reporter One',
      assignedToUid: null,
      assignedToName: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(reporter, 'reportHistory', 'history-new'), {
      id: 'history-new',
      reportId: 'report-new',
      previousStatus: null,
      newStatus: 'Submitted',
      actorUid: 'reporter-1',
      actorName: 'Reporter One',
      notes: 'Report submitted',
      createdAt: serverTimestamp(),
    });
    batch.set(doc(reporter, 'notifications', 'notification-new'), {
      id: 'notification-new',
      recipientUid: 'reporter-1',
      reportId: 'report-new',
      title: 'Report submitted',
      body: 'Your report was submitted.',
      read: false,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(reporter, 'reportPhotos', 'report-photo-new'), {
      reportId: 'report-new',
      photoId: 'report-photo-new',
      uploaderUid: 'reporter-1',
      photoIndex: 0,
      chunkIndex: 0,
      chunkCount: 1,
      kind: 'report',
      contentType: 'image/png',
      fileName: 'photo.png',
      data: 'YQ==',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(reporter, 'reportPhotos', 'report-photo-new')));
  });

  test('only supported small images can be uploaded under the current user path', async () => {
    const storage = authenticatedStorage('reporter-1', 'student');
    const path = storageRef(storage, 'reports/draft-1/reporter-1/photo.png');
    await assertSucceeds(uploadBytes(path, new Blob(['image bytes'], { type: 'image/png' })));
    await assertFails(uploadBytes(
      storageRef(storage, 'reports/draft-1/reporter-1/document.pdf'),
      new Blob(['not an image'], { type: 'application/pdf' }),
    ));
    await assertFails(uploadBytes(
      storageRef(storage, 'reports/draft-1/reporter-2/photo.png'),
      new Blob(['image bytes'], { type: 'image/png' }),
    ));
    await assertFails(uploadBytes(
      storageRef(storage, 'reports/draft-1/reporter-1/oversized.png'),
      new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }),
    ));
  });

  test('report photos are readable only by the reporter, assigned staff, or an administrator', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(
        storageRef(context.storage(), 'reports/report-2/reporter-1/evidence.png'),
        new Blob(['image bytes'], { type: 'image/png' }),
      );
    });
    const maintenance = authenticatedStorage('maintenance-1', 'maintenance');
    const unrelated = authenticatedStorage('reporter-3', 'student');
    await assertSucceeds(getBytes(storageRef(maintenance, 'reports/report-2/reporter-1/evidence.png')));
    await assertFails(getBytes(storageRef(unrelated, 'reports/report-2/reporter-1/evidence.png')));
  });

  test('administrators can create, edit, and soft-delete announcements with linked audit records', async () => {
    const admin = authenticated('admin-1', 'admin');
    const createBatch = writeBatch(admin);
    createBatch.set(doc(admin, 'announcements', 'notice-1'), {
      title: 'Campus maintenance notice',
      body: 'The library will be closed this afternoon.',
      authorUid: 'admin-1',
      authorName: 'Administrator One',
      active: true,
      createdAt: serverTimestamp(),
      createdAuditId: 'notice-create-audit',
      imagePhotoId: 'notice-photo-1',
      imageContentType: 'image/png',
      imageChunkCount: 1,
    });
    createBatch.set(doc(admin, 'announcementPhotos', 'notice-photo-1-0'), {
      announcementId: 'notice-1',
      photoId: 'notice-photo-1',
      chunkIndex: 0,
      chunkCount: 1,
      contentType: 'image/png',
      data: 'YQ==',
      createdAt: serverTimestamp(),
    });
    createBatch.set(doc(admin, 'auditLogs', 'notice-create-audit'), {
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      action: 'announcement.created',
      targetId: 'notice-1',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(createBatch.commit());
    await assertSucceeds(getDoc(doc(authenticated('reporter-1', 'student'), 'announcementPhotos', 'notice-photo-1-0')));
    await assertFails(setDoc(doc(authenticated('reporter-1', 'student'), 'announcementPhotos', 'unauthorized-photo-0'), {
      announcementId: 'notice-1',
      photoId: 'unauthorized-photo',
      chunkIndex: 0,
      chunkCount: 1,
      contentType: 'image/png',
      data: 'YQ==',
      createdAt: serverTimestamp(),
    }));

    const updateBatch = writeBatch(admin);
    updateBatch.update(doc(admin, 'announcements', 'notice-1'), {
      title: 'Updated campus maintenance notice',
      body: 'The library will be closed this afternoon for maintenance.',
      imagePhotoId: 'notice-photo-2',
      imageContentType: 'image/png',
      imageChunkCount: 1,
      editedAt: serverTimestamp(),
      lastAuditId: 'notice-update-audit',
    });
    updateBatch.set(doc(admin, 'announcementPhotos', 'notice-photo-2-0'), {
      announcementId: 'notice-1',
      photoId: 'notice-photo-2',
      chunkIndex: 0,
      chunkCount: 1,
      contentType: 'image/png',
      data: 'Yg==',
      createdAt: serverTimestamp(),
    });
    updateBatch.delete(doc(admin, 'announcementPhotos', 'notice-photo-1-0'));
    updateBatch.set(doc(admin, 'auditLogs', 'notice-update-audit'), {
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      action: 'announcement.updated',
      targetId: 'notice-1',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(updateBatch.commit());

    const removeImageBatch = writeBatch(admin);
    removeImageBatch.update(doc(admin, 'announcements', 'notice-1'), {
      imagePhotoId: deleteField(),
      imageContentType: deleteField(),
      imageChunkCount: deleteField(),
      editedAt: serverTimestamp(),
      lastAuditId: 'notice-remove-image-audit',
    });
    removeImageBatch.delete(doc(admin, 'announcementPhotos', 'notice-photo-2-0'));
    removeImageBatch.set(doc(admin, 'auditLogs', 'notice-remove-image-audit'), {
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      action: 'announcement.updated',
      targetId: 'notice-1',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(removeImageBatch.commit());

    const deleteBatch = writeBatch(admin);
    deleteBatch.update(doc(admin, 'announcements', 'notice-1'), {
      active: false,
      lastAuditId: 'notice-delete-audit',
    });
    deleteBatch.set(doc(admin, 'auditLogs', 'notice-delete-audit'), {
      actorUid: 'admin-1',
      actorName: 'Administrator One',
      action: 'announcement.deleted',
      targetId: 'notice-1',
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(deleteBatch.commit());
  });
});
