// Run after npm run build:deploy. Set PLAYWRIGHT_MODULE or CHROMIUM_EXECUTABLE if needed.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

function getChromium() {
  for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    let resolved;
    try { resolved = require.resolve(name); } catch { continue; }
    return require(resolved).chromium;
  }
  throw new Error('Install Playwright or set PLAYWRIGHT_MODULE to the installed package path.');
}

const site = 'https://mango7557-ui.github.io/policy-fund-sea/';
const docs = path.join(__dirname, 'docs');
const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', mp4: 'video/mp4' };

async function verify() {
  const browser = await getChromium().launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce', locale: 'ko-KR', serviceWorkers: 'block' });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Serve the release with its real origin and subpath. No request reaches the live site.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const href = url.origin + url.pathname;
      const file = href.startsWith(site) ? href.slice(site.length) || 'index.html' : null;
      if (!file || !file.split('/').every(part => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..')) {
        errors.push('Unexpected request: ' + href);
        return route.abort();
      }
      try {
        const body = await fs.readFile(path.join(docs, file));
        await route.fulfill({ body, contentType: mime[path.extname(file).slice(1)] || 'application/octet-stream' });
      } catch (error) {
        errors.push(file + ': ' + error.message);
        await route.abort();
      }
    });

    await page.goto(site);
    await page.getByRole('heading', { level: 1, name: /사업에 필요한 자금/ }).waitFor();
    for (const width of [1440, 1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow at ' + width);
      assert(await page.locator('header img').evaluate(img => img.complete && img.naturalWidth > 0), 'Header logo missing');
      const clipped = await page.locator('header button, header a').evaluateAll(nodes => nodes.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      }).map(el => el.getAttribute('aria-label') || el.textContent));
      assert.deepEqual(clipped, [], 'Header controls clipped at ' + width + ': ' + clipped);
    }

    const menu = page.getByRole('button', { name: '메뉴 열기' });
    await menu.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('navigation', { name: '모바일 주 메뉴' }).getByRole('link', { name: '성공 사례' }).click();
    assert.equal(new URL(page.url()).hash, '#success-cases');
    await menu.click();
    await page.keyboard.press('Escape');
    assert(await menu.evaluate(el => document.activeElement === el));
    await page.getByRole('button', { name: '다크 모드로 전환' }).click();
    await page.reload();
    await page.getByRole('button', { name: '화이트 모드로 전환' }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');

    await page.setViewportSize({ width: 1440, height: 960 });
    const nav = page.getByRole('navigation', { name: '주 메뉴', exact: true });
    for (const link of await nav.getByRole('link').all()) {
      const href = await link.getAttribute('href');
      assert.equal(await page.locator(href).count(), 1, 'Missing navigation target ' + href);
      await link.click();
      assert.equal(new URL(page.url()).hash, href);
    }
    await page.getByRole('radio', { name: /운영자금/ }).focus();
    await page.keyboard.press('ArrowRight');
    assert(await page.getByRole('radio', { name: /시설자금/ }).isChecked());
    await page.getByRole('button', { name: '이 주제로 상담 시작' }).click();
    await page.locator('.sea-message.assistant').first().waitFor();
    assert.match(await page.locator('.sea-message.user').first().innerText(), /설비/);
    await page.getByRole('button', { name: '직접 질문하기' }).click();
    const composer = page.getByRole('textbox', { name: '정책이에게 질문하기' });
    await composer.fill('설비 구입 자금은 어떤 서류가 필요한가요?');
    await composer.press('Enter');
    await page.locator('.sea-message.assistant').nth(1).waitFor();

    const reports = page.locator('.sample-library');
    await reports.locator('summary').click();
    const before = await reports.locator('.sample-content').innerText();
    await reports.getByLabel('사례', { exact: true }).selectOption({ index: 1 });
    await reports.getByLabel('리포트 등급').selectOption({ index: 1 });
    const after = await reports.locator('.sample-content').innerText();
    assert(after.trim() && after !== before, 'Sample report did not change');
    await page.getByRole('link', { name: '학습 관리' }).click();
    await page.getByRole('button', { name: /연결·백업/ }).click();
    assert.equal(await page.locator('input[type=password]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Passed: static assets, six viewport widths, navigation, keyboard, theme, consultation, reports and admin.');
  } finally {
    await browser.close();
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
