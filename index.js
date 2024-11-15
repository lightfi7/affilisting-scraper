require('dotenv').config();
const puppeteer = require('puppeteer');

// const browser = await puppeteer.launch();
// const page = await browser.newPage();


const login = async (page) => {
    await page.goto('https://affilisting.com/login');
    await page.waitForNetworkIdle();
    await page.waitForSelector('#email', { timeout: 10000 });
    await page.type('#email', process.env.EMAIL);
    await page.type('#password', process.env.PASSWORD);
    await page.click("button[type='submit']");
    await page.waitForNetworkIdle();

}

const fetch = async (page) => {
    const data = await page.evaluate(async () => {
        const response = await fetch('https://affilisting.com/list', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response.json();
    });

    console.log(data);
}

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],

    });

    const page = await browser.newPage();

    await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false
    });

    await login(page);
    await fetch(page);

    await page.screenshot({ path: 'example.png' });

    // await browser.close();
})();