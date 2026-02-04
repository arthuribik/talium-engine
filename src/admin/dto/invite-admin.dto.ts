import { IsEmail, IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum AdminRoleEnum {
  super_admin = 'super_admin',
  admin = 'admin',
  support = 'support',
  auditor = 'auditor',
}

export class InviteAdminDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ enum: AdminRoleEnum })
  @IsEnum(AdminRoleEnum)
  @IsNotEmpty()
  role: AdminRoleEnum;
}
