import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import React from 'react';
import { create } from 'zustand';
import { QueryClient } from '@tanstack/react-query';
import { existsSync } from 'node:fs';

if (typeof createServer !== 'function' || typeof create !== 'function') throw new Error('Frontend imports failed');
new QueryClient();
const browserChannel = existsSync(chromium.executablePath()) ? undefined : 'msedge';
const browser = await chromium.launch({ headless: true, channel: browserChannel });
try {
  const page = await browser.newPage();
  await page.setContent('<title>environment-ok</title><h1>Job Agent</h1>');
  if (await page.title() !== 'environment-ok') throw new Error('Browser check failed');
  console.log(`PASS: Playwright (${browserChannel ?? 'chromium'}) ${browser.version()}, React ${React.version}, Vite, Zustand, TanStack Query`);
} finally {
  await browser.close();
}
