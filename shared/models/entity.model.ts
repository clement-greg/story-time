export interface Entity {
    id: string;
    name: string;
    type: 'PERSON' | 'PLACE' | 'THING';
    seriesId: string;
    thumbnailUrl?: string;
    originalUrl?: string;
    biography?: string;
}