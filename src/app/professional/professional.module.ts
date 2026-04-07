import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ProfessionalController } from './professional.controller';
import { ProfessionalService } from './professional.service';
import { PrismaModule } from '../../utility/prisma/prisma.module';
import { JwtAuthModule } from '../../utility/jwt/jwt.module';

@Module({
  imports: [PrismaModule, JwtAuthModule, EventEmitterModule],
  controllers: [ProfessionalController],
  providers: [ProfessionalService],
  exports: [ProfessionalService],
})
export class ProfessionalModule {}
