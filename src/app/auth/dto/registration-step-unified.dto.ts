import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class AddressDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  buildingName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  streetNumber?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country: string;
}

export class RegistrationStepDto {
  @ApiProperty({
    description: 'Step number (1, 2, 3, 4, 5, 7, or 8)',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  step: number;

  @ApiPropertyOptional({
    description:
      'Registration ID (optional for steps 1 and 7, required for others)',
  })
  @IsString()
  @IsOptional()
  id?: string;

  // Step 1 fields
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isRegistered?: boolean;

  // Step 2 fields
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  legalName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  countryOfIncorporation?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  incorporationNumber?: string;

  // Step 3 & 8 fields (Category)
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  schoolType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  religiousOrgType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  internationalOrgType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  politicalPartyCountry?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  associatedSchool?: string;

  // Step 4 fields
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  otherName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  headquartersCity?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  headquartersCountry?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  foundedDate?: string;

  @ApiPropertyOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  @IsOptional()
  address?: AddressDto;

  // Step 5 fields
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  organisationEmail?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  // Step 7 fields (non-registered)
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  organisationName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  organisationCountry?: string;
}
