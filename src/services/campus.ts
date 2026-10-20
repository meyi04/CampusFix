import {
  getDocs,
  collection,
  doc,
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
  return onSnapshot(
    query(collection(database, 'announcements'), where('active', '==', true), orderBy('createdAt', 'desc'), limit(50)),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CampusAnnouncement)),
    (error) => onError(toUserFacingError(error, 'Unable to load announcements.')),
  );
}

export async function createAnnouncement(title: string, body: string, author: UserProfile): Promise<void> {
  const database = requireDatabase();
  const batch = writeBatch(database);
  const announcement = doc(collection(database, 'announcements'));
  const audit = doc(collection(database, 'auditLogs'));
  batch.set(announcement, {
    title: title.trim(),
    body: body.trim(),
    authorUid: author.uid,
    authorName: author.fullName,
    active: true,
    createdAt: serverTimestamp(),
    createdAuditId: audit.id,
  });
  batch.set(audit, {
    actorUid: author.uid,
    actorName: author.fullName,
    action: 'announcement.created',
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
