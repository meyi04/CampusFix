import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';

initializeApp();
const database = getFirestore();

export const notifyAdministratorsOfReport = onDocumentCreated('reports/{reportId}', async (event) => {
  const report = event.data?.data();
  if (!report) return;
  const administrators = await database.collection('users')
    .where('role', '==', 'admin')
    .where('active', '==', true)
    .get();
  const batch = database.batch();
  for (const administrator of administrators.docs) {
    const notification = database.collection('notifications').doc();
    batch.set(notification, {
      id: notification.id,
      recipientUid: administrator.id,
      reportId: event.params.reportId,
      title: 'New facility report',
      body: `${report.title} was submitted at ${report.buildingName}.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  if (!administrators.empty) await batch.commit();
});

export const notifyReportUpdates = onDocumentUpdated('reports/{reportId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const notifications = database.collection('notifications');
  const batch = database.batch();

  if (before.status !== after.status) {
    const reporterNotification = notifications.doc();
    batch.set(reporterNotification, {
      id: reporterNotification.id,
      recipientUid: after.reporterUid,
      reportId: event.params.reportId,
      title: `Report ${String(after.status).toLowerCase()}`,
      body: after.resolutionNotes || `Your report status changed to ${after.status}.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  if (before.assignedToUid !== after.assignedToUid && after.assignedToUid) {
    const assignmentNotification = notifications.doc();
    batch.set(assignmentNotification, {
      id: assignmentNotification.id,
      recipientUid: after.assignedToUid,
      reportId: event.params.reportId,
      title: 'Work order assigned',
      body: `${after.title} at ${after.buildingName} is assigned to you.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  if (before.status !== after.status || before.assignedToUid !== after.assignedToUid) await batch.commit();
});

export const deliverPushNotification = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const notification = event.data?.data();
  if (!notification) return;
  const devices = await database.collection(`users/${notification.recipientUid}/devices`).get();
  const tokens = devices.docs
    .map((device) => ({ id: device.id, token: device.data().token }))
    .filter((device): device is { id: string; token: string } => typeof device.token === 'string');
  if (!tokens.length) return;

  const response = await getMessaging().sendEachForMulticast({
    tokens: tokens.map((device) => device.token),
    notification: {
      title: String(notification.title ?? 'CampusFix update'),
      body: String(notification.body ?? 'A facility report has been updated.'),
    },
    data: {
      reportId: String(notification.reportId ?? ''),
      notificationId: event.params.notificationId,
    },
  });

  const cleanup = database.batch();
  response.responses.forEach((result, index) => {
    if (!result.success && result.error?.code === 'messaging/registration-token-not-registered') {
      cleanup.delete(database.doc(`users/${notification.recipientUid}/devices/${tokens[index].id}`));
    }
  });
  if (response.responses.some((result) => !result.success && result.error?.code === 'messaging/registration-token-not-registered')) {
    await cleanup.commit();
  }
});
