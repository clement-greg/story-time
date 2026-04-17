import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SomethingElse } from '@shared/models/something-else';

@Injectable({ providedIn: 'root' })
export class SomethingElseService {
  private http = inject(HttpClient);
  private readonly apiUrl = '/api/something-else';

  getAll(): Observable<SomethingElse[]> {
    return this.http.get<SomethingElse[]>(this.apiUrl);
  }

  getById(id: string): Observable<SomethingElse> {
    return this.http.get<SomethingElse>(`${this.apiUrl}/${id}`);
  }

  create(item: SomethingElse): Observable<SomethingElse> {
    return this.http.post<SomethingElse>(this.apiUrl, item);
  }

  update(item: SomethingElse): Observable<SomethingElse> {
    return this.http.put<SomethingElse>(`${this.apiUrl}/${item.id}`, item);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
