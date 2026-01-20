import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsObject, ValidateNested } from 'class-validator';
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

export class Step1Dto {
  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  isRegistered: boolean;
}

export class Step2Dto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  legalName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  countryOfIncorporation: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  incorporationNumber: string;
}

export class Step3Dto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category: string;

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
}

export class Step4Dto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  otherName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  industry: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  headquartersCity: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  headquartersCountry: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  foundedDate: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}

export class Step7Dto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  organisationName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  organisationCountry: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  industry: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  foundedDate: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}

export class Step8Dto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category: string;

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
}

export class Step5Dto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  organisationEmail: string;
}

