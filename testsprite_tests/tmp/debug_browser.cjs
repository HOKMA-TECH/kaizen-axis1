const { chromium } = require('playwright');

(async () => {
    console.log('Starting headless browser...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`[BROWSER ERROR] ${msg.text()}`);
        } else {
            console.log(`[BROWSER LOG] ${msg.text()}`);
        }
    });

    page.on('pageerror', error => {
        console.log(`[PAGE FATAL ERROR] ${error.message}`);
    });

    console.log('Navigating to localhost:3000...');
    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 10000 });
        console.log('Navigation complete. Waiting 2 seconds for React to mount...');
        await page.waitForTimeout(2000);
    } catch (e) {
        console.log(`[NAVIGATION ERROR] ${e.message}`);
    }

    console.log('Closing browser...');
    await browser.close();
})();
