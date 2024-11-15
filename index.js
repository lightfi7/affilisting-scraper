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
    

    // Navigate to a page that makes API requests
    await page.goto('https://affilisting.com/list');
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

    await page.setRequestInterception(true);

    page.on('response', async (response) => {
        const url = response.url();
        console.log(url);
        // const headers = response.headers();
        // const status = response.status();
        // console.log(url, headers['content-type'], status)
        // if (url.includes('https://affilisting.com/list') && headers['content-type'] === 'application/json' && status === 200) {
        //     const data = await response.json();
        //     console.log(data);
        // }
    });

    await login(page);
    await fetch(page);

    await page.screenshot({ path: 'example.png' });

    // await browser.close();
})();