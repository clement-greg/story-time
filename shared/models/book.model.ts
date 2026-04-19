import { AuditedRecord } from './audited-record';

export interface Book extends AuditedRecord {
    title: string;
    id: string;
    seriesId: string;
    thumnailUrl?: string;
    originalUrl?: string;
    sortOrder?: number;
    archived?: boolean;
    notes?: string;
}