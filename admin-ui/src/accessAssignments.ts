import type { ApiSchemas } from "./api/types";

/** Access assignment of the shared contract (`/api/admin/access-assignments`). */
export type AccessAssignment = Required<ApiSchemas["AccessAssignmentResponse"]>;
export type AccessAssignmentCreateRequest = ApiSchemas["AccessAssignmentCreateRequest"];
export type AccessRole = AccessAssignmentCreateRequest["role"];
export type CurrentIdentity = Required<ApiSchemas["CurrentIdentityResponse"]>;
export type AccessStatusFilter = "ACTIVE" | "DISABLED" | "ALL";

export const ACCESS_ASSIGNMENTS_PATH = "/api/admin/access-assignments";
export const CURRENT_IDENTITY_PATH = "/api/admin/me/identity";

export const accessRoles: ReadonlyArray<{ value: AccessRole; label: string }> = [
  { value: "store-manager", label: "Marktleiter (store-manager)" },
  { value: "region-manager", label: "Regionsmanager (region-manager)" },
  { value: "admin", label: "Administrator (admin)" }
];

export interface AccessDraft {
  keycloakSubject: string;
  username: string;
  email: string;
  role: AccessRole;
  regionId: string;
  storeId: string;
}

export const blankAccessDraft = (): AccessDraft => ({ keycloakSubject: "", username: "", email: "", role: "store-manager", regionId: "", storeId: "" });

export function canManageAccess(role: string): boolean {
  return role === "admin";
}

export function accessListPath(status: AccessStatusFilter): string {
  return status === "ALL" ? ACCESS_ASSIGNMENTS_PATH : `${ACCESS_ASSIGNMENTS_PATH}?status=${status}`;
}

export function roleLabel(role: string): string {
  return accessRoles.find((entry) => entry.value === role)?.label ?? role;
}

/** Scope column: store for store managers, region for region managers, everything for admins. */
export function scopeLabel(assignment: AccessAssignment): string {
  if (assignment.storeId) return [assignment.storeName, assignment.storeCode && `(${assignment.storeCode})`].filter(Boolean).join(" ");
  if (assignment.regionId) return assignment.regionName ?? assignment.regionId;
  return assignment.role === "admin" ? "Alle Märkte" : "–";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same rules as the backend: subject without spaces, store-manager needs a store, region-manager needs a region. */
export function validateAccessDraft(draft: AccessDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const subject = draft.keycloakSubject.trim();
  if (!subject) errors.keycloakSubject = "Keycloak-ID (sub) ist erforderlich.";
  else if (/\s/.test(subject)) errors.keycloakSubject = "Die Keycloak-ID darf keine Leerzeichen enthalten.";
  else if (subject.length > 120) errors.keycloakSubject = "Die Keycloak-ID darf höchstens 120 Zeichen enthalten.";
  if (!draft.username.trim()) errors.username = "Benutzername ist erforderlich.";
  else if (draft.username.trim().length > 120) errors.username = "Der Benutzername darf höchstens 120 Zeichen enthalten.";
  const email = draft.email.trim();
  if (email && (!EMAIL.test(email) || email.length > 254)) errors.email = "Bitte eine gültige E-Mail-Adresse eingeben.";
  if (draft.role === "store-manager" && !draft.storeId) errors.storeId = "Ein Marktleiter braucht einen Markt.";
  if (draft.role === "region-manager" && !draft.regionId) errors.regionId = "Ein Regionsmanager braucht eine Region.";
  return errors;
}

/** Request body: only the scope field the role uses is sent. */
export function accessPayload(draft: AccessDraft): AccessAssignmentCreateRequest {
  return {
    keycloakSubject: draft.keycloakSubject.trim(),
    username: draft.username.trim(),
    email: draft.email.trim() || null,
    role: draft.role,
    regionId: draft.role === "region-manager" ? draft.regionId : null,
    storeId: draft.role === "store-manager" ? draft.storeId : null
  };
}
