import { IsString, Length } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  mfaPendingToken!: string;

  @IsString()
  @Length(6, 6)
  codigo!: string;
}
