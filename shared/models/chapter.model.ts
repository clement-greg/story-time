export interface ChapterNote {
    id: string;
    noteText: string;
    selectedText: string;
    createdAt: string;
}

export interface Chapter { 
    title: string;
    id: string;
    bookId: string;
    content?: string;
    contentVector?: number[];
    notes?: ChapterNote[];
}

export interface ChapterVersion {
    id: string;
    chapterId: string;
    savedAt: string;  // ISO timestamp
    content: string;  // HTML snapshot of chapter content
}