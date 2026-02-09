import { Global, Module } from '@nestjs/common';
import { ResendEntity } from './utility/mail';

@Global()
@Module({
  providers: [ResendEntity],
  exports: [ResendEntity],
})
export class GlobalModule {}
