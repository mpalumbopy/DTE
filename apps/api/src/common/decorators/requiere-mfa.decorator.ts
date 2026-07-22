import { SetMetadata } from '@nestjs/common';

export const REQUIERE_MFA_KEY = 'requiereMfa';

/** Exige que la sesión actual tenga MFA verificada (además del rol), ver MfaGuard. */
export const RequiereMfa = (): ReturnType<typeof SetMetadata> => SetMetadata(REQUIERE_MFA_KEY, true);
