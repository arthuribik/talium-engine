import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @ApiProperty({ description: 'New role', enum: ['org_admin', 'org_recruiter', 'org_member'] })
  @IsEnum(OrgRole)
  @IsNotEmpty()
  role: OrgRole;
}
