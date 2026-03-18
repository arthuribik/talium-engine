import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsInt,
  IsNumber,
  IsDateString,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class PayDto {
  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  amount?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  min?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  max?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  period: string;
}

class ApplyCTADto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  requireVerification: string[];
}

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiProperty({ required: false, type: [String], description: 'Alternative to location: multiple locations joined as comma-separated' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  locations?: string[];

  @ApiProperty({ enum: ['remote', 'hybrid', 'on_site', 'global_remote'] })
  @IsEnum(['remote', 'hybrid', 'on_site', 'global_remote'])
  @IsNotEmpty()
  workMode: string;

  @ApiProperty({ enum: ['full_time', 'part_time', 'contract', 'internship'] })
  @IsEnum(['full_time', 'part_time', 'contract', 'internship'])
  @IsNotEmpty()
  employmentType: string;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  experienceYears?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  jobLevel?: string;

  @ApiProperty({ type: PayDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PayDto)
  pay: PayDto;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  closingDate?: string;

  @ApiProperty({ required: false, default: '' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ type: [String], required: false, default: [] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requirements?: string[];

  @ApiProperty({ type: ApplyCTADto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => ApplyCTADto)
  applyCTA?: ApplyCTADto;

  @ApiProperty({
    type: [Object],
    required: false,
    description: 'Screening questions: [{ question: string; type?: string; optional?: boolean; options?: string[] }]',
  })
  @IsArray()
  @IsOptional()
  qualifyingQuestions?: Array<{ question: string; type?: string; optional?: boolean; options?: string[] }>;

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Required applicant data keys: full_name, email, nationality, location, phone, government_id, academic_data, work_data, skill_set, social_media, financial_data, reference_data',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredApplicantData?: string[];

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Distribution channels: taldium_network, google_search, monday_com, lensa, linkedin, indeed, glassdoor',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  distributionChannels?: string[];
}
