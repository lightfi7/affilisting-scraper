require('dotenv').config();
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const mongoose = require('mongoose');
const Program = require('./models/program');


mongoose.connect(process.env.MONGODB_URI, {})
    .then(() => console.log('Connected to MongoDB'))
    .catch(error => console.error('Failed to connect to MongoDB:', error));

let n = 1;
let x_xsrf_token = '';

const doLogin = async (page) => {
    try {
        await page.goto('https://affilisting.com/login', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#email', { timeout: 10000 });
        await page.type('#email', process.env.EMAIL);
        await page.type('#password', process.env.PASSWORD);
        await page.click("button[type='submit']");
        await page.waitForNetworkIdle();


    } catch (error) {
        console.error('Login failed:', error);
    }
};

const getPrograms = async (page) => {
    try {
        const json_string = await page.evaluate((x_xsrf_token) => {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', 'https://affilisting.com/list', true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader("x-inertia", true);
                xhr.setRequestHeader("x-inertia-version", 'fc9556c08ecbf859722f010bee10ca59');
                xhr.setRequestHeader("x-requested-with", 'XMLHttpRequest');
                xhr.setRequestHeader("x-xsrf-token", x_xsrf_token);
                xhr.withCredentials = true;
                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(xhr.responseText);
                    } else {
                        reject(new Error('Request failed with status ' + xhr.status));
                    }
                };
                xhr.onerror = function () {
                    reject(new Error('Network error'));
                };
                xhr.send();
            });
        }, x_xsrf_token);

        const json_data = JSON.parse(json_string);
        let { data = [], next_page_url = undefined } = json_data.props.affiliates;
        console.log(data)
        if (next_page_url) {
            n = n + 1;
        } else
            n = 1;

        data = data.map(item => {
            const tags = item.tags.map(tag => tag.id);
            const commission_type = item.type?.machine_name;
            const langs = item.langs.map(item => item.id)
            const platform = item.platform?.id;
            return { ...item, tags, langs, platform, commission_type };
        })

        Program.insertMany(data);

    } catch (error) {
        console.error('Data fetch failed:', error);
    }
};

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({
            width: 1280,
            height: 768,
            deviceScaleFactor: 1,
            isMobile: false
        });

        // Set request interception to capture the XSRF token
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.url().startsWith('https://affilisting.com/')) {
                x_xsrf_token = request.headers()['x-xsrf-token'];
            }
            request.continue();
        });

        // Validate environment variables
        if (!process.env.EMAIL || !process.env.PASSWORD) {
            throw new Error('EMAIL and PASSWORD must be set in environment variables.');
        }

        await doLogin(page);
        await getPrograms(page);

        await page.screenshot({ path: 'example.png' });
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await browser.close(); // Ensure the browser closes regardless of errors
    }
})();