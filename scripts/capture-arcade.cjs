'use strict';
const { chromium } = require('playwright');
const { mkdir, readFile, readdir, writeFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');
(async () => {
  const output = process.env.CAPTURE_OUTPUT || '/tmp/tideborn-captures';
  await mkdir(output, { recursive: true });
  const files = ['index.html', ...(await readdir('capture-site/assets')).map((f) => `assets/${f}`)];
  const inputs = {};
  for (const f of files)
    inputs[f] = createHash('sha256')
      .update(await readFile(path.join('capture-site', f)))
      .digest('hex');
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.LOCAL_CHROME ? { executablePath: process.env.LOCAL_CHROME } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      reducedMotion: 'reduce',
    });
    await page.goto('http://127.0.0.1:4290/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Attack/ }).waitFor({ timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: path.join(output, 'tideborn-01.png'),
      animations: 'disabled',
      timeout: 120000,
    });
    await page.getByRole('button', { name: /^Attack/ }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: path.join(output, 'tideborn-02.png'),
      animations: 'disabled',
      timeout: 120000,
    });
    await writeFile(
      path.join(output, 'capture.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          workflowCommit: process.env.GITHUB_SHA || null,
          sourceCommit: process.env.GAME_SOURCE_COMMIT || null,
          runId: process.env.GITHUB_RUN_ID || null,
          url: 'http://127.0.0.1:4290/',
          inputs,
          browser: browser.version(),
          viewport: { width: 1280, height: 1000 },
          screenshots: ['tideborn-01.png', 'tideborn-02.png'],
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
