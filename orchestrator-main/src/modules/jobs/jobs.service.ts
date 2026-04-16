import { InjectQueue } from '@nestjs/bull';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import { JobEntity } from '../../database/entities/job.entity';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly repository: Repository<JobEntity>,
    @InjectQueue('billing-events')
    private readonly billingQueue: Queue,
  ) {}

  async listPersisted(filters: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<JobEntity[]> {
    const query = this.repository
      .createQueryBuilder('job')
      .orderBy('job.created_at', 'DESC');

    if (filters.status) {
      query.andWhere('job.status = :status', { status: filters.status });
    }

    if (filters.type) {
      query.andWhere('job.type = :type', { type: filters.type });
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const page = Math.max(filters.page ?? 1, 1);

    return query
      .take(limit)
      .skip((page - 1) * limit)
      .getMany();
  }

  async getPersistedById(id: string): Promise<JobEntity> {
    const job = await this.repository.findOneBy({ id });
    if (!job) {
      throw new NotFoundException(`Job not found: ${id}`);
    }

    return job;
  }

  async getQueueOverview() {
    const counts = await this.billingQueue.getJobCounts();
    const [waiting, active, failed, completed, delayed] = await Promise.all([
      this.billingQueue.getJobs(['waiting'], 0, 20),
      this.billingQueue.getJobs(['active'], 0, 20),
      this.billingQueue.getJobs(['failed'], 0, 20),
      this.billingQueue.getJobs(['completed'], 0, 20),
      this.billingQueue.getJobs(['delayed'], 0, 20),
    ]);

    return {
      counts,
      waiting: waiting.map((job) => this.serializeBullJob(job)),
      active: active.map((job) => this.serializeBullJob(job)),
      failed: failed.map((job) => this.serializeBullJob(job)),
      completed: completed.map((job) => this.serializeBullJob(job)),
      delayed: delayed.map((job) => this.serializeBullJob(job)),
    };
  }

  private serializeBullJob(job: any) {
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }
}
