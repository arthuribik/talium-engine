import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { PrismaModule } from '../../utility/prisma/prisma.module';
import { JwtAuthModule } from '../../utility/jwt/jwt.module';

@Module({
  imports: [PrismaModule, JwtAuthModule],
  controllers: [JobController],
  providers: [JobService],
  exports: [JobService],
})
export class JobModule {}

