require('dotenv').config();
const puppeteer = require('puppeteer');

// const browser = await puppeteer.launch();
// const page = await browser.newPage();

let x_xsrf_token = '';

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
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'https://affilisting.com/list', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader("x-xsrf-token", x_xsrf_token);
            xhr.withCredentials = true;

            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error('Request failed with status ' + xhr.status));
                }
            };

            xhr.onerror = function () {
                reject(new Error('Network error'));
            };

            xhr.send();
        });
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

    await page.setRequestInterception(true);

    page.on('request', (request) => {
        if (request.url().startsWith('https://affilisting.com/')) {
            x_xsrf_token = request.headers()['x-xsrf-token'];
        }
        page.setRequestInterception(false);
    })


    await login(page);
    await fetch(page);

    await page.screenshot({ path: 'example.png' });

    // await browser.close();
})();