import { AuditedRecord } from './audited-record';

export type RelationshipType =
  | 'parent'
  | 'child'
  | 'sibling'
  | 'spouse'
  | 'friend'
  | 'enemy'
  | 'coworker'
  | 'mentor'
  | 'student'
  | 'rival'
  | 'ally'
  | 'boss'
  | 'subordinate';

export const RELATIONSHIP_TYPES: { value: RelationshipType; label: string }[] = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'friend', label: 'Friend' },
  { value: 'enemy', label: 'Enemy' },
  { value: 'coworker', label: 'Coworker' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'student', label: 'Student' },
  { value: 'rival', label: 'Rival' },
  { value: 'ally', label: 'Ally' },
  { value: 'boss', label: 'Boss' },
  { value: 'subordinate', label: 'Subordinate' },
];

export interface EntityRelationship extends AuditedRecord {
  id: string;
  seriesId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: RelationshipType;
  description?: string;
}

export interface DiagramNodePosition {
  entityId: string;
  x: number;
  y: number;
}

export interface DiagramLayout extends AuditedRecord {
  id: string;
  seriesId: string;
  positions: DiagramNodePosition[];
}
