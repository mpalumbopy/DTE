import { IsString, MinLength } from 'class-validator';

export class MotivoDto {
  @IsString()
  @MinLength(3)
  motivo!: string;
}
