import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AdminRoleEnum {
  super_admin = 'super_admin',
  admin = 'admin',
  support = 'support',
  auditor = 'auditor',
}

/** Invitation link validity (stored on `Admin.invitationExpiresAt`). */
export enum AdminInviteAccessExpiry {
  none = 'none',
  days_7 = '7d',
  days_14 = '14d',
  days_30 = '30d',
}

export class InviteAdminDto {
  @ApiPropertyOptional({
    description:
      'Single full name (e.g. from team drawer). If set, firstName/lastName are derived.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => !o.fullName?.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => !o.fullName?.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName?: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ enum: AdminRoleEnum })
  @IsEnum(AdminRoleEnum)
  @IsNotEmpty()
  role: AdminRoleEnum;

  @ApiPropertyOptional({
    description: 'Optional note included in the invitation email body.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  personalMessage?: string;

  @ApiPropertyOptional({ enum: AdminInviteAccessExpiry })
  @IsOptional()
  @IsEnum(AdminInviteAccessExpiry)
  accessExpiry?: AdminInviteAccessExpiry;
}
