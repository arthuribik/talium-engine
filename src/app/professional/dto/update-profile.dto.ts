import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsObject,
  ValidateNested,
  IsDateString,
  IsEnum,
  IsArray,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IDType } from '@prisma/client';

class LocationItemDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

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
  documentType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  documentUrl?: string;
}

class SocialMediaDto {
  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  linkedin?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  twitter?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  facebook?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  instagram?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  github?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  portfolio?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  tiktok?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  snapchat?: string;
}

export class UpdateProfessionalProfileDto {
  @ApiProperty({ required: false, description: 'Professional title e.g. Senior Software Engineer' })
  @IsString()
  @IsOptional()
  profession?: string;

  @ApiProperty({ required: false, description: 'First name (updates User)' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ required: false, description: 'Last name (updates User)' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ required: false, description: 'Middle name(s)' })
  @IsString()
  @IsOptional()
  middleName?: string;

  @ApiProperty({ required: false, description: 'Gender' })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty({ enum: IDType, required: false })
  @IsEnum(IDType)
  @IsOptional()
  idType?: IDType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  idNumber?: string;

  @ApiProperty({ required: false, description: 'URL or path to uploaded ID document' })
  @IsString()
  @IsOptional()
  idDocumentUrl?: string;

  @ApiProperty({ required: false, description: 'Location proof document type' })
  @IsString()
  @IsOptional()
  locationDocumentType?: string;

  @ApiProperty({ required: false, description: 'URL or path to uploaded location document' })
  @IsString()
  @IsOptional()
  locationDocumentUrl?: string;

  @ApiProperty({
    required: false,
    description: 'Public profile photo URL; omit to leave unchanged, null or empty string to remove',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  profileImageUrl?: string | null;

  @ApiProperty({ type: [LocationItemDto], required: false, description: 'List of locations' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationItemDto)
  @IsOptional()
  locations?: LocationItemDto[];

  @ApiProperty({ type: SocialMediaDto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialMediaDto)
  socialMedia?: SocialMediaDto;

  @ApiProperty({ required: false, description: 'Certifications list (JSON array)' })
  @IsOptional()
  certifications?: any;

  @ApiProperty({ required: false, description: 'Family info (marital status, spouse, relations)' })
  @IsOptional()
  familyInfo?: any;

  @ApiProperty({
    required: false,
    description: 'IANA timezone (e.g. Africa/Lagos). Empty string clears.',
  })
  @IsString()
  @IsOptional()
  timezone?: string | null;
}
