import type { Role } from '@prisma/client';

export interface Actor {
  id: string;
  role: Role;
}

export function isAdmin(actor: Actor | null | undefined): boolean {
  return actor?.role === 'ADMIN';
}

/**
 * Owner-or-admin check. Returns false if actor is missing.
 * Used after fetching a resource to enforce row-level access.
 */
export function canAccessResource(actor: Actor | null | undefined, ownerId: string): boolean {
  if (!actor) return false;
  if (actor.role === 'ADMIN') return true;
  return actor.id === ownerId;
}
