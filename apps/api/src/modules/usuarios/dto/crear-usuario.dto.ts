import { ArrayMinSize, IsArray, IsEmail, IsString, MinLength } from 'class-validator';

export class CrearUsuarioDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roles!: string[];
}
