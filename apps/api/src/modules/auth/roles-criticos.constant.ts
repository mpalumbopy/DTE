/** Roles que exigen MFA obligatoria (ver docs/PLAN.md sección 0.4). */
export const ROLES_CRITICOS = ['ADMIN_PSDTE', 'OPERADOR_EMISION', 'AUTORIDAD', 'AUDITOR'] as const;

export function esRolCritico(rol: string): boolean {
  return (ROLES_CRITICOS as readonly string[]).includes(rol);
}
