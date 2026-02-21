import { IsString, IsEmail, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

export class InviteMemberDto {
  @ApiProperty({ description: 'Email of the invitee', example: 'sarah@trudium.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Role to assign', enum: ['org_admin', 'org_recruiter', 'org_member'] })
  @IsEnum(OrgRole)
  @IsNotEmpty()
  role: OrgRole;
}
