import { IsDefined } from 'class-validator';

export class ActualizarParametroDto {
  @IsDefined()
  valor!: unknown;
}
