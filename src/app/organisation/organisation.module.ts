import { Module } from '@nestjs/common';
import { OrganisationController } from './organisation.controller';
import { OrganisationSingularController } from './organisation-singular.controller';
import { OrganisationService } from './organisation.service';
import { PrismaModule } from '../../utility/prisma/prisma.module';
import { JwtAuthModule } from '../../utility/jwt/jwt.module';

@Module({
  imports: [PrismaModule, JwtAuthModule],
  controllers: [OrganisationController, OrganisationSingularController],
  providers: [OrganisationService],
  exports: [OrganisationService],
})
export class OrganisationModule {}

