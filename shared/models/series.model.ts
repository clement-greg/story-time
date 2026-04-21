import { AuditedRecord } from './audited-record';

export interface Series extends AuditedRecord {
    title: string;
    id: string;
    thumnailUrl?: string;
    originalUrl?: string;
    systemPrompt?: string;
    collaborators?: string[];
    archived?: boolean;
    deleted?: boolean;
}
