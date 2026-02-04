import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum SubscriptionPlan {
  // Organisation plans
  STARTER = 'starter',
  STANDARD = 'standard',
  RECRUITER = 'recruiter',
  ENTERPRISE = 'enterprise',
  // Professional plans
  EXPRESS = 'express',
  BLOOM = 'bloom',
  PRIME = 'prime',
}

export class InitiatePaymentDto {
  @ApiProperty({
    enum: SubscriptionPlan,
    description: 'Subscription plan to subscribe to',
  })
  @IsEnum(SubscriptionPlan)
  @IsNotEmpty()
  plan: SubscriptionPlan;

  @ApiProperty({
    required: false,
    description: 'Billing cycle (monthly or yearly)',
  })
  @IsString()
  billingCycle?: string;
}
