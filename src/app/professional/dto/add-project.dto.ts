import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ProjectTeamMemberDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  role?: string;
}

export class AddProjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  projectLink?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiProperty({ type: [ProjectTeamMemberDto], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProjectTeamMemberDto)
  teamMembers?: ProjectTeamMemberDto[];

  @ApiProperty({
    required: false,
    description:
      'Optional. Omit for new projects (stays pending). Send `self_declaration` only after the user confirms self-declaration (counts as verified for that flow).',
  })
  @IsString()
  @IsOptional()
  verificationMethod?: string;
}
