import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { CHANNEL_LABELS, ChannelType } from '@shared/models';

export const CHANNEL_COLORS: Record<ChannelType, string> = {
  whatsapp: '#25d366',
  instagram: '#e1306c',
  messenger: '#0084ff',
  telegram: '#229ed9',
  tiktok: '#111111',
  webchat: '#ff6b1a',
  email: '#6366f1',
};

const GLYPHS: Record<ChannelType, string> = {
  whatsapp: '<path fill="#fff" d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.3 20.7l4.4-1.1A8.8 8.8 0 1 0 12 3.2Zm4.3 12.1c-.2.5-1 1-1.5 1-.4.1-.9.1-1.4 0-.3-.1-.8-.2-1.3-.5-2.3-1-3.8-3.3-3.9-3.4-.1-.2-.9-1.2-.9-2.3s.6-1.6.8-1.9c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4l.7 1.6c.1.1.1.3 0 .4l-.2.4-.3.4c-.1.1-.2.3-.1.5.1.2.6 1 1.3 1.6.9.8 1.6 1 1.8 1.1.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.1.1.6-.1 1.1Z"/>',
  instagram: '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="2"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/>',
  messenger: '<path fill="#fff" d="M12 3.5c-4.8 0-8.5 3.5-8.5 8.2 0 2.5 1 4.6 2.7 6.1v2.7l2.5-1.4c1 .3 2.1.4 3.3.4 4.8 0 8.5-3.5 8.5-8.2S16.8 3.5 12 3.5Zm.9 11-2.2-2.3-4.2 2.3 4.6-4.9 2.2 2.3 4.2-2.3-4.6 4.9Z"/>',
  telegram: '<path fill="#fff" d="m4 11.4 14.4-5.6c.7-.2 1.3.2 1.1 1.2l-2.5 11.6c-.2.8-.7 1-1.3.6l-3.7-2.7-1.8 1.7c-.2.2-.4.4-.8.4l.3-3.8 6.9-6.2c.3-.3-.1-.4-.5-.2l-8.5 5.4-3.7-1.1c-.8-.3-.8-.8.1-1.3Z"/>',
  tiktok: '<path fill="#fff" d="M15.5 4c.3 2 1.5 3.3 3.5 3.5v2.6c-1.3 0-2.5-.4-3.5-1.1v5.3a5 5 0 1 1-5-5h.5v2.7a2.4 2.4 0 1 0 1.9 2.3V4h2.6Z"/>',
  webchat: '<path fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" d="M5 6h14v9H10l-4 3v-3H5z"/>',
  email: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="#fff" stroke-width="2"/><path d="m4 8 8 5 8-5" fill="none" stroke="#fff" stroke-width="2"/>',
};

@Component({
  selector: 'app-channel-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.title]': 'label()' },
  template: `<span class="ch" [style.width.px]="size()" [style.height.px]="size()" [style.background]="bg()">
    <svg viewBox="0 0 24 24" [attr.width]="size() * 0.78" [attr.height]="size() * 0.78" [innerHTML]="glyph()"></svg></span>`,
  styles: `.ch{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;flex:none}`,
})
export class ChannelIcon {
  private san = inject(DomSanitizer);
  readonly channel = input.required<ChannelType>();
  readonly size = input(18);
  readonly label = computed(() => CHANNEL_LABELS[this.channel()]);
  readonly bg = computed(() =>
    this.channel() === 'instagram' ? 'linear-gradient(45deg,#f9a825,#e1306c 50%,#833ab4)' : CHANNEL_COLORS[this.channel()],
  );
  readonly glyph = computed(() => this.san.bypassSecurityTrustHtml(GLYPHS[this.channel()]));
}
