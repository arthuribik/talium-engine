import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

const MAX_INCORP_YEAR = new Date().getFullYear() + 1;

export class KybIncorporationDto {
  @ApiProperty({ example: 'Example Technologies Ltd' })
  @IsString()
  @IsNotEmpty()
  legalName: string;

  @ApiProperty({ example: 'RC123456789' })
  @IsString()
  @IsNotEmpty()
  incorporationNumber: string;

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  @IsNotEmpty()
  countryOfIncorporation: string;

  @ApiProperty({ example: 2020 })
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return value;
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    return Number.isFinite(n) ? n : value;
  })
  @IsInt()
  @Min(1800)
  @Max(MAX_INCORP_YEAR)
  yearOfIncorporation: number;
}
