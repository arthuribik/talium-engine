import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOrganisationCustomRoleDto {
  @ApiProperty({ example: 'Hiring Manager' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    example: 'Can review applicants and post jobs for their department.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    example: ['jobs.create', 'applicants.view', 'team.invite'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permissions: string[];
}

export class UpdateOrganisationCustomRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permissions?: string[];
}
