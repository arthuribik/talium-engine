import { IsString, IsOptional, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DIRECT_SCOUT_EMPLOYMENT_TYPES } from './scout-search.dto';

export class SendScoutRequestDto {
  @ApiProperty({ description: 'Role / job title', example: 'Senior Software Engineer' })
  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @ApiProperty({
    description: 'Employment type',
    enum: DIRECT_SCOUT_EMPLOYMENT_TYPES,
    example: 'full_time',
  })
  @IsString()
  @IsIn(DIRECT_SCOUT_EMPLOYMENT_TYPES)
  @IsNotEmpty()
  employmentType: (typeof DIRECT_SCOUT_EMPLOYMENT_TYPES)[number];

  @ApiProperty({ description: 'Work mode', example: 'hybrid' })
  @IsString()
  @IsNotEmpty()
  workMode: string;

  @ApiProperty({ description: 'Role location / office', required: false })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ description: 'Job description (role, responsibilities, requirements)', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Optional additional message', required: false })
  @IsString()
  @IsOptional()
  message?: string;
}
