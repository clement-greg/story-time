import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Entity } from '@shared/models/entity.model';

@Injectable({ providedIn: 'root' })
export class EntityService {
  private http = inject(HttpClient);
  private readonly apiUrl = '/api/entities';

  getAll(): Observable<Entity[]> {
    return this.http.get<Entity[]>(this.apiUrl);
  }

  getBySeries(seriesId: string): Observable<Entity[]> {
    return this.http.get<Entity[]>(`${this.apiUrl}/series/${seriesId}`);
  }

  getById(id: string): Observable<Entity> {
    return this.http.get<Entity>(`${this.apiUrl}/${id}`);
  }

  create(entity: Entity): Observable<Entity> {
    return this.http.post<Entity>(this.apiUrl, entity);
  }

  update(entity: Entity): Observable<Entity> {
    return this.http.put<Entity>(`${this.apiUrl}/${entity.id}`, entity);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  archive(id: string): Observable<Entity> {
    return this.http.patch<Entity>(`${this.apiUrl}/${id}/archive`, {});
  }

  unarchive(id: string): Observable<Entity> {
    return this.http.patch<Entity>(`${this.apiUrl}/${id}/unarchive`, {});
  }

  uploadThumbnail(file: File): Observable<{ url: string; thumbnailUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string; thumbnailUrl: string }>('/api/upload', formData);
  }

  generatePersonality(entityId: string, basicDescription: string): Observable<{ personality: string }> {
    return this.http.post<{ personality: string }>(`${this.apiUrl}/${entityId}/generate-personality`, { basicDescription });
  }

  generateImage(prompt: string, provider: 'gpt' | 'gemini' = 'gpt'): Observable<{ url: string; thumbnailUrl: string }> {
    return this.http.post<{ url: string; thumbnailUrl: string }>('/api/image/generate', { prompt, provider });
  }
}
