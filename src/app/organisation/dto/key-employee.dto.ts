import { IsString, IsNotEmpty, IsOptional, IsEmail, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateKeyEmployeeDto {
  @ApiProperty({ description: 'First name', example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName: string;

  @ApiProperty({ description: 'Last name', example: 'Adeyemi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName: string;

  @ApiProperty({ description: 'Job title or role', example: 'Founder & CEO' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ description: 'Short bio', example: 'Visionary entrepreneur with 15+ years...' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'john@trudium.com' })
  @ValidateIf((o) => o.email != null && o.email !== '')
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL' })
  @ValidateIf((o) => o.linkedInUrl != null && o.linkedInUrl !== '')
  @IsUrl()
  @IsOptional()
  linkedInUrl?: string;
}

export class UpdateKeyEmployeeDto {
  @ApiPropertyOptional({ description: 'First name' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Job title or role' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ description: 'Short bio' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @ValidateIf((o) => o.email != null && o.email !== '')
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL' })
  @ValidateIf((o) => o.linkedInUrl != null && o.linkedInUrl !== '')
  @IsUrl()
  @IsOptional()
  linkedInUrl?: string;
}
