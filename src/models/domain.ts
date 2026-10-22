import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'faculty' | 'maintenance' | 'admin';
export type ReportPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type ReportStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Assigned'
  | 'In Progress'
  | 'Pending Verification'
  | 'Resolved'
  | 'Closed'
  | 'Rejected'
  | 'Needs Clarification'
  | 'Reopened';

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  identifier: string;
  department: string;
  contact: string;
  active: boolean;
  lastAuditId?: string;
}

export interface FacilityReport {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryId: string;
  buildingId: string;
  buildingName: string;
  room: string;
  priority: ReportPriority;
  status: ReportStatus;
  lastHistoryId: string;
  lastAuditId?: string;
  imageUrls: string[];
  maintenancePhotos?: Array<{ photoId?: string; url?: string; phase: 'before' | 'after'; uploadedBy: string }>;
  reporterUid: string;
  reporterName: string;
  assignedToUid: string | null;
  assignedToName: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  resolutionNotes?: string;
  latitude?: number;
  longitude?: number;
}

export interface ReportHistoryEntry {
  id: string;
  reportId: string;
  previousStatus: ReportStatus | null;
  newStatus: ReportStatus;
  actorUid: string;
  actorName: string;
  notes: string;
  createdAt: Timestamp;
}

export interface ReportComment {
  id: string;
  reportId: string;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt: Timestamp;
}

export interface CampusBuilding {
  id: string;
  name: string;
  active: boolean;
}

export interface CampusRoom {
  id: string;
  buildingId: string;
  name: string;
  active: boolean;
}

export interface CampusCategory {
  id: string;
  name: string;
  active: boolean;
}

export interface CampusAnnouncement {
  id: string;
  title: string;
  body: string;
  authorUid: string;
  authorName?: string;
  createdAt: Timestamp;
  active: boolean;
  imageUrl?: string;
  imagePhotoId?: string;
  imageContentType?: string;
  imageChunkCount?: number;
}
