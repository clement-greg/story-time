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
}
