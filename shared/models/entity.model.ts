export type EntityReference = 'full-name' | 'first-name' | 'last-name' | 'nickname';

export interface Entity {
    id: string;
    name: string;
    type: 'PERSON' | 'PLACE' | 'THING';
    seriesId: string;
    sortOrder?: number;
    thumbnailUrl?: string;
    originalUrl?: string;
    biography?: string;
    firstName?: string;
    lastName?: string;
    nickname?: string;
    preferredReference?: EntityReference;
    personality?: string;
}