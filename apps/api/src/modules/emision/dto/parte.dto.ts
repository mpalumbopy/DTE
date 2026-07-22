import { IsString, IsUUID } from 'class-validator';

export class ParteDto {
  @IsUUID()
  personaId!: string;

  @IsString()
  condicionFirmante!: string;
}
