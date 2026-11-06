/** Serve dist/embed on :8097 after build:embed. Optional JSON fixture argument. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { JSZip } from '@node-projects/jszip';
import { PDFDocument } from 'pdf-lib';

const fixture = process.argv[2];
assert(fixture, 'Pass a generated document JSON fixture');
const document = JSON.parse(readFileSync(fixture, 'utf8'));
const origin = process.env.FIKA_SCALE_ORIGIN ?? 'http://localhost:8097';
// The published bundle externalizes React for its host. Supply that host here.
execFileSync('bun', ['build', 'dist/embed/fika-embed.js', '--target=browser', '--outfile=dist/embed/scale-proof.js'], { stdio: 'pipe' });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.route(`${origin}/proof`, route => route.fulfill({ contentType: 'text/html', body: '<html><head><link rel="stylesheet" href="/fika-embed.css"></head><body style="margin:0"><div id="editor" style="height:100vh"></div></body></html>' }));
  await page.goto(`${origin}/proof`);
  const roundtrip = await page.evaluate(async ({ document, origin }) => {
    const fika = await import(`${origin}/scale-proof.js`);
    const { controller } = await fika.mountFika(window.document.getElementById('editor')!, { document, locale: 'cs', assetBaseUrl: `${origin}/` });
    (window as any).proof = { fika, controller };
    return controller.getDocument();
  }, { document, origin });
  assert.deepEqual(roundtrip.viewport, document.viewport, 'Mount must preserve both coordinate and physical dimensions');
  await page.screenshot({ path: '/tmp/fika-font-scale-editor.png' });
  const bytes = await page.evaluate(async () => {
    const { fika, controller } = (window as any).proof;
    const doc = controller.getDocument();
    const blob = await fika.exportPresentationPptx(doc);
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const pptx = await JSZip.loadAsync(new Uint8Array(bytes));
  writeFileSync('/tmp/fika-font-scale.pptx', new Uint8Array(bytes));
  const presentation = await pptx.file('ppt/presentation.xml')!.async('string');
  const width = Number(presentation.match(/<p:sldSz[^>]*cx="(\d+)"/)?.[1]);
  assert(Math.abs(width / 914400 - document.viewport.widthInches) < 0.001, 'PPTX physical page must grow with its content');
  const slideXml = await Promise.all(Object.keys(pptx.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map(name => pptx.file(name)!.async('string')));
  const runs = slideXml.flatMap(xml => [...xml.matchAll(/<a:r>.*?<a:rPr[^>]*\bsz="(\d+)"[^>]*>.*?<a:t>([\s\S]*?)<\/a:t>/g)].map(match => ({ size: Number(match[1]) / 100, text: match[2] })));
  console.log('PPTX', { widthInches: width / 914400, runs });
  assert(runs.length > 0);
  assert(runs.every(run => !run.text.trim() || run.size >= 25.99), 'Visible PPTX text must retain at least 26 points');
  const pdfBytes = await page.evaluate(async () => {
    const { fika, controller } = (window as any).proof;
    return Array.from(new Uint8Array(await (await fika.exportPresentationPdf(controller.getDocument())).arrayBuffer()));
  });
  const pdf = await PDFDocument.load(new Uint8Array(pdfBytes));
  assert(Math.abs(pdf.getPage(0).getWidth() / 72 - document.viewport.widthInches) < 0.001, 'PDF page must preserve physical dimensions');
  assert.deepEqual(errors, []);
  console.log('PASS mount, page dimensions, editable PPTX font sizes and PDF');
} finally { await browser.close(); }
