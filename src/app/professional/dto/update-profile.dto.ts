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
}

export class UpdateProfessionalProfileDto {
  @ApiProperty({ required: false, description: 'Professional title e.g. Senior Software Engineer' })
  @IsString()
  @IsOptional()
  profession?: string;

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
}
