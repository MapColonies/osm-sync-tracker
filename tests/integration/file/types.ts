import { File } from '../../../src/file/models/file';

export type StringifiedFile = Partial<Omit<File, 'startDate' | 'endDate'>> & { startDate?: string; endDate?: string };
