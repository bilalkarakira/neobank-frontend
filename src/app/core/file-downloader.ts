import { Injectable } from '@angular/core';

/** Saves a blob as a file. A service (not a bare function) so tests can replace it. */
@Injectable({ providedIn: 'root' })
export class FileDownloader {
  save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
