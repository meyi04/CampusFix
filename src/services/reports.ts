import {
  collection,
  addDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import type {
  FacilityReport,
  ReportHistoryEntry,
  ReportComment,
  ReportPriority,
  ReportStatus,
  UserProfile,
} from '@/models/domain';
import { auth, db } from '@/firebase/client';
import { createPhotoDataUrl, encodePhotoBytes } from '@/utils/firestorePhotos';
import { toUserFacingError } from '@/utils/errors';

export const REPORT_PRIORITIES: ReportPriority[] = ['Low', 'Normal', 'High', 'Urgent'];
export const REPORT_PAGE_SIZE = 25;

function reportsQuery(profile: UserProfile, pageSize: number, cursor?: QueryDocumentSnapshot<DocumentData>) {
  const { database } = requireFirebase();
  const constraints = profile.role === 'admin'
    ? [orderBy('createdAt', 'desc')]
    : [
      where(profile.role === 'maintenance' ? 'assignedToUid' : 'reporterUid', '==', profile.uid),
      orderBy('createdAt', 'desc'),
    ];
  return query(
    collection(database, 'reports'),
    ...constraints,
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  );
}

export interface NewReportInput {
  title: string;
  description: string;
  category: string;
  categoryId: string;
  buildingId: string;
  buildingName: string;
  room: string;
  priority: ReportPriority;
  photos: File[];
  latitude?: number;
  longitude?: number;
}

function requireFirebase() {
  if (!auth?.currentUser || !db) {
    throw new Error('Sign in and configure Firebase before using reports.');
  }
  return { user: auth.currentUser, database: db };
}

export function validatePhotos(files: File[]): void {
  if (files.length > 5) throw new Error('Attach no more than five photos per report.');
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'].includes(file.type)) {
      throw new Error(`${file.name} must be a JPEG, PNG, WebP, GIF, or HEIC image.`);
    }
    if (file.size === 0) throw new Error(`${file.name} is empty.`);
    if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} exceeds the 5 MB photo limit.`);
  }
  if (files.reduce((total, file) => total + file.size, 0) > 6 * 1024 * 1024) {
    throw new Error('The combined photo size cannot exceed 6 MB when stored in Firestore.');
  }
}

interface FirestorePhotoChunk {
  reportId: string;
  photoId: string;
  uploaderUid: string;
  photoIndex: number;
  chunkIndex: number;
  chunkCount: number;
  kind: 'report' | 'maintenance';
  contentType: string;
  fileName: string;
  data: string;
  phase?: 'before' | 'after';
}

export interface FirestoreReportPhoto {
  id: string;
  photoIndex: number;
  kind: 'report' | 'maintenance';
  phase?: 'before' | 'after';
  contentType: string;
  fileName: string;
  dataUrl: string;
}

async function prepareFirestorePhoto(
  database: NonNullable<typeof db>,
  reportId: string,
  uploaderUid: string,
  file: File,
  photoIndex: number,
  kind: FirestorePhotoChunk['kind'],
  phase?: 'before' | 'after',
): Promise<{ id: string; photoId: string; data: FirestorePhotoChunk }[]> {
  const encodedChunks = encodePhotoBytes(new Uint8Array(await file.arrayBuffer()));
  if (!encodedChunks.length || encodedChunks.length > 12) {
    throw new Error(`${file.name} cannot be stored as a Firestore photo.`);
  }

  const photoId = doc(collection(database, 'reportPhotos')).id;
  return encodedChunks.map((data, chunkIndex) => ({
    id: chunkIndex === 0 ? photoId : `${photoId}_${chunkIndex}`,
    photoId,
    data: {
      reportId,
      photoId,
      uploaderUid,
      photoIndex,
      chunkIndex,
      chunkCount: encodedChunks.length,
      kind,
      contentType: file.type,
      fileName: file.name.slice(0, 255),
      data,
      ...(phase ? { phase } : {}),
    },
  }));
}

export async function createReport(
  input: NewReportInput,
  reporter: UserProfile,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { user, database } = requireFirebase();
  validatePhotos(input.photos);
  const reportRef = doc(collection(database, 'reports'));
  const totalBytes = input.photos.reduce((total, file) => total + file.size, 0);
  let storedBytes = 0;
  const photoChunks: Awaited<ReturnType<typeof prepareFirestorePhoto>> = [];
  for (const [index, file] of input.photos.entries()) {
    photoChunks.push(...await prepareFirestorePhoto(database, reportRef.id, user.uid, file, index, 'report'));
    storedBytes += file.size;
    onProgress?.(totalBytes ? Math.min(99, Math.round((storedBytes / totalBytes) * 100)) : 0);
  }

  const historyRef = doc(collection(database, 'reportHistory'));
  await runTransaction(database, async (transaction) => {
    photoChunks.forEach((chunk) => {
      transaction.set(doc(database, 'reportPhotos', chunk.id), { ...chunk.data, createdAt: serverTimestamp() });
    });
    transaction.set(reportRef, {
      id: reportRef.id,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      categoryId: input.categoryId,
      buildingId: input.buildingId,
      buildingName: input.buildingName,
      room: input.room.trim(),
      priority: input.priority,
      status: 'Submitted',
      lastHistoryId: historyRef.id,
      imageUrls: [],
      reporterUid: user.uid,
      reporterName: reporter.fullName,
      assignedToUid: null,
      assignedToName: null,
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(historyRef, {
      id: historyRef.id,
      reportId: reportRef.id,
      previousStatus: null,
      newStatus: 'Submitted',
      actorUid: user.uid,
      actorName: reporter.fullName,
      notes: 'Report submitted',
      createdAt: serverTimestamp(),
    });
    const notificationRef = doc(collection(database, 'notifications'));
    transaction.set(notificationRef, {
      id: notificationRef.id,
      recipientUid: user.uid,
      reportId: reportRef.id,
      title: 'Report submitted',
      body: `Your report "${input.title.trim()}" was submitted successfully.`,
      read: false,
      createdAt: serverTimestamp(),
    });
  });
  onProgress?.(100);
  return reportRef.id;
}

export function subscribeReportPhotos(
  reportId: string,
  callback: (photos: FirestoreReportPhoto[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { database } = requireFirebase();
  return onSnapshot(
    query(collection(database, 'reportPhotos'), where('reportId', '==', reportId)),
    (snapshot) => {
      const photos = new Map<string, {
        id: string;
        photoIndex: number;
        kind: 'report' | 'maintenance';
        phase?: 'before' | 'after';
        contentType: string;
        fileName: string;
        chunkCount: number;
        chunks: Map<number, string>;
      }>();
      for (const item of snapshot.docs) {
        const chunk = item.data() as FirestorePhotoChunk;
        const photo = photos.get(chunk.photoId) ?? {
          id: chunk.photoId,
          photoIndex: chunk.photoIndex,
          kind: chunk.kind,
          phase: chunk.phase,
          contentType: chunk.contentType,
          fileName: chunk.fileName,
          chunkCount: chunk.chunkCount,
          chunks: new Map<number, string>(),
        };
        photo.chunks.set(chunk.chunkIndex, chunk.data);
        photos.set(chunk.photoId, photo);
      }

      callback([...photos.values()]
        .filter((photo) => photo.chunks.size === photo.chunkCount)
        .map((photo) => ({
          id: photo.id,
          photoIndex: photo.photoIndex,
          kind: photo.kind,
          phase: photo.phase,
          contentType: photo.contentType,
          fileName: photo.fileName,
          dataUrl: createPhotoDataUrl(
            photo.contentType,
            Array.from({ length: photo.chunkCount }, (_, index) => photo.chunks.get(index) ?? ''),
          ),
        }))
        .sort((a, b) => a.photoIndex - b.photoIndex || a.id.localeCompare(b.id)));
    },
    (error) => onError(toUserFacingError(error, 'Unable to load report photos.')),
  );
}

export function subscribeReports(
  profile: UserProfile,
  onReports: (reports: FacilityReport[]) => void,
  onError: (error: Error) => void,
  pageSize = 100,
): Unsubscribe {
  return onSnapshot(reportsQuery(profile, pageSize), (snapshot) => {
    onReports(snapshot.docs.map((item) => item.data() as FacilityReport));
  }, (error) => onError(toUserFacingError(error, 'Unable to load reports.')));
}

export async function getReportsPage(
  profile: UserProfile,
  cursor?: QueryDocumentSnapshot<DocumentData>,
): Promise<{ reports: FacilityReport[]; cursor?: QueryDocumentSnapshot<DocumentData> }> {
  try {
    const snapshot = await getDocs(reportsQuery(profile, REPORT_PAGE_SIZE, cursor));
    return {
      reports: snapshot.docs.map((item) => item.data() as FacilityReport),
      cursor: snapshot.docs.at(-1),
    };
  } catch (error) {
    throw toUserFacingError(error, 'Unable to load reports.');
  }
}

export function subscribeReport(
  reportId: string,
  onReport: (report: FacilityReport | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { database } = requireFirebase();
  return onSnapshot(doc(database, 'reports', reportId), (snapshot) => {
    onReport(snapshot.exists() ? snapshot.data() as FacilityReport : null);
  }, (error) => onError(toUserFacingError(error, 'Unable to load this report.')));
}

export function subscribeReportHistory(
  reportId: string,
  onHistory: (history: ReportHistoryEntry[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { database } = requireFirebase();
  const historyQuery = query(
    collection(database, 'reportHistory'),
    where('reportId', '==', reportId),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(historyQuery, (snapshot) => {
    onHistory(snapshot.docs.map((item) => item.data() as ReportHistoryEntry));
  }, (error) => onError(toUserFacingError(error, 'Unable to load report history.')));
}

export async function changeReportStatus(
  report: FacilityReport,
  profile: UserProfile,
  status: ReportStatus,
  notes: string,
  assignedTo?: UserProfile,
): Promise<void> {
  const { user, database } = requireFirebase();
  const reportRef = doc(database, 'reports', report.id);
  const historyRef = doc(collection(database, 'reportHistory'));
  const auditRef = profile.role === 'admin' ? doc(collection(database, 'auditLogs')) : null;
  await runTransaction(database, async (transaction) => {
    const current = await transaction.get(reportRef);
    if (!current.exists()) throw new Error('This report no longer exists.');
    const currentReport = current.data() as FacilityReport;
    if (currentReport.status !== report.status) {
      throw new Error('This report changed while you were viewing it. Refresh and try again.');
    }

    const updates: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
      lastHistoryId: historyRef.id,
      ...(auditRef ? { lastAuditId: auditRef.id } : {}),
    };
    if (assignedTo) {
      updates.assignedToUid = assignedTo.uid;
      updates.assignedToName = assignedTo.fullName;
      updates.assignedAt = serverTimestamp();
    }
    if (status === 'In Progress') updates.startedAt = serverTimestamp();
    if (status === 'Resolved' || status === 'Closed') {
      updates.completedAt = serverTimestamp();
      updates.resolutionNotes = notes.trim();
    }

    transaction.update(reportRef, updates);
    transaction.set(historyRef, {
      id: historyRef.id,
      reportId: report.id,
      previousStatus: currentReport.status,
      newStatus: status,
      actorUid: user.uid,
      actorName: profile.fullName,
      notes: notes.trim(),
      createdAt: serverTimestamp(),
      ...(assignedTo ? { assignedToUid: assignedTo.uid, assignedToName: assignedTo.fullName } : {}),
    });
    if (auditRef) {
      transaction.set(auditRef, {
        actorUid: user.uid,
        actorName: profile.fullName,
        action: 'report.status.changed',
        reportId: report.id,
        previousStatus: currentReport.status,
        newStatus: status,
        createdAt: serverTimestamp(),
      });
    }
  });
}

export async function changeReportPriority(
  report: FacilityReport,
  profile: UserProfile,
  priority: ReportPriority,
  note: string,
): Promise<void> {
  if (profile.role !== 'admin') throw new Error('Administrator access is required to change report priority.');
  const { user, database } = requireFirebase();
  const reportRef = doc(database, 'reports', report.id);
  const historyRef = doc(collection(database, 'reportHistory'));
  const auditRef = doc(collection(database, 'auditLogs'));

  await runTransaction(database, async (transaction) => {
    const current = await transaction.get(reportRef);
    if (!current.exists()) throw new Error('This report no longer exists.');
    const currentReport = current.data() as FacilityReport;
    if (currentReport.status !== report.status || currentReport.priority !== report.priority) {
      throw new Error('This report changed while you were viewing it. Refresh and try again.');
    }
    if (currentReport.priority === priority) return;
    transaction.update(reportRef, {
      priority,
      updatedAt: serverTimestamp(),
      lastHistoryId: historyRef.id,
      lastAuditId: auditRef.id,
    });
    transaction.set(historyRef, {
      id: historyRef.id,
      reportId: report.id,
      previousStatus: currentReport.status,
      newStatus: currentReport.status,
      actorUid: user.uid,
      actorName: profile.fullName,
      notes: note.trim() || `Priority changed from ${currentReport.priority} to ${priority}`,
      createdAt: serverTimestamp(),
    });
    transaction.set(auditRef, {
      actorUid: user.uid,
      actorName: profile.fullName,
      action: 'report.priority.changed',
      reportId: report.id,
      previousPriority: currentReport.priority,
      newPriority: priority,
      createdAt: serverTimestamp(),
    });
  });
}

export async function addMaintenancePhoto(
  report: FacilityReport,
  profile: UserProfile,
  file: File,
  phase: 'before' | 'after',
  note: string,
): Promise<void> {
  validatePhotos([file]);
  if (profile.role !== 'maintenance' || report.assignedToUid !== profile.uid) {
    throw new Error('Only the assigned maintenance staff can add work photos.');
  }
  if (!['Assigned', 'In Progress', 'Pending Verification'].includes(report.status)) {
    throw new Error('Maintenance photos can only be added while the work order is active.');
  }
  if ((report.maintenancePhotos?.length ?? 0) >= 10) throw new Error('No more than ten maintenance photos can be added.');
  if (note.trim().length > 2000) throw new Error('Work notes must be 2,000 characters or fewer.');
  const { user, database } = requireFirebase();
  const photoChunks = await prepareFirestorePhoto(database, report.id, user.uid, file, 0, 'maintenance', phase);
  const historyRef = doc(collection(database, 'reportHistory'));

  await runTransaction(database, async (transaction) => {
    const reportRef = doc(database, 'reports', report.id);
    const current = await transaction.get(reportRef);
    if (!current.exists() || (current.data() as FacilityReport).assignedToUid !== user.uid) {
      throw new Error('This work order is no longer assigned to you.');
    }
    const currentReport = current.data() as FacilityReport;
    if ((currentReport.maintenancePhotos?.length ?? 0) >= 10) {
      throw new Error('No more than ten maintenance photos can be added.');
    }
    photoChunks.forEach((chunk) => {
      transaction.set(doc(database, 'reportPhotos', chunk.id), { ...chunk.data, createdAt: serverTimestamp() });
    });
    transaction.update(reportRef, {
      maintenancePhotos: [...(currentReport.maintenancePhotos ?? []), { photoId: photoChunks[0].photoId, phase, uploadedBy: user.uid }],
      updatedAt: serverTimestamp(),
      lastHistoryId: historyRef.id,
    });
    transaction.set(historyRef, {
      id: historyRef.id,
      reportId: report.id,
      previousStatus: currentReport.status,
      newStatus: currentReport.status,
      actorUid: user.uid,
      actorName: profile.fullName,
      notes: note.trim() || `${phase === 'before' ? 'Before' : 'After'} photo added`,
      createdAt: serverTimestamp(),
    });
  });
}

export function subscribeReportComments(
  reportId: string,
  callback: (comments: ReportComment[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { database } = requireFirebase();
  return onSnapshot(
    query(collection(database, 'reportComments'), where('reportId', '==', reportId), orderBy('createdAt', 'asc')),
    (snapshot) => callback(snapshot.docs.map((item) => item.data() as ReportComment)),
    (error) => onError(toUserFacingError(error, 'Unable to load report comments.')),
  );
}

export async function addReportComment(reportId: string, profile: UserProfile, body: string): Promise<void> {
  const { user, database } = requireFirebase();
  const text = body.trim();
  if (text.length < 2 || text.length > 1000) throw new Error('A comment must be between 2 and 1,000 characters.');
  await addDoc(collection(database, 'reportComments'), {
    reportId,
    authorUid: user.uid,
    authorName: profile.fullName,
    body: text,
    createdAt: serverTimestamp(),
  });
}
