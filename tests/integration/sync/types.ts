import { Sync } from '../../../src/sync/models/sync';

export type StringifiedSync = Partial<Omit<Sync, 'startDate' | 'endDate' | 'dumpDate'>> & { startDate?: string; endDate?: string; dumpDate?: string };

export type StringifiedRerun = Partial<{ rerunId: string; startDate: string }>;
