import { Module } from '@nestjs/common';
import { OrganisationController } from './organisation.controller';
import { OrganisationService } from './organisation.service';
import { PrismaModule } from '../../utility/prisma/prisma.module';
import { JwtAuthModule } from '../../utility/jwt/jwt.module';

@Module({
  imports: [PrismaModule, JwtAuthModule],
  controllers: [OrganisationController],
  providers: [OrganisationService],
  exports: [OrganisationService],
})
export class OrganisationModule {}

