import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca un endpoint como accesible sin autenticación (p. ej. GET /verificacion). */
export const Publico = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
