import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Restringe el endpoint a los códigos de cat_rol indicados (ver docs/PLAN.md sección 5.2). */
export const Roles = (...roles: string[]): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, roles);
