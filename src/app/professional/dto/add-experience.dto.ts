import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class LocationDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  country?: string;
}

class SalaryRangeDto {
  @ApiProperty()
  @IsNumber()
  min: number;

  @ApiProperty()
  @IsNumber()
  max: number;
}

export class AddExperienceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  organisationName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  industry: string;

  @ApiProperty({ type: LocationDto })
  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty({ enum: ['full_time', 'part_time', 'contract', 'internship'] })
  @IsEnum(['full_time', 'part_time', 'contract', 'internship'])
  @IsNotEmpty()
  employmentType: string;

  @ApiProperty({ enum: ['remote', 'hybrid', 'on_site', 'global_remote'] })
  @IsEnum(['remote', 'hybrid', 'on_site', 'global_remote'])
  @IsNotEmpty()
  workMode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  currentlyWorking: boolean;

  @ApiProperty({ required: false, description: 'Job / role description (stored separately from responsibilities)' })
  @IsString()
  @IsOptional()
  jobDescription?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  responsibilities: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  achievements: string[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  paymentMode?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ type: SalaryRangeDto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => SalaryRangeDto)
  salaryRange?: SalaryRangeDto;

  @ApiProperty({ required: false, description: 'How the user chose to verify (e.g. self_declaration, work_email)' })
  @IsString()
  @IsOptional()
  verificationMethod?: string;

  @ApiProperty({
    required: false,
    description: 'Work email used for OTP verification (read-only from server after verify)',
  })
  @IsString()
  @IsOptional()
  workVerificationEmail?: string;

  @ApiProperty({ required: false, description: 'Supporting document URL for upload_document flow' })
  @IsString()
  @IsOptional()
  supportingMediaUrl?: string;
}
