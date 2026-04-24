import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Coerce JSON/form numeric strings; empty becomes undefined for @IsOptional(). */
function toOptionalInt({ value }: { value: unknown }): unknown {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : value;
}

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

  @ApiProperty({ required: false, minimum: 1, maximum: 12 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(12)
  startMonth?: number;

  @ApiProperty({ required: false, minimum: 1970, maximum: 2100 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1970)
  @Max(2100)
  startYear?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 12 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(12)
  endMonth?: number;

  @ApiProperty({ required: false, minimum: 1970, maximum: 2100 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1970)
  @Max(2100)
  endYear?: number;

  @ApiProperty({
    required: false,
    description:
      'Optional. Omit for new projects (stays pending). Send `self_declaration` only after the user confirms self-declaration (counts as verified for that flow).',
  })
  @IsString()
  @IsOptional()
  verificationMethod?: string;
}
