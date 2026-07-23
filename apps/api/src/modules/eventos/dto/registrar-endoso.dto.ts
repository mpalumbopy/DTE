import { IsUUID } from 'class-validator';

export class RegistrarEndosoDto {
  @IsUUID()
  endosatarioPersonaId!: string;
}
