import { IsArray, ValidateNested, IsString, IsNotEmpty, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class DocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName: string;
}

export class VerificationRequestDto {
  @ApiProperty({ type: [DocumentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DocumentDto)
  documents: DocumentDto[];
}

