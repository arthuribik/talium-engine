import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../utility/prisma/prisma.module';
import { JwtAuthModule } from '../utility/jwt/jwt.module';
import { AuthModule } from '../app/auth/auth.module';

@Module({
  imports: [PrismaModule, JwtAuthModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
