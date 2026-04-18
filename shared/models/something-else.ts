import { AuditedRecord } from './audited-record';

export interface SomethingElse extends AuditedRecord {
    id: string;
    title: string;
}