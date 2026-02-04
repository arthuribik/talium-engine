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
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country: string;
}

class SalaryRangeDto {
  @ApiProperty()
  @IsNumber()
  min: number;

  @ApiProperty()
  @IsNumber()
  max: number;
}

class VerificationContactDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  email: string;
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

  @ApiProperty({ type: VerificationContactDto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => VerificationContactDto)
  verificationContact?: VerificationContactDto;
}
