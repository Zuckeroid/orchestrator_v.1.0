import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NetworkTelemetryClassification,
  NetworkTelemetryEventEntity,
  NetworkTelemetryEventType,
  NetworkTelemetryResult,
} from '../../database/entities/network-telemetry-event.entity';
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

@Injectable()
export class TelemetryService {
  constructor(
    @InjectRepository(NetworkTelemetryEventEntity)
    private readonly repository: Repository<NetworkTelemetryEventEntity>,
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
}
