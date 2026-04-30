import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  NetworkTelemetryClassification,
  NetworkTelemetryEventEntity,
  NetworkTelemetryEventType,
  NetworkTelemetryResult,
} from '../../database/entities/network-telemetry-event.entity';
import { NetworkTelemetryHourlyEntity } from '../../database/entities/network-telemetry-hourly.entity';
import { CreateNetworkTelemetryEventDto } from './dto/create-network-telemetry-event.dto';

export interface NetworkTelemetryFilters {
  nodeId?: string;
  result?: NetworkTelemetryResult;
  classification?: NetworkTelemetryClassification;
  carrierName?: string;
  eventType?: NetworkTelemetryEventType;
  page?: number;
  limit?: number;
}

interface RawHourlyAggregateRow {
  bucketStart: Date | string;
  eventType: NetworkTelemetryEventType;
  nodeId: string | null;
  nodeName: string | null;
  nodeCountry: string | null;
  carrierName: string | null;
  networkType: string | null;
  protocol: string | null;
  transport: string | null;
  classification: NetworkTelemetryClassification | null;
  total: number;
  success: number;
  failed: number;
  timeout: number;
  skipped: number;
  avgLatencyMs: number | null;
  lastObservedAt: Date | string | null;
}

export interface DpiMonitorMatrixRow {
  carrierName: string | null;
  networkType: string | null;
  nodeId: string | null;
  nodeName: string | null;
  nodeCountry: string | null;
  protocol: string | null;
  transport: string | null;
  classification: NetworkTelemetryClassification | null;
  total: number;
  success: number;
  failed: number;
  timeout: number;
  skipped: number;
  issueCount: number;
  failureRate: number;
  avgLatencyMs: number | null;
  lastObservedAt: Date | string | null;
  status: 'blocked_suspected' | 'degraded' | 'learning' | 'ok';
}

@Injectable()
export class TelemetryService {
  constructor(
    @InjectRepository(NetworkTelemetryEventEntity)
    private readonly repository: Repository<NetworkTelemetryEventEntity>,
    @InjectRepository(NetworkTelemetryHourlyEntity)
    private readonly hourlyRepository: Repository<NetworkTelemetryHourlyEntity>,
  ) {}

  async record(
    input: CreateNetworkTelemetryEventDto,
  ): Promise<NetworkTelemetryEventEntity> {
    const event = this.repository.create({
      ...this.normalizeOptionalStrings(input),
      nodePort: input.nodePort,
      latencyMs: input.latencyMs,
      details: input.details,
      classification:
        input.classification ??
        this.classify(input.eventType, input.result, input.errorCode),
      observedAt: input.observedAt ? new Date(input.observedAt) : new Date(),
    });

    return this.repository.save(event);
  }

  async list(filters: NetworkTelemetryFilters) {
    const query = this.repository
      .createQueryBuilder('event')
      .orderBy('event.observed_at', 'DESC');

    if (filters.nodeId) {
      query.andWhere('event.node_id = :nodeId', { nodeId: filters.nodeId });
    }
    if (filters.result) {
      query.andWhere('event.result = :result', { result: filters.result });
    }
    if (filters.classification) {
      query.andWhere('event.classification = :classification', {
        classification: filters.classification,
      });
    }
    if (filters.carrierName) {
      query.andWhere('LOWER(event.carrier_name) = LOWER(:carrierName)', {
        carrierName: filters.carrierName,
      });
    }
    if (filters.eventType) {
      query.andWhere('event.event_type = :eventType', {
        eventType: filters.eventType,
      });
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const page = Math.max(filters.page ?? 1, 1);

    return query
      .take(limit)
      .skip((page - 1) * limit)
      .getMany();
  }

  async summary(hours = 24) {
    const boundedHours = Math.min(Math.max(hours, 1), 24 * 30);
    return this.repository
      .createQueryBuilder('event')
      .select('event.node_id', 'nodeId')
      .addSelect('event.node_name', 'nodeName')
      .addSelect('event.node_country', 'nodeCountry')
      .addSelect('event.carrier_name', 'carrierName')
      .addSelect('event.network_type', 'networkType')
      .addSelect('event.classification', 'classification')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(
        "SUM(CASE WHEN event.result = 'success' THEN 1 ELSE 0 END)::int",
        'success',
      )
      .addSelect(
        "SUM(CASE WHEN event.result <> 'success' THEN 1 ELSE 0 END)::int",
        'failed',
      )
      .addSelect('MAX(event.observed_at)', 'lastObservedAt')
      .where(`event.observed_at >= now() - (:hours * interval '1 hour')`, {
        hours: boundedHours,
      })
      .groupBy('event.node_id')
      .addGroupBy('event.node_name')
      .addGroupBy('event.node_country')
      .addGroupBy('event.carrier_name')
      .addGroupBy('event.network_type')
      .addGroupBy('event.classification')
      .orderBy('failed', 'DESC')
      .addOrderBy('total', 'DESC')
      .limit(100)
      .getRawMany();
  }

  async refreshHourlyAggregates(hours = 72) {
    const boundedHours = this.boundHours(hours, 24 * 30);
    const cutoff = this.hourCutoff(boundedHours);
    const rows = await this.repository
      .createQueryBuilder('event')
      .select("date_trunc('hour', event.observed_at)", 'bucketStart')
      .addSelect('event.event_type', 'eventType')
      .addSelect('event.node_id', 'nodeId')
      .addSelect('event.node_name', 'nodeName')
      .addSelect('event.node_country', 'nodeCountry')
      .addSelect('event.carrier_name', 'carrierName')
      .addSelect('event.network_type', 'networkType')
      .addSelect('event.protocol', 'protocol')
      .addSelect('event.transport', 'transport')
      .addSelect('event.classification', 'classification')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(
        "SUM(CASE WHEN event.result = 'success' THEN 1 ELSE 0 END)::int",
        'success',
      )
      .addSelect(
        "SUM(CASE WHEN event.result = 'failed' THEN 1 ELSE 0 END)::int",
        'failed',
      )
      .addSelect(
        "SUM(CASE WHEN event.result = 'timeout' THEN 1 ELSE 0 END)::int",
        'timeout',
      )
      .addSelect(
        "SUM(CASE WHEN event.result = 'skipped' THEN 1 ELSE 0 END)::int",
        'skipped',
      )
      .addSelect('ROUND(AVG(event.latency_ms))::int', 'avgLatencyMs')
      .addSelect('MAX(event.observed_at)', 'lastObservedAt')
      .where('event.observed_at >= :cutoff', { cutoff })
      .groupBy("date_trunc('hour', event.observed_at)")
      .addGroupBy('event.event_type')
      .addGroupBy('event.node_id')
      .addGroupBy('event.node_name')
      .addGroupBy('event.node_country')
      .addGroupBy('event.carrier_name')
      .addGroupBy('event.network_type')
      .addGroupBy('event.protocol')
      .addGroupBy('event.transport')
      .addGroupBy('event.classification')
      .getRawMany<RawHourlyAggregateRow>();

    const aggregates = rows.map((row) =>
      this.hourlyRepository.create({
        bucketStart: new Date(row.bucketStart),
        eventType: row.eventType,
        nodeId: row.nodeId,
        nodeName: row.nodeName,
        nodeCountry: row.nodeCountry,
        carrierName: row.carrierName,
        networkType: row.networkType,
        protocol: row.protocol,
        transport: row.transport,
        classification: row.classification,
        total: Number(row.total),
        success: Number(row.success),
        failed: Number(row.failed),
        timeout: Number(row.timeout),
        skipped: Number(row.skipped),
        avgLatencyMs:
          row.avgLatencyMs === null || row.avgLatencyMs === undefined
            ? null
            : Number(row.avgLatencyMs),
        lastObservedAt: row.lastObservedAt ? new Date(row.lastObservedAt) : null,
      }),
    );

    await this.hourlyRepository.manager.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('network_telemetry_hourly_refresh'))",
      );
      const hourlyRepository = manager.getRepository(
        NetworkTelemetryHourlyEntity,
      );
      await hourlyRepository.delete({ bucketStart: MoreThanOrEqual(cutoff) });
      if (aggregates.length > 0) {
        await hourlyRepository.save(aggregates);
      }
    });

    return {
      windowHours: boundedHours,
      refreshedRows: aggregates.length,
      refreshedAt: new Date(),
    };
  }

  async overview(hours = 24, refresh = true) {
    const boundedHours = this.boundHours(hours, 24 * 30);
    if (refresh) {
      await this.refreshHourlyAggregates(Math.max(boundedHours, 72));
    }
    const cutoff = this.hourCutoff(boundedHours);
    const totals = await this.hourlyRepository
      .createQueryBuilder('hourly')
      .select('COALESCE(SUM(hourly.total), 0)::int', 'total')
      .addSelect('COALESCE(SUM(hourly.success), 0)::int', 'success')
      .addSelect('COALESCE(SUM(hourly.failed), 0)::int', 'failed')
      .addSelect('COALESCE(SUM(hourly.timeout), 0)::int', 'timeout')
      .addSelect('COALESCE(SUM(hourly.skipped), 0)::int', 'skipped')
      .addSelect(
        `COALESCE(SUM(CASE WHEN hourly.classification IS NOT NULL
          AND hourly.classification <> 'client_network_changed'
          THEN hourly.total ELSE 0 END), 0)::int`,
        'suspected',
      )
      .where('hourly.bucket_start >= :cutoff', { cutoff })
      .getRawOne<{
        total: number;
        success: number;
        failed: number;
        timeout: number;
        skipped: number;
        suspected: number;
      }>();

    const [topCarriers, topNodes, classifications] = await Promise.all([
      this.groupOverview('carrierName', cutoff, 8),
      this.groupOverview('nodeName', cutoff, 8),
      this.groupOverview('classification', cutoff, 8),
    ]);

    return {
      windowHours: boundedHours,
      generatedAt: new Date(),
      totals: this.normalizeTotals(totals),
      topCarriers,
      topNodes,
      classifications,
    };
  }

  async matrix(hours = 24, refresh = true): Promise<DpiMonitorMatrixRow[]> {
    const boundedHours = this.boundHours(hours, 24 * 30);
    if (refresh) {
      await this.refreshHourlyAggregates(Math.max(boundedHours, 72));
    }
    const cutoff = this.hourCutoff(boundedHours);
    const rows = await this.hourlyRepository
      .createQueryBuilder('hourly')
      .select('hourly.carrier_name', 'carrierName')
      .addSelect('hourly.network_type', 'networkType')
      .addSelect('hourly.node_id', 'nodeId')
      .addSelect('hourly.node_name', 'nodeName')
      .addSelect('hourly.node_country', 'nodeCountry')
      .addSelect('hourly.protocol', 'protocol')
      .addSelect('hourly.transport', 'transport')
      .addSelect('hourly.classification', 'classification')
      .addSelect('COALESCE(SUM(hourly.total), 0)::int', 'total')
      .addSelect('COALESCE(SUM(hourly.success), 0)::int', 'success')
      .addSelect('COALESCE(SUM(hourly.failed), 0)::int', 'failed')
      .addSelect('COALESCE(SUM(hourly.timeout), 0)::int', 'timeout')
      .addSelect('COALESCE(SUM(hourly.skipped), 0)::int', 'skipped')
      .addSelect('ROUND(AVG(hourly.avg_latency_ms))::int', 'avgLatencyMs')
      .addSelect('MAX(hourly.last_observed_at)', 'lastObservedAt')
      .where('hourly.bucket_start >= :cutoff', { cutoff })
      .groupBy('hourly.carrier_name')
      .addGroupBy('hourly.network_type')
      .addGroupBy('hourly.node_id')
      .addGroupBy('hourly.node_name')
      .addGroupBy('hourly.node_country')
      .addGroupBy('hourly.protocol')
      .addGroupBy('hourly.transport')
      .addGroupBy('hourly.classification')
      .orderBy('failed', 'DESC')
      .addOrderBy('timeout', 'DESC')
      .addOrderBy('total', 'DESC')
      .limit(200)
      .getRawMany<
        Omit<
          DpiMonitorMatrixRow,
          'issueCount' | 'failureRate' | 'status'
        >
      >();

    return rows.map((row) => {
      const total = Number(row.total);
      const success = Number(row.success);
      const failed = Number(row.failed);
      const timeout = Number(row.timeout);
      const skipped = Number(row.skipped);
      const issueCount = failed + timeout;
      const failureRate =
        total > 0 ? Math.round((issueCount / total) * 1000) / 10 : 0;

      return {
        carrierName: row.carrierName,
        networkType: row.networkType,
        nodeId: row.nodeId,
        nodeName: row.nodeName,
        nodeCountry: row.nodeCountry,
        protocol: row.protocol,
        transport: row.transport,
        classification: row.classification,
        total,
        success,
        failed,
        timeout,
        skipped,
        issueCount,
        failureRate,
        avgLatencyMs:
          row.avgLatencyMs === null || row.avgLatencyMs === undefined
            ? null
            : Number(row.avgLatencyMs),
        lastObservedAt: row.lastObservedAt,
        status: this.matrixStatus(total, issueCount, failureRate),
      };
    });
  }

  private classify(
    eventType: NetworkTelemetryEventType,
    result: NetworkTelemetryResult,
    errorCode?: string,
  ): NetworkTelemetryClassification | null {
    if (result === 'success' || result === 'skipped') {
      return null;
    }

    if (errorCode === 'ERR_NETWORK_CHANGED') {
      return 'client_network_changed';
    }

    switch (eventType) {
      case 'dns_resolution':
        return 'dns_suspected';
      case 'node_tcp_connect':
        return 'ip_or_port_suspected';
      case 'vpn_handshake':
        return 'protocol_suspected';
      case 'tunnel_http':
        return 'node_exit_degraded';
      case 'route_probe':
      default:
        return 'unknown';
    }
  }

  private normalizeOptionalStrings(input: CreateNetworkTelemetryEventDto) {
    return {
      eventType: input.eventType,
      result: input.result,
      nodeId: this.clean(input.nodeId),
      nodeName: this.clean(input.nodeName),
      nodeCountry: this.clean(input.nodeCountry),
      nodeHost: this.clean(input.nodeHost),
      protocol: this.clean(input.protocol),
      transport: this.clean(input.transport),
      networkType: this.clean(input.networkType),
      carrierName: this.clean(input.carrierName),
      mcc: this.clean(input.mcc),
      mnc: this.clean(input.mnc),
      appVersion: this.clean(input.appVersion),
      platform: this.clean(input.platform),
      installIdHash: this.clean(input.installIdHash),
      deviceConfigId: this.clean(input.deviceConfigId),
      errorCode: this.clean(input.errorCode),
      errorMessage: this.clean(input.errorMessage)?.slice(0, 1000),
    };
  }

  private clean(value?: string): string | null {
    const cleanValue = value?.trim();
    return cleanValue ? cleanValue : null;
  }

  private async groupOverview(
    column: 'carrierName' | 'nodeName' | 'classification',
    cutoff: Date,
    limit: number,
  ) {
    const databaseColumn =
      column === 'carrierName'
        ? 'hourly.carrier_name'
        : column === 'nodeName'
          ? 'hourly.node_name'
          : 'hourly.classification';

    const query = this.hourlyRepository
      .createQueryBuilder('hourly')
      .select(databaseColumn, 'key')
      .addSelect('COALESCE(SUM(hourly.total), 0)::int', 'total')
      .addSelect('COALESCE(SUM(hourly.failed), 0)::int', 'failed')
      .addSelect('COALESCE(SUM(hourly.timeout), 0)::int', 'timeout')
      .addSelect('MAX(hourly.last_observed_at)', 'lastObservedAt')
      .where('hourly.bucket_start >= :cutoff', { cutoff })
      .groupBy(databaseColumn);

    if (column === 'classification') {
      query.andWhere('hourly.classification IS NOT NULL');
    }

    const rows = await query
      .orderBy('failed', 'DESC')
      .addOrderBy('timeout', 'DESC')
      .addOrderBy('total', 'DESC')
      .limit(limit)
      .getRawMany<{
        key: string | null;
        total: number;
        failed: number;
        timeout: number;
        lastObservedAt: Date | string | null;
      }>();

    return rows.map((row) => ({
      key: row.key ?? 'unknown',
      total: Number(row.total),
      failed: Number(row.failed),
      timeout: Number(row.timeout),
      lastObservedAt: row.lastObservedAt,
    }));
  }

  private normalizeTotals(totals?: {
    total: number;
    success: number;
    failed: number;
    timeout: number;
    skipped: number;
    suspected: number;
  }) {
    return {
      total: Number(totals?.total ?? 0),
      success: Number(totals?.success ?? 0),
      failed: Number(totals?.failed ?? 0),
      timeout: Number(totals?.timeout ?? 0),
      skipped: Number(totals?.skipped ?? 0),
      suspected: Number(totals?.suspected ?? 0),
    };
  }

  private matrixStatus(
    total: number,
    issueCount: number,
    failureRate: number,
  ): DpiMonitorMatrixRow['status'] {
    if (total < 3) {
      return 'learning';
    }

    if (issueCount >= 3 && failureRate >= 60) {
      return 'blocked_suspected';
    }

    if (issueCount >= 2 && failureRate >= 25) {
      return 'degraded';
    }

    return 'ok';
  }

  private boundHours(hours: number, maxHours: number): number {
    return Math.min(Math.max(Number.isFinite(hours) ? hours : 24, 1), maxHours);
  }

  private hourCutoff(hours: number): Date {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    cutoff.setMinutes(0, 0, 0);
    return cutoff;
  }
}
