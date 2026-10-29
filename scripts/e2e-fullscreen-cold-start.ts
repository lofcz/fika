/** Real browser regression: the lazy slideshow replaces its loading shell. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const source = await Bun.file(new URL('../src/utils/fullscreen.ts', import.meta.url)).text();
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(source)
    .replaceAll('export ', '');
  await page.setContent(`<div class="fika-embed-root"><div class="fika-embed-portal"><div id="shell-root" class="fika-embed-root"><div data-fika-screen data-fika-screen-shell>Loading</div></div></div></div><button id="present">Present</button>`);
  await page.addScriptTag({ content: js + `\nwindow.selectFullscreen = getFullscreenElement; document.querySelector('#present').onclick = enterFullscreen;` });
  await page.click('#present');
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(await page.evaluate(() => document.fullscreenElement?.className), 'fika-embed-portal');
  await page.evaluate(() => {
    document.querySelector('#shell-root')!.remove();
    document.querySelector('.fika-embed-portal')!.innerHTML = '<div id="screen-root" class="fika-embed-root"><div data-fika-screen>Question without answers</div></div>';
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.fullscreenElement?.className), 'fika-embed-portal');
  assert.equal(await page.evaluate(() => (window as any).selectFullscreen().id), 'screen-root');
  await page.evaluate(() => document.exitFullscreen());
  await page.setContent('<button id="present">Present</button>');
  assert.equal(await page.evaluate(() => (window as any).selectFullscreen() === document.documentElement), true);
  console.log('PASS: cold shell replacement keeps fullscreen; warm slideshow and standalone fallbacks work');
} finally { await browser.close(); }
