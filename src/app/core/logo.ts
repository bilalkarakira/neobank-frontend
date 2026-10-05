import { Component, input } from '@angular/core';

/**
 * The NeoBank mark: an N whose right stem turns into an arrow pointing up (money sent, money growing), on a navy tile.
 * On a dark surface the tile is one step lighter with a hairline edge, so it does not melt into the background.
 * The wordmark inherits the surrounding text colour. The same drawing is public/favicon.svg.
 */
@Component({
  selector: 'app-logo',
  template: `
    <span class="inline-flex items-center gap-2.5">
      <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect width="48" height="48" rx="13" [attr.fill]="onDark() ? '#1E293B' : '#0F172A'" />
        @if (onDark()) {
          <rect x="0.5" y="0.5" width="47" height="47" rx="12.5" stroke="#FFFFFF" stroke-opacity="0.14" />
        }
        <polyline points="14,35 14,15 32,33" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M32 35 V14 M26 20 L32 14 L38 20" stroke="#5EEAD4" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      @if (wordmark()) {
        <span class="text-xl leading-none tracking-tight"><span class="font-bold">Neo</span><span class="font-light">Bank</span></span>
      }
    </span>
  `,
})
export class Logo {
  readonly size = input(36);
  readonly onDark = input(false);
  readonly wordmark = input(true);
}
