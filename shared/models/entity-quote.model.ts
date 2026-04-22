export interface EntityQuote {
  id: string;
  chapterId: string;
  entityId: string;
  /** The quoted text, without the surrounding quote marks */
  text: string;
  isHighlighted: boolean;
  owner?: string;
  createdAt?: string;
}
