import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProvisionEntity } from '../../database/entities/provision.entity';
import { ProvisionsController } from './provisions.controller';
import { ProvisionsService } from './provisions.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProvisionEntity])],
  controllers: [ProvisionsController],
  providers: [ProvisionsService],
  exports: [ProvisionsService],
})
export class ProvisionsModule {}
