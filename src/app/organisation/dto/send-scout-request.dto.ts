import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendScoutRequestDto {
  @ApiProperty({ description: 'Role / job title', example: 'Senior Software Engineer' })
  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @ApiProperty({ description: 'Employment type', example: 'full_time' })
  @IsString()
  @IsNotEmpty()
  employmentType: string;

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
