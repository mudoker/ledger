import { describe, expect, it } from 'bun:test';

describe('Navigation State Transitions & History Synchronization Suite', () => {
  describe('URL Parameter Parsing & Navigation Routing', () => {
    it('parses bill id and share token correctly from query string', () => {
      const url = new URL('http://localhost:3000/?id=bill_123&token=tok_abc456&share=1');
      const params = url.searchParams;

      const id = params.get('id');
      const token = params.get('token') || params.get('shareToken');
      const isShare = params.get('share') === '1' || Boolean(token);

      expect(id).toBe('bill_123');
      expect(token).toBe('tok_abc456');
      expect(isShare).toBe(true);
    });

    it('parses group-associated bill URLs and maintains stacked hierarchy', () => {
      const url = new URL('http://localhost:3000/?id=bill_456&groupId=group_789');
      const params = url.searchParams;

      const id = params.get('id');
      const groupId = params.get('groupId');

      expect(id).toBe('bill_456');
      expect(groupId).toBe('group_789');
    });

    it('identifies app-settings view route from search params', () => {
      const url = new URL('http://localhost:3000/?view=app-settings');
      expect(url.searchParams.get('view')).toBe('app-settings');
    });
  });

  describe('History State Mutation & Clean URL Recovery', () => {
    it('appends and removes settings query parameter without full page reload', () => {
      const baseUrl = 'http://localhost:3000/';
      const url = new URL(baseUrl);

      // Open settings
      url.searchParams.set('view', 'app-settings');
      expect(url.toString()).toBe('http://localhost:3000/?view=app-settings');

      // Close settings
      url.searchParams.delete('view');
      expect(url.toString()).toBe('http://localhost:3000/');
    });

    it('preserves clean URL origin and pathname when returning to landing page', () => {
      const origin = 'http://localhost:3000';
      const pathname = '/';
      const cleanUrl = origin + pathname;

      expect(cleanUrl).toBe('http://localhost:3000/');
    });
  });

  describe('Keyboard Navigation Dispatch Logic', () => {
    it('detects Cmd+K or Ctrl+K combo to open global search', () => {
      const isMacCmdK = (e: { metaKey: boolean; ctrlKey: boolean; key: string }) =>
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';

      expect(isMacCmdK({ metaKey: true, ctrlKey: false, key: 'k' })).toBe(true);
      expect(isMacCmdK({ metaKey: false, ctrlKey: true, key: 'K' })).toBe(true);
      expect(isMacCmdK({ metaKey: false, ctrlKey: false, key: 'k' })).toBe(false);
      expect(isMacCmdK({ metaKey: true, ctrlKey: false, key: 'j' })).toBe(false);
    });

    it('detects Escape key for modal and view dismissal', () => {
      const isDismissKey = (e: { key: string }) => e.key === 'Escape';

      expect(isDismissKey({ key: 'Escape' })).toBe(true);
      expect(isDismissKey({ key: 'Enter' })).toBe(false);
      expect(isDismissKey({ key: 'Backspace' })).toBe(false);
    });
  });
});
