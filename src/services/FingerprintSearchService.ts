











import {
  getScopedLogger,
  getFingerprintConfig,
  type TempoQueryServiceInterface,
  type ChildSpanReaderInterface,
} from '../config.js';

const logger = getScopedLogger('fingerprint-search-service');




export interface SearchFilters {
  vpnDetected?: boolean;
  vpnProvider?: string;
  vpnConfidence?: number;

  geoCountry?: string;
  geoCity?: string;
  geoRadius?: { latitude?: number; longitude?: number; radiusKm?: number };
  geoTimezone?: string;

  riskScoreMin?: number;
  riskScoreMax?: number;
  riskTier?: 'low' | 'medium' | 'high' | 'critical';
  vpnSwitching?: boolean;
  impossibleTravel?: boolean;

  lastSeenWithin?: string;
  sessionActive?: boolean;
  firstSeenAfter?: string;
  lastSeenBefore?: string;

  browserName?: string;
  browserVersion?: string;
  browserMajorVersion?: number;
  os?: string;
  osVersion?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet' | 'bot';
  engine?: string;

  ipVersion?: '4' | '6';
  asn?: string;
  datacenterIp?: boolean;
  privateIp?: boolean;
  ipHash?: string;

  userId?: string;
  userHandle?: string;
  sessionId?: string;
  anonymous?: boolean;

  timeWindow?: string;

  page?: number;
  pageSize?: number;
  sortBy?: 'last_seen' | 'first_seen' | 'risk_score' | 'vpn_status' | 'country' | 'browser';
  sortOrder?: 'asc' | 'desc';
}




export interface SearchServiceResult {
  fingerprintId: string;
  firstSeen: string;
  lastSeen: string;
  vpnDetected: boolean;
  vpnProvider?: string;
  riskScore: number;
  riskTier?: string;
  geoCountry?: string;
  geoCity?: string;
  geoLatitude?: number;
  geoLongitude?: number;
  browserName?: string;
  browserVersion?: string;
  os?: string;
  deviceType?: string;
  ipVersion?: string;
  userId?: string;
  userHandle?: string;
  totalVisits: number;
  uniqueIPs: number;
}




export interface SearchResults {
  results: SearchServiceResult[];
  totalResults: number;
  page: number;
  pageSize: number;
  totalPages: number;
  dataSource: 'tempo' | 'loki' | 'none';
}




export interface ServiceSearchFacets {
  countries: Array<{ name: string; code: string; count: number }>;
  cities: Array<{ name: string; country: string; count: number }>;
  browsers: Array<{ name: string; version?: string; count: number }>;
  deviceTypes: Array<{ type: string; count: number }>;
  riskTiers: Array<{ tier: string; count: number }>;
  vpnProviders: Array<{ provider: string; count: number }>;
  operatingSystems: Array<{ os: string; version?: string; count: number }>;
}




export interface ServiceQuickSearchResult {
  type: 'fingerprint' | 'user' | 'ip';
  id: string;
  label: string;
  metadata?: {
    country?: string;
    city?: string;
    lastSeen?: string;
    riskScore?: number;
  };
}




export interface ExportResult {
  downloadUrl: string;
  fileName: string;
  recordCount: number;
  fileSizeBytes: number;
}




export class FingerprintSearchService {
  private tempoService: TempoQueryServiceInterface | null;
  private facetsCache: Map<string, { facets: ServiceSearchFacets; expiresAt: number }>;
  private childSpanReader: ChildSpanReaderInterface | null;
  private readonly FACETS_CACHE_TTL = 5 * 60 * 1000; 

  constructor() {
    const config = getFingerprintConfig();
    this.tempoService = config.tempoQueryService ?? null;
    this.facetsCache = new Map();
    this.childSpanReader = config.childSpanReader ?? null;
  }

  


  async search(filters: SearchFilters): Promise<SearchResults> {
    try {
      logger.info('Starting fingerprint search', { filters });

      if (!this.tempoService) {
        logger.warn('Tempo query service not configured — returning empty results');
        return {
          results: [],
          totalResults: 0,
          page: 1,
          pageSize: filters.pageSize ?? 20,
          totalPages: 0,
          dataSource: 'none' as const,
        };
      }

      const tempoResults = await this.searchTempo(filters);

      const hasGeoData = tempoResults.results.some(r =>
        r.geoLatitude !== null && r.geoLongitude !== null &&
        typeof r.geoLatitude === 'number' && typeof r.geoLongitude === 'number' &&
        !isNaN(r.geoLatitude) && !isNaN(r.geoLongitude)
      );

      logger.info('Tempo search successful', {
        resultCount: tempoResults.totalResults,
        hasGeoData,
      });

      return { ...tempoResults, dataSource: 'tempo' };
    } catch (error) {
      logger.error('Search failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  


  private async searchTempo(filters: SearchFilters): Promise<Omit<SearchResults, 'dataSource'>> {
    const traceQL = this.buildTraceQLQuery(filters);

    logger.debug('Executing Tempo TraceQL query', { traceQL });

    const timeRange = this.parseTimeWindow(filters.timeWindow || '7d');
    const traces = await this.tempoService!.searchTraces(traceQL, timeRange.start, timeRange.end);

    const results = await this.transformTracesToResults(traces);
    const deduplicated = this.deduplicateByFingerprint(results);

    logger.debug('After deduplication', { count: deduplicated.length });

    const sortedResults = this.sortResults(deduplicated, filters.sortBy || 'last_seen', filters.sortOrder || 'desc');
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const paginatedResults = this.paginateResults(sortedResults, page, pageSize);

    return {
      results: paginatedResults,
      totalResults: sortedResults.length,
      page,
      pageSize,
      totalPages: Math.ceil(sortedResults.length / pageSize)
    };
  }

  


  buildTraceQLQuery(filters: SearchFilters): string {
    const conditions: string[] = [];

    if (filters.vpnDetected !== undefined) {
      conditions.push(`span.vpn.detected = ${filters.vpnDetected}`);
    }
    if (filters.vpnProvider) {
      if (filters.vpnProvider.includes('*') || filters.vpnProvider.includes('?')) {
        conditions.push(`span.vpn.provider =~ "${this.wildcardToRegex(filters.vpnProvider)}"`);
      } else {
        conditions.push(`span.vpn.provider = "${filters.vpnProvider}"`);
      }
    }
    if (filters.vpnConfidence !== undefined) {
      conditions.push(`span.vpn.confidence >= ${filters.vpnConfidence}`);
    }

    if (filters.geoCountry) {
      if (filters.geoCountry.includes('*') || filters.geoCountry.includes('?')) {
        conditions.push(`span.geo.country =~ "${this.wildcardToRegex(filters.geoCountry)}"`);
      } else {
        conditions.push(`span.geo.country = "${filters.geoCountry}"`);
      }
    }
    if (filters.geoCity) {
      if (filters.geoCity.includes('*') || filters.geoCity.includes('?')) {
        conditions.push(`span.geo.city =~ "${this.wildcardToRegex(filters.geoCity)}"`);
      } else {
        conditions.push(`span.geo.city = "${filters.geoCity}"`);
      }
    }

    if (filters.riskScoreMin !== undefined && filters.riskScoreMax !== undefined) {
      if (filters.riskScoreMin === filters.riskScoreMax) {
        conditions.push(`span.risk.score = ${filters.riskScoreMin}`);
      } else {
        conditions.push(`span.risk.score >= ${filters.riskScoreMin} && span.risk.score <= ${filters.riskScoreMax}`);
      }
    } else if (filters.riskScoreMin !== undefined) {
      conditions.push(`span.risk.score >= ${filters.riskScoreMin}`);
    } else if (filters.riskScoreMax !== undefined) {
      conditions.push(`span.risk.score <= ${filters.riskScoreMax}`);
    }
    if (filters.riskTier) {
      conditions.push(`span.risk.tier = "${filters.riskTier}"`);
    }

    if (filters.browserName) {
      if (filters.browserName.includes('*') || filters.browserName.includes('?')) {
        conditions.push(`span.browser.name =~ "${this.wildcardToRegex(filters.browserName)}"`);
      } else {
        conditions.push(`span.browser.name = "${filters.browserName}"`);
      }
    }
    if (filters.browserMajorVersion !== undefined) {
      conditions.push(`span.browser.major_version = ${filters.browserMajorVersion}`);
    }
    if (filters.browserVersion) {
      if (filters.browserVersion.includes('*') || filters.browserVersion.includes('?')) {
        conditions.push(`span.browser.version =~ "${this.wildcardToRegex(filters.browserVersion)}"`);
      } else {
        conditions.push(`span.browser.version = "${filters.browserVersion}"`);
      }
    }
    if (filters.os) {
      if (filters.os.includes('*') || filters.os.includes('?')) {
        conditions.push(`span.os.name =~ "${this.wildcardToRegex(filters.os)}"`);
      } else {
        conditions.push(`span.os.name = "${filters.os}"`);
      }
    }
    if (filters.osVersion) {
      if (filters.osVersion.includes('*') || filters.osVersion.includes('?')) {
        conditions.push(`span.os.version =~ "${this.wildcardToRegex(filters.osVersion)}"`);
      } else {
        conditions.push(`span.os.version = "${filters.osVersion}"`);
      }
    }
    if (filters.deviceType) {
      conditions.push(`span.device.type = "${filters.deviceType}"`);
    }
    if (filters.engine) {
      if (filters.engine.includes('*') || filters.engine.includes('?')) {
        conditions.push(`span.engine.name =~ "${this.wildcardToRegex(filters.engine)}"`);
      } else {
        conditions.push(`span.engine.name = "${filters.engine}"`);
      }
    }

    if (filters.userId) {
      conditions.push(`span.user.id = "${filters.userId}"`);
    }
    if (filters.userHandle) {
      if (filters.userHandle.includes('*') || filters.userHandle.includes('?')) {
        conditions.push(`span.user.handle =~ "${this.wildcardToRegex(filters.userHandle)}"`);
      } else {
        conditions.push(`span.user.handle = "${filters.userHandle}"`);
      }
    }

    if (filters.ipVersion) {
      conditions.push(`span.network.ip.version = "${filters.ipVersion}"`);
    }
    if (filters.asn) {
      conditions.push(`span.network.asn = "${filters.asn}"`);
    }
    if (filters.datacenterIp !== undefined) {
      conditions.push(`span.network.datacenter = ${filters.datacenterIp}`);
    }

    const query = conditions.length > 0
      ? `{ name="fingerprint.enrichment" && ${conditions.join(' && ')} }`
      : `{ name="fingerprint.enrichment" }`;

    logger.debug('Built optimized TraceQL query', {
      filterCount: conditions.length,
      hasWildcards: query.includes('=~'),
    });

    return query;
  }

  


  wildcardToRegex(pattern: string): string {
    let regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return `(?i)${regex}`;
  }

  


  private async transformTracesToResults(traces: any[]): Promise<SearchServiceResult[]> {
    const fingerprintMap = new Map<string, any[]>();

    for (const trace of traces) {
      const spanAttrs = trace.spanSet?.spans?.[0]?.attributes || [];
      const attrs: Record<string, any> = {};
      for (const attr of spanAttrs) {
        const value = attr.value.stringValue ||
                      String(attr.value.intValue ?? '') ||
                      String(attr.value.doubleValue ?? '') ||
                      String(attr.value.boolValue ?? '');
        if (value) attrs[attr.key] = value;
      }

      const fingerprintId = attrs['fingerprint.id'];
      if (!fingerprintId) continue;

      if (!fingerprintMap.has(fingerprintId)) {
        fingerprintMap.set(fingerprintId, []);
      }
      fingerprintMap.get(fingerprintId)!.push(trace);
    }

    const results: SearchServiceResult[] = [];

    for (const [fingerprintId, fpTraces] of fingerprintMap.entries()) {
      const latestTrace = fpTraces[fpTraces.length - 1];
      const latestSpanAttrs = latestTrace.spanSet?.spans?.[0]?.attributes || [];
      const attrs: Record<string, any> = {};
      for (const attr of latestSpanAttrs) {
        const value = attr.value.stringValue ||
                      String(attr.value.intValue ?? '') ||
                      String(attr.value.doubleValue ?? '') ||
                      String(attr.value.boolValue ?? '');
        if (value) attrs[attr.key] = value;
      }

      const geo = await this.extractGeoFromTrace(latestTrace, attrs);

      const firstSeenNano = fpTraces[0].startTimeUnixNano;
      const lastSeenNano = latestTrace.startTimeUnixNano;

      results.push({
        fingerprintId,
        firstSeen: firstSeenNano ? new Date(parseInt(firstSeenNano) / 1000000).toISOString() : new Date().toISOString(),
        lastSeen: lastSeenNano ? new Date(parseInt(lastSeenNano) / 1000000).toISOString() : new Date().toISOString(),
        vpnDetected: attrs['vpn.detected'] === 'true' || attrs['vpn.detected'] === true,
        vpnProvider: attrs['vpn.provider'],
        riskScore: parseInt(attrs['risk.score']) || 0,
        riskTier: attrs['risk.tier'],
        geoCountry: geo.country,
        geoCity: geo.city ?? undefined,
        geoLatitude: geo.latitude ?? undefined,
        geoLongitude: geo.longitude ?? undefined,
        browserName: attrs['browser.name'],
        browserVersion: attrs['browser.version'],
        os: attrs['os.name'],
        deviceType: attrs['device.type'],
        ipVersion: attrs['ip.version'],
        userId: attrs['user.id'],
        userHandle: attrs['user.handle'],
        totalVisits: fpTraces.length,
        uniqueIPs: new Set(fpTraces.map((t: any) => {
          const ipAttrs = t.spanSet?.spans?.[0]?.attributes || [];
          for (const attr of ipAttrs) {
            if (attr.key === 'ip.hash') return attr.value.stringValue || '';
          }
          return '';
        }).filter((ip: string) => ip)).size
      });
    }

    return results;
  }

  


  private async extractGeoFromTrace(
    trace: any,
    attrs: Record<string, any>
  ): Promise<{
    country: string | undefined;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    source?: string;
  }> {
    const parentGeo = {
      country: attrs['geo.country'],
      city: attrs['geo.city'],
      latitude: parseFloat(attrs['geo.latitude']),
      longitude: parseFloat(attrs['geo.longitude'])
    };

    const parentHasGeo =
      parentGeo.country &&
      parentGeo.city &&
      !isNaN(parentGeo.latitude) &&
      !isNaN(parentGeo.longitude);

    if (parentHasGeo) {
      return {
        country: parentGeo.country,
        city: parentGeo.city,
        latitude: parentGeo.latitude,
        longitude: parentGeo.longitude,
        source: 'parent-span'
      };
    }

    
    if (this.childSpanReader) {
      const childGeo = await this.childSpanReader.readGeo(trace);
      if (childGeo) {
        logger.debug('Used child span for geo data', {
          fingerprintId: attrs['fingerprint.id'],
          source: childGeo.source,
        });
        return {
          country: childGeo.country,
          city: childGeo.city,
          latitude: childGeo.latitude,
          longitude: childGeo.longitude,
          source: childGeo.source
        };
      }
    }

    return { country: undefined, city: null, latitude: null, longitude: null, source: 'none' };
  }

  


  private deduplicateByFingerprint(results: SearchServiceResult[]): SearchServiceResult[] {
    const byFingerprint = new Map<string, SearchServiceResult>();

    for (const result of results) {
      const existing = byFingerprint.get(result.fingerprintId);

      const resultHasCoords = result.geoLatitude !== null && result.geoLongitude !== null &&
                           typeof result.geoLatitude === 'number' && typeof result.geoLongitude === 'number' &&
                           !isNaN(result.geoLatitude) && !isNaN(result.geoLongitude);
      const existingHasCoords = existing?.geoLatitude !== null && existing?.geoLongitude !== null &&
                             typeof existing?.geoLatitude === 'number' && typeof existing?.geoLongitude === 'number' &&
                             !isNaN(existing?.geoLatitude as number) && !isNaN(existing?.geoLongitude as number);

      if (!existing ||
          (resultHasCoords && !existingHasCoords) ||
          (resultHasCoords === existingHasCoords && new Date(result.lastSeen) > new Date(existing.lastSeen))) {
        byFingerprint.set(result.fingerprintId, result);
      }
    }

    return Array.from(byFingerprint.values());
  }

  


  private sortResults(
    results: SearchServiceResult[],
    sortBy: SearchFilters['sortBy'],
    sortOrder: SearchFilters['sortOrder']
  ): SearchServiceResult[] {
    const sorted = [...results].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case 'last_seen':
          aValue = new Date(a.lastSeen).getTime();
          bValue = new Date(b.lastSeen).getTime();
          break;
        case 'first_seen':
          aValue = new Date(a.firstSeen).getTime();
          bValue = new Date(b.firstSeen).getTime();
          break;
        case 'risk_score':
          aValue = a.riskScore;
          bValue = b.riskScore;
          break;
        case 'vpn_status':
          aValue = a.vpnDetected ? 1 : 0;
          bValue = b.vpnDetected ? 1 : 0;
          break;
        case 'country':
          aValue = a.geoCountry || '';
          bValue = b.geoCountry || '';
          break;
        case 'browser':
          aValue = a.browserName || '';
          bValue = b.browserName || '';
          break;
        default:
          aValue = new Date(a.lastSeen).getTime();
          bValue = new Date(b.lastSeen).getTime();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }

  


  private paginateResults(
    results: SearchServiceResult[],
    page: number,
    pageSize: number
  ): SearchServiceResult[] {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return results.slice(startIndex, endIndex);
  }

  


  parseTimeWindow(timeWindow: string): { start: number; end: number } {
    const endMs = Date.now();
    let durationMs = 7 * 24 * 60 * 60 * 1000;

    const match = timeWindow.match(/^(\d+)([hdwmy])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      switch (unit) {
        case 'h': durationMs = value * 60 * 60 * 1000; break;
        case 'd': durationMs = value * 24 * 60 * 60 * 1000; break;
        case 'w': durationMs = value * 7 * 24 * 60 * 60 * 1000; break;
        case 'm': durationMs = value * 30 * 24 * 60 * 60 * 1000; break;
        case 'y': durationMs = value * 365 * 24 * 60 * 60 * 1000; break;
      }
    }

    const startMs = endMs - durationMs;
    return {
      start: Math.floor(startMs / 1000),
      end: Math.floor(endMs / 1000)
    };
  }

  


  async quickSearch(
    query: string,
    type: 'fingerprint' | 'user' | 'ip' | 'all',
    limit: number = 5
  ): Promise<ServiceQuickSearchResult[]> {
    if (!query || query.length < 2) return [];
    if (!this.tempoService) return [];

    logger.debug('Quick search', { query, type, limit });

    const results: ServiceQuickSearchResult[] = [];

    try {
      if (type === 'fingerprint' || type === 'all') {
        const suggestions = await this.tempoService.getTagValueSuggestions('fingerprint.id', query, limit);
        for (const fingerprintId of suggestions) {
          results.push({
            type: 'fingerprint',
            id: fingerprintId,
            label: `Fingerprint: ${fingerprintId.slice(0, 24)}${fingerprintId.length > 24 ? '...' : ''}`,
            metadata: {}
          });
        }
      }

      if (type === 'user' || type === 'all') {
        const suggestions = await this.tempoService.getTagValueSuggestions('user.handle', query, limit);
        for (const userHandle of suggestions) {
          results.push({
            type: 'user',
            id: userHandle,
            label: `User: @${userHandle}`,
            metadata: {}
          });
        }
      }

      return results.slice(0, limit);
    } catch (error) {
      logger.error('Quick search failed', {
        error: error instanceof Error ? error.message : String(error),
        query, type
      });
      return [];
    }
  }

  


  async getFacets(timeWindow: string = '7d'): Promise<ServiceSearchFacets> {
    const cacheKey = `facets:${timeWindow}`;
    const cached = this.facetsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Returning cached facets', { timeWindow });
      return cached.facets;
    }

    if (!this.tempoService) {
      return this.emptyFacets();
    }

    logger.info('Computing facets', { timeWindow });

    const records = await this.tempoService.queryFingerprints(timeWindow, {}, 1000);

    const countryMap = new Map<string, number>();
    const cityMap = new Map<string, { country: string; count: number }>();
    const browserMap = new Map<string, number>();
    const deviceMap = new Map<string, number>();
    const riskMap = new Map<string, number>();
    const vpnMap = new Map<string, number>();
    const osMap = new Map<string, number>();

    for (const record of records) {
      if (record.geoCountry) countryMap.set(record.geoCountry, (countryMap.get(record.geoCountry) || 0) + 1);
      if (record.geoCity && record.geoCountry) {
        const key = `${record.geoCity},${record.geoCountry}`;
        const existing = cityMap.get(key) || { country: record.geoCountry, count: 0 };
        existing.count++;
        cityMap.set(key, existing);
      }
      if (record.deviceType) deviceMap.set(record.deviceType, (deviceMap.get(record.deviceType) || 0) + 1);
      if (record.riskTier) riskMap.set(record.riskTier, (riskMap.get(record.riskTier) || 0) + 1);
      if (record.vpnProvider) vpnMap.set(record.vpnProvider, (vpnMap.get(record.vpnProvider) || 0) + 1);
    }

    const facets: ServiceSearchFacets = {
      countries: Array.from(countryMap.entries())
        .map(([name, count]) => ({ name, code: name.substring(0, 2).toUpperCase(), count }))
        .sort((a, b) => b.count - a.count).slice(0, 20),
      cities: Array.from(cityMap.entries())
        .map(([key, data]) => ({ name: key.split(',')[0], country: data.country, count: data.count }))
        .sort((a, b) => b.count - a.count).slice(0, 50),
      browsers: Array.from(browserMap.entries())
        .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      deviceTypes: Array.from(deviceMap.entries())
        .map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      riskTiers: Array.from(riskMap.entries())
        .map(([tier, count]) => ({ tier, count })).sort((a, b) => b.count - a.count),
      vpnProviders: Array.from(vpnMap.entries())
        .map(([provider, count]) => ({ provider, count })).sort((a, b) => b.count - a.count),
      operatingSystems: Array.from(osMap.entries())
        .map(([os, count]) => ({ os, count })).sort((a, b) => b.count - a.count),
    };

    this.facetsCache.set(cacheKey, { facets, expiresAt: Date.now() + this.FACETS_CACHE_TTL });

    logger.info('Facets computed', {
      countriesCount: facets.countries.length,
      citiesCount: facets.cities.length,
    });

    return facets;
  }

  


  async exportResults(filters: SearchFilters & { format: string; includeTimeline?: boolean }): Promise<ExportResult> {
    logger.info('Exporting search results', { format: filters.format });
    const results = await this.search({ ...filters, pageSize: 10000 });
    const fileName = `fingerprint-export-${Date.now()}.${filters.format}`;
    const downloadUrl = `/api/exports/${fileName}`;
    return { downloadUrl, fileName, recordCount: results.totalResults, fileSizeBytes: 0 };
  }

  private emptyFacets(): ServiceSearchFacets {
    return {
      countries: [], cities: [], browsers: [], deviceTypes: [],
      riskTiers: [], vpnProviders: [], operatingSystems: []
    };
  }
}
