import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessedEventEntity } from '../../database/entities/processed-event.entity';
import { ProcessedEventsController } from './processed-events.controller';
import { ProcessedEventsService } from './processed-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessedEventEntity])],
  controllers: [ProcessedEventsController],
  providers: [ProcessedEventsService],
  exports: [ProcessedEventsService],
})
export class ProcessedEventsModule {}
