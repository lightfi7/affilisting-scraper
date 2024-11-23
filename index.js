require('dotenv').config();
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const mongoose = require('mongoose');
const Program = require('./models/program');
const cheerio = require('cheerio');
const axios = require('axios');


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

const getRefs = async (page, uuid) => {
    try {
        const response = await page.goto(`https://affilisting.com/redirect/${uuid}/apply`, {
            waitUntil: 'networkidle2'
        });
        const link = response.url();
        const html = await page.content();
        const $ = cheerio.load(html);
        const socials = getSocials(html);
        const description = $('meta[name="description"]').attr('content');
        const image = $('meta[name="og:image"]').attr('content');
        return {
            link,
            description,
            image,
            socials,
        };
    } catch (error) {
        console.error('Failed to fetch redirected link:', error);
        return {
            link: null,
            description: null,
            image: null,
            socials: [],
        };
    }
};


const getSocials = (html) => {
    try {
        const $ = cheerio.load(html, { decodeEntities: false });
        const pattern =
            /(?:https?:\/\/)?(?:www\.)?(?:facebook|fb|twitter|linkedin|instagram|youtube)\.com\/(?:[\w\-\.]+\/?)+/g;
        const links = new Set();
        $("a").each((_, anchor) => {
            const href = $(anchor).attr("href");
            if (href && pattern.test(href)) {
                links.add(href);
            }
        });
        return [...links];
    } catch (error) {
        console.error("Error extracting data from HTML:", error);
        return [];
    }
};


const getPrograms = async (page) => {
    try {
        const json_string = await page.evaluate(({ x_xsrf_token, page }) => {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', `https://affilisting.com/list?page=${page}`, true);
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
        }, { x_xsrf_token, page: n });

        const json_data = JSON.parse(json_string);
        let { data = [], next_page_url = undefined } = json_data.props.affiliates;
        console.log(data)
        if (next_page_url) {
            n = n + 1;
        } else
            n = 1;

        data = data.map(async item => {
            const tags = item.tags.map(tag => tag.id);
            const commission_type = item.type?.machine_name;
            const langs = item.langs.map(item => item.id)
            const platform = item.platform?.id;

            return { ...item, tags, langs, platform, commission_type };
        })

        // for (let i = 0; i < data.length; i++) {
        //     const {
        //         link,
        //         description,
        //         image,
        //         socials
        //     } = await getRefs(page, data[i].uuid);

        //     console.log(link);
        //     console.log(description);
        //     console.log(image);
        //     console.log(socials);

        //     data[i].link = link;
        //     data[i].description = description;
        //     data[i].image = image;
        //     data[i].socials = socials;
        //     await new Promise((resolve, reject) => setTimeout(resolve, 3000));
        // }

        await Program.insertMany(data);

    } catch (error) {
        console.error('Data fetch failed:', error);
    }
};


cron.schedule('* * */1 * *', async () => {
    console.log(`Scraping page ${n}`);
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            env: {
                DISPLAY: ":10.0"
            }
        });

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
})