import { IsString, IsNotEmpty, IsOptional, IsInt, IsEnum, IsUrl, Min, Max, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class AddressDto {
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
  state: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country: string;
}

export class OrganisationSetupDto {
  @ApiProperty({ enum: ['registered', 'not_registered'] })
  @IsEnum(['registered', 'not_registered'])
  @IsNotEmpty()
  incorporationStatus: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  countryOfIncorporation: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  incorporationNumber?: string;

  @ApiProperty()
  @IsInt()
  @Min(1800)
  @Max(new Date().getFullYear())
  @IsNotEmpty()
  yearOfCommencement: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companySize?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiProperty({ type: AddressDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

