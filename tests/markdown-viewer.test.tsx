import { describe, it, expect } from 'bun:test';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { MarkdownViewer, parseMarkdownBlocks } from '@/components/ui/markdown-viewer';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, PRIVACY_CONSENT_DISCLOSURE } from '@/constants/app-info';

describe('MarkdownViewer Component', () => {
  it('exports MarkdownViewer and parseMarkdownBlocks', () => {
    expect(typeof MarkdownViewer).toBe('function');
    expect(typeof parseMarkdownBlocks).toBe('function');
  });

  it('correctly parses PRIVACY_POLICY blocks into structured tokens', () => {
    const blocks = parseMarkdownBlocks(PRIVACY_POLICY, true);
    expect(blocks.length).toBeGreaterThan(10);

    // First block should be the date badge because hideFirstH1 was true
    const dateBadge = blocks.find(b => b.type === 'dateBadge');
    expect(dateBadge).toBeDefined();
    expect(dateBadge?.text).toContain('Last updated');

    // Should contain section headings
    const sectionH3 = blocks.filter(b => b.type === 'h3');
    expect(sectionH3.length).toBeGreaterThan(5);

    // Should contain unordered lists
    const uls = blocks.filter(b => b.type === 'ul');
    expect(uls.length).toBeGreaterThan(3);

    // Should contain dividers
    const hrs = blocks.filter(b => b.type === 'hr');
    expect(hrs.length).toBeGreaterThan(3);
  });

  it('correctly parses TERMS_OF_SERVICE and PRIVACY_CONSENT_DISCLOSURE', () => {
    const termsBlocks = parseMarkdownBlocks(TERMS_OF_SERVICE, true);
    expect(termsBlocks.length).toBeGreaterThan(5);

    const consentBlocks = parseMarkdownBlocks(PRIVACY_CONSENT_DISCLOSURE);
    expect(consentBlocks.length).toBeGreaterThan(2);

    // Consent disclosure has ordered list
    const ol = consentBlocks.find(b => b.type === 'ol');
    expect(ol).toBeDefined();
    if (ol && ol.type === 'ol') {
      expect(ol.items.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('renders without crashing to HTML using renderToString', () => {
    const privacyHtml = renderToString(React.createElement(MarkdownViewer, { content: PRIVACY_POLICY, hideFirstH1: true }));
    expect(privacyHtml).toContain('Last updated:');
    expect(privacyHtml).toContain('Fundamental Principle: Local-First by Default');

    const termsHtml = renderToString(React.createElement(MarkdownViewer, { content: TERMS_OF_SERVICE, hideFirstH1: true }));
    expect(termsHtml).toContain('Terms of Service');

    const consentHtml = renderToString(React.createElement(MarkdownViewer, { content: PRIVACY_CONSENT_DISCLOSURE }));
    expect(consentHtml).toContain('Privacy &amp; Consent Summary');
  });
});
