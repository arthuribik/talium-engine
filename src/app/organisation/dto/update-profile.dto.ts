import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsObject,
  ValidateNested,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

class AddressDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  buildingName?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  streetNumber?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  street?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  zipCode?: string;
}

class SocialMediaDto {
  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  facebook?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  twitter?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  linkedin?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  instagram?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  youtube?: string;
}

export class UpdateOrganisationProfileDto {
  // Basic Information
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  legalName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  otherName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  // Registration Status
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isRegistered?: boolean;

  // Incorporation Details (for registered)
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  countryOfIncorporation?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  incorporationNumber?: string;

  // Organisation Details (for non-registered)
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  organisationCountry?: string;

  // Category
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  schoolType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  religiousOrgType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  internationalOrgType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  politicalPartyCountry?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  associatedSchool?: string;

  // Business Details
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companySize?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  headquartersCity?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  headquartersCountry?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  foundedDate?: string;

  // Contact & Online
  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiProperty({ type: SocialMediaDto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialMediaDto)
  socialMedia?: SocialMediaDto;

  // Address
  @ApiProperty({ type: AddressDto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}
