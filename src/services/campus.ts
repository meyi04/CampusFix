import {
  getDocs,
  getDoc,
  collection,
  doc,
  deleteField,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  runTransaction,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '@/firebase/client';
import type { CampusAnnouncement, CampusBuilding, CampusCategory, CampusRoom, UserProfile } from '@/models/domain';
import { toUserFacingError } from '@/utils/errors';
import { createPhotoDataUrl, encodePhotoBytes } from '@/utils/firestorePhotos';

function requireDatabase() {
  if (!auth?.currentUser || !db) throw new Error('Sign in and configure Firebase to continue.');
  return db;
}

export function subscribeBuildings(
  callback: (buildings: CampusBuilding[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'buildings'), where('active', '==', true)),
    (snapshot) => callback(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }) as CampusBuilding)
      .sort((a, b) => a.name.localeCompare(b.name))),
    (error) => onError(toUserFacingError(error, 'Unable to load campus buildings.')),
  );
}

export function subscribeManagedBuildings(
  callback: (buildings: CampusBuilding[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'buildings'), orderBy('name')),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CampusBuilding)),
    (error) => onError(toUserFacingError(error, 'Unable to load campus buildings.')),
  );
}

export function subscribeRooms(
  buildingId: string,
  callback: (rooms: CampusRoom[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'rooms'), where('buildingId', '==', buildingId), where('active', '==', true), orderBy('name')),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CampusRoom)),
    (error) => onError(toUserFacingError(error, 'Unable to load campus rooms.')),
  );
}

export function subscribeAllRooms(
  callback: (rooms: CampusRoom[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'rooms'), where('active', '==', true), orderBy('name')),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CampusRoom)),
    (error) => onError(toUserFacingError(error, 'Unable to load campus rooms.')),
  );
}

export function subscribeManagedRooms(
  callback: (rooms: CampusRoom[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'rooms'), orderBy('name')),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CampusRoom)),
    (error) => onError(toUserFacingError(error, 'Unable to load campus rooms.')),
  );
}

export function subscribeCategories(
  callback: (categories: CampusCategory[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'facilityCategories'), where('active', '==', true)),
    (snapshot) => callback(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }) as CampusCategory)
      .sort((a, b) => a.name.localeCompare(b.name))),
    (error) => onError(toUserFacingError(error, 'Unable to load facility categories.')),
  );
}

export function subscribeManagedCategories(
  callback: (categories: CampusCategory[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'facilityCategories'), orderBy('name')),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CampusCategory)),
    (error) => onError(toUserFacingError(error, 'Unable to load facility categories.')),
  );
}

export async function addCampusRecord(
  type: 'buildings' | 'rooms' | 'facilityCategories',
  values: Record<string, string | boolean>,
  actor: UserProfile,
): Promise<void> {
  const database = requireDatabase();
  const batch = writeBatch(database);
  const record = doc(collection(database, type));
  const audit = doc(collection(database, 'auditLogs'));
  batch.set(record, {
    ...values,
    active: true,
    createdAt: serverTimestamp(),
    createdAuditId: audit.id,
  });
  batch.set(audit, {
    actorUid: actor.uid,
    actorName: actor.fullName,
    action: `${type}.created`,
    targetId: record.id,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function setCampusActive(collectionName: 'buildings' | 'rooms' | 'facilityCategories', id: string, active: boolean, actor: UserProfile): Promise<void> {
  const database = requireDatabase();
  const batch = writeBatch(database);
  const audit = doc(collection(database, 'auditLogs'));
  batch.update(doc(database, collectionName, id), { active, lastAuditId: audit.id });
  batch.set(audit, {
    actorUid: actor.uid,
    actorName: actor.fullName,
    action: `${collectionName}.active.changed`,
    targetId: id,
    active,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function setAccountActive(uid: string, active: boolean, actor: UserProfile): Promise<void> {
  const database = requireDatabase();
  const userRef = doc(database, 'users', uid);
  const auditRef = doc(collection(database, 'auditLogs'));
  await runTransaction(database, async (transaction) => {
    const current = await transaction.get(userRef);
    if (!current.exists()) throw new Error('This account no longer exists.');
    transaction.update(userRef, { active, lastAuditId: auditRef.id });
    transaction.set(auditRef, {
      actorUid: actor.uid,
      actorName: actor.fullName,
      action: 'user.active.changed',
      targetUid: uid,
      active,
      createdAt: serverTimestamp(),
    });
  });
}

export async function listUsers(): Promise<UserProfile[]> {
  const database = requireDatabase();
  const result = await getDocs(query(collection(database, 'users'), orderBy('fullName'), limit(250)));
  return result.docs.map((item) => item.data() as UserProfile);
}

export async function changeUserRole(uid: string, role: UserProfile['role']): Promise<void> {
  const database = requireDatabase();
  const actor = auth?.currentUser;
  if (!actor) throw new Error('Sign in to change account roles.');
  if (uid === actor.uid) throw new Error('You cannot change your own account role.');

  const userRef = doc(database, 'users', uid);
  const actorRef = doc(database, 'users', actor.uid);
  const auditRef = doc(collection(database, 'auditLogs'));
  await runTransaction(database, async (transaction) => {
    const [current, actorProfile] = await Promise.all([
      transaction.get(userRef),
      transaction.get(actorRef),
    ]);
    if (!current.exists()) throw new Error('This account no longer exists.');
    if (!actorProfile.exists()) throw new Error('The administrator profile is unavailable.');
    const currentProfile = current.data() as UserProfile;
    if (currentProfile.role === role) return;
    transaction.update(userRef, { role, lastAuditId: auditRef.id });
    transaction.set(auditRef, {
      actorUid: actor.uid,
      actorName: actorProfile.data().fullName,
      action: 'user.role.changed',
      targetUid: uid,
      previousRole: currentProfile.role,
      role,
      createdAt: serverTimestamp(),
    });
  });
}

export function subscribeAuditLogs(
  callback: (items: Array<Record<string, unknown> & { id: string }>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'auditLogs'), orderBy('createdAt', 'desc'), limit(100)),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError(toUserFacingError(error, 'Unable to load audit history.')),
  );
}

export function subscribeMaintenanceUsers(
  callback: (users: UserProfile[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'users'), where('role', '==', 'maintenance'), where('active', '==', true), orderBy('fullName')),
    (snapshot) => callback(snapshot.docs.map((item) => item.data() as UserProfile)),
    (error) => onError(toUserFacingError(error, 'Unable to load maintenance staff.')),
  );
}

export function subscribeAnnouncements(
  callback: (items: CampusAnnouncement[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  let revision = 0;
  const unsubscribe = onSnapshot(
    query(collection(database, 'announcements'), where('active', '==', true), orderBy('createdAt', 'desc'), limit(50)),
    (snapshot) => {
      const currentRevision = ++revision;
      void Promise.all(snapshot.docs.map(async (item) => {
        const announcement = { id: item.id, ...item.data() } as CampusAnnouncement;
        if (!announcement.imagePhotoId || !announcement.imageContentType || !announcement.imageChunkCount) return announcement;
        const chunks = await Promise.all(Array.from({ length: announcement.imageChunkCount }, async (_, index) => {
          const photo = await getDoc(doc(database, 'announcementPhotos', `${announcement.imagePhotoId}-${index}`));
          if (!photo.exists()) throw new Error(`The image for "${announcement.title}" is incomplete.`);
          const data = photo.data();
          if (data.photoId !== announcement.imagePhotoId || data.chunkIndex !== index || typeof data.data !== 'string') {
            throw new Error(`The image for "${announcement.title}" is incomplete.`);
          }
          return data.data;
        }));
        announcement.imageUrl = createPhotoDataUrl(announcement.imageContentType, chunks);
        return announcement;
      })).then((items) => {
        if (revision === currentRevision) callback(items);
      }).catch((cause: unknown) => {
        if (revision === currentRevision) {
          onError(toUserFacingError(cause, 'Unable to load announcement images.'));
        }
      });
    },
    (error) => onError(toUserFacingError(error, 'Unable to load announcements.')),
  );
  return () => {
    revision += 1;
    unsubscribe();
  };
}

export async function createAnnouncement(title: string, body: string, author: UserProfile, imageFile?: File): Promise<void> {
  const database = requireDatabase();
  const batch = writeBatch(database);
  const announcement = doc(collection(database, 'announcements'));
  const audit = doc(collection(database, 'auditLogs'));
  const image = imageFile ? await encodeAnnouncementImage(imageFile) : undefined;
  batch.set(announcement, {
    title: title.trim(),
    body: body.trim(),
    authorUid: author.uid,
    authorName: author.fullName,
    ...image?.metadata,
    active: true,
    createdAt: serverTimestamp(),
    createdAuditId: audit.id,
  });
  if (image) addAnnouncementImageChunks(batch, announcement.id, image.photoId, image.contentType, image.chunks);
  batch.set(audit, {
    actorUid: author.uid,
    actorName: author.fullName,
    action: 'announcement.created',
    targetId: announcement.id,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

const ANNOUNCEMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

async function encodeAnnouncementImage(file: File): Promise<{
  photoId: string;
  contentType: string;
  chunks: string[];
  metadata: { imagePhotoId: string; imageContentType: string; imageChunkCount: number };
}> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  if (file.size > ANNOUNCEMENT_IMAGE_MAX_BYTES) throw new Error('The image must be 5 MB or smaller.');
  if (!file.size) throw new Error('Choose an image that is not empty.');
  const photoId = crypto.randomUUID();
  const chunks = encodePhotoBytes(new Uint8Array(await file.arrayBuffer()));
  return {
    photoId,
    contentType: file.type,
    chunks,
    metadata: {
      imagePhotoId: photoId,
      imageContentType: file.type,
      imageChunkCount: chunks.length,
    },
  };
}

function addAnnouncementImageChunks(
  batch: ReturnType<typeof writeBatch>,
  announcementId: string,
  photoId: string,
  contentType: string,
  chunks: string[],
) {
  const database = requireDatabase();
  chunks.forEach((data, chunkIndex) => {
    batch.set(doc(database, 'announcementPhotos', `${photoId}-${chunkIndex}`), {
      announcementId,
      photoId,
      chunkIndex,
      chunkCount: chunks.length,
      contentType,
      data,
      createdAt: serverTimestamp(),
    });
  });
}

function removeAnnouncementImageChunks(batch: ReturnType<typeof writeBatch>, photoId: string, count: number) {
  const database = requireDatabase();
  for (let index = 0; index < count; index += 1) {
    batch.delete(doc(database, 'announcementPhotos', `${photoId}-${index}`));
  }
}

export async function updateAnnouncement(
  announcement: CampusAnnouncement,
  title: string,
  body: string,
  author: UserProfile,
  options: { imageFile?: File; removeImage?: boolean },
): Promise<void> {
  const database = requireDatabase();
  const batch = writeBatch(database);
  const audit = doc(collection(database, 'auditLogs'));
  const image = options.imageFile ? await encodeAnnouncementImage(options.imageFile) : undefined;
  const update: Record<string, unknown> = {
    title: title.trim(),
    body: body.trim(),
    editedAt: serverTimestamp(),
    lastAuditId: audit.id,
  };
  if (image) {
    Object.assign(update, image.metadata);
  } else if (options.removeImage) {
    update.imagePhotoId = deleteField();
    update.imageContentType = deleteField();
    update.imageChunkCount = deleteField();
  }
  if (image) {
    addAnnouncementImageChunks(batch, announcement.id, image.photoId, image.contentType, image.chunks);
  }
  if ((image || options.removeImage) && announcement.imagePhotoId && announcement.imageChunkCount) {
    removeAnnouncementImageChunks(batch, announcement.imagePhotoId, announcement.imageChunkCount);
  }
  batch.update(doc(database, 'announcements', announcement.id), update);
  batch.set(audit, {
    actorUid: author.uid,
    actorName: author.fullName,
    action: 'announcement.updated',
    targetId: announcement.id,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function deleteAnnouncement(announcement: CampusAnnouncement, author: UserProfile): Promise<void> {
  const database = requireDatabase();
  const batch = writeBatch(database);
  const audit = doc(collection(database, 'auditLogs'));
  batch.update(doc(database, 'announcements', announcement.id), {
    active: false,
    lastAuditId: audit.id,
  });
  if (announcement.imagePhotoId && announcement.imageChunkCount) {
    removeAnnouncementImageChunks(batch, announcement.imagePhotoId, announcement.imageChunkCount);
  }
  batch.set(audit, {
    actorUid: author.uid,
    actorName: author.fullName,
    action: 'announcement.deleted',
    targetId: announcement.id,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function markNotificationRead(id: string): Promise<void> {
  const database = requireDatabase();
  await updateDoc(doc(database, 'notifications', id), { read: true });
}

export function subscribeNotifications(
  uid: string,
  callback: (items: Array<Record<string, unknown> & { id: string }>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onSnapshot(
    query(collection(database, 'notifications'), where('recipientUid', '==', uid), orderBy('createdAt', 'desc'), limit(50)),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError(toUserFacingError(error, 'Unable to load notifications.')),
  );
}

export function exportReportsCsv(rows: Array<Record<string, unknown>>): string {
  const headers = ['id', 'title', 'category', 'buildingName', 'room', 'priority', 'status', 'reporterName', 'assignedToName'];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\r\n');
}
