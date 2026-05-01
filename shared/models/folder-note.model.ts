export interface FolderNote {
  id: string;
  folderId: string;
  name: string;
  content: string;
  seriesId?: string;
  owner?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}
