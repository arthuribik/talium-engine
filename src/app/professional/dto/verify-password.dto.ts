import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyPasswordDto {
  @ApiProperty({ description: 'Current password for verification' })
  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password: string;
}
