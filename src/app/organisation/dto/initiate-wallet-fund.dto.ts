import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class InitiateWalletFundDto {
  @ApiProperty({ description: 'Number of Taldium Tokens (TTK) to purchase', minimum: 1 })
  @IsInt()
  @Min(1)
  ttkAmount: number;
}
