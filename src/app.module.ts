import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './utility/prisma/prisma.module';
import { AuthModule } from './app/auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { OrganisationModule } from './app/organisation/organisation.module';
import { ProfessionalModule } from './app/professional/professional.module';
import { JobModule } from './app/job/job.module';
import { JwtAuthModule } from './utility/jwt/jwt.module';
import { RegistrationModule } from './app/registration/registration.module';
import { GlobalModule } from './global.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    GlobalModule,
    PrismaModule,
    JwtAuthModule,
    AuthModule,
    AdminModule,
    OrganisationModule,
    ProfessionalModule,
    JobModule,
    RegistrationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
