const { chromium } = require(require.resolve('playwright', { paths: ['C:/Users/cline/AppData/Local/Temp/gencode'] }));
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(pathToFileURL(path.resolve('preview.html')).href);
    await page.locator('h1').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Horizontal overflow at ${width}px`);
    await page.waitForFunction(() => { const video = document.querySelector('.hero-mascot video'); return video && video.readyState >= 2; });
    if (width === 1440 || width === 390) await page.screenshot({ path: `design-${width}.png`, fullPage: true });
    console.log(`Layout ${width}px: no horizontal overflow; mascot loaded`);
  }
  await page.waitForFunction(() => !document.querySelector('.hero-mascot video').paused);
  if (await page.locator('.mascot-motion button').count()) throw new Error('Unexpected video button');
  if (!(await page.locator('.hero-mascot video').evaluate(v => v.loop && v.muted && !v.controls))) throw new Error('Video autoplay configuration failed');
  console.log('Mascot automatic muted loop without controls: PASS');
  await page.getByRole('button', { name: '사업 확장 자금이 필요해요' }).click();
  await page.locator('.sea-message.assistant').waitFor();
  if (!(await page.locator('.sea-message.assistant').innerText()).includes('시설자금')) throw new Error('Chat response missing');
  await page.getByRole('button', { name: '시설·설비·사업장 확장', exact: true }).click();
  await page.getByRole('button', { name: '개인사업자', exact: true }).click();
  await page.getByRole('button', { name: '정상 영업 중', exact: true }).click();
  await page.getByRole('button', { name: '분납·유예 승인 또는 완납 예정', exact: true }).click();
  if (!(await page.locator('.soft-badge').innerText()).includes('추가 확인')) throw new Error('Exception gate failed');
  if (await page.getByRole('button', { name: '분납·유예 승인 또는 완납 예정', exact: true }).count()) throw new Error('Answered question repeated');
  await page.locator('.document-tools summary').first().click();
  await page.getByPlaceholder('예: 여성기업, 대환, 수출').fill('여성');
  if (!(await page.locator('.question-results').innerText()).includes('여성 대표자')) throw new Error('Question library failed');
  await page.locator('.sample-library summary').click();
  await page.locator('.sample-controls select').first().selectOption('4');
  if (!(await page.locator('.sample-content').innerText()).includes('구조개선')) throw new Error('Sample case failed');
  await page.getByRole('button', { name: '새 대화 시작' }).click();
  await page.getByRole('heading', { name: '무엇을 도와드릴까요?' }).waitFor();
  await page.getByRole('button', { name: '제공 내용 자세히 보기' }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '정부기관에서 운영하는 서비스인가요?' }).click();
  if (!(await page.locator('#faq-3').innerText()).includes('민간')) throw new Error('FAQ failed');
  await page.getByRole('button', { name: '다크 모드로 전환', exact: true }).click();
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') throw new Error('Dark theme not applied');
  await page.reload();
  await page.getByRole('button', { name: '화이트 모드로 전환', exact: true }).waitFor();
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') throw new Error('Theme persistence failed');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Dark overflow: ${width}`);
    if (width !== 320) await page.screenshot({ path: `design-dark-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '화이트 모드로 전환', exact: true }).click();
  if (await page.locator('html').getAttribute('data-theme') !== 'light') throw new Error('White theme not applied');
  console.log('Dark/white toggle, persistence and dark responsive layouts: PASS');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Chat, reset, service dialog, Escape dismissal and FAQ: PASS. Browser errors: 0');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
