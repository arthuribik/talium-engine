import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsInt,
  IsDateString,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class PayDto {
  @ApiProperty()
  @IsInt()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string;

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

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  location: string;

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
  closingDate?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  requirements: string[];

  @ApiProperty({ type: ApplyCTADto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => ApplyCTADto)
  applyCTA?: ApplyCTADto;
}
