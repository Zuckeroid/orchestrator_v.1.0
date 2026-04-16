import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bull';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectQueue('billing-events')
    private readonly billingQueue: Queue,
  ) {}

  async check() {
    const [db, redis, queue] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkQueue(),
    ]);

    const ok = db === 'ok' && redis === 'ok' && queue.status === 'ok';

    return {
      status: ok ? 'ok' : 'degraded',
      db,
      redis,
      queue,
    };
  }

  private async checkDb(): Promise<'ok' | 'error'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      const client = this.billingQueue.client;
      const response = await client.ping();
      return response === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }

  private async checkQueue() {
    try {
      const counts = await this.billingQueue.getJobCounts();
      return {
        status: 'ok',
        counts,
      };
    } catch {
      return {
        status: 'error',
        counts: {},
      };
    }
  }
}

