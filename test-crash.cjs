const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER EXCEPTION:', msg.text());
        }
    });

    page.on('pageerror', error => {
        console.log('BROWSER PAGE ERROR:', error.message);
        console.log('STACK:', error.stack);
    });

    await page.goto('http://localhost:5173/');
    console.log('Navigated to page');
    
    // wait for network idle to ensure everything is loaded
    await page.waitForTimeout(1000);
    
    console.log('Clicking Graph view...');
    // The button has a span or text "Graph"
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const graphBtn = buttons.find(b => b.textContent && b.textContent.includes('Graph'));
        if (graphBtn) graphBtn.click();
    });

    await page.waitForTimeout(2000);
    console.log('Done waiting for error.');

    await browser.close();
})();
