import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AddressDto {
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

export class UpdateOrganisationProfileDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  companyName?: string;

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

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ type: AddressDto, required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}

