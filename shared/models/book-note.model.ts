import { AuditedRecord } from './audited-record';

export interface BookNote extends AuditedRecord {
    id: string;
    bookId: string;
    /** HTML content — may contain entity-reference spans. */
    content: string;
    sortOrder: number;
}
