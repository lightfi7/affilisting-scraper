require('dotenv').config();
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const mongoose = require('mongoose');
const Program = require('./models/program');
const cheerio = require('cheerio');
const axios = require('axios');
const https = require("https");

let currentPage = 1;
let xsrfToken = '', cookies, cookieString;
axios.maxRedirects = 0;
const agent = new https.Agent({
    rejectUnauthorized: false,
});



mongoose.connect(process.env.MONGODB_URI, {
    authSource: "admin",
    user: "devman",
    pass: "mari2Ana23sem",
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(error => console.error('Failed to connect to MongoDB:', error));

async function makeRequest(url) {
    return await axios.get(url, {
        headers: {
            Cookie: cookieString,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        httpsAgent: agent,
    });
}

function handleAxiosError(error) {
    let errorMsg;
    console.log("Error Code:", error.code);

    if (["ERR_BAD_RESPONSE", "ERR_BAD_REQUEST"].includes(error.code)) {
        errorMsg = error.request.res.responseUrl;
    } else if (["ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "ERR_FR_TOO_MANY_REDIRECTS", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(error.code)) {
        errorMsg = error.request._options.href;
    } else {
        console.log(error);
        errorMsg = "";
    }

    return errorMsg;
}

const loginToWebsite = async (page) => {
    try {
        await page.goto('https://affilisting.com/login', { waitUntil: 'networkidle2', timeout: 300000 });
        await page.waitForSelector('#email', { timeout: 300000 });
        await page.type('#email', process.env.EMAIL);
        await page.type('#password', process.env.PASSWORD);
        await page.click("button[type='submit']");
        await page.waitForNetworkIdle();

        cookies = await page.cookies();
        cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
    } catch (error) {
        console.error('Login failed:', error);
    }
};

const retrieveReferences = async (page, uuid) => {
    try {
        let response = await makeRequest(`https://affilisting.com/redirect/${uuid}/apply`, cookieString);

        const redirectedUrl = response.request.res.responseUrl;
        console.log('Redirected to:', redirectedUrl);

        const urlObject = new URL(redirectedUrl);
        const parsedRedirectedUrl = 'https://' + urlObject.hostname;
        await page.goto(parsedRedirectedUrl, { waitUntil: 'networkidle2', timeout: 300000 });
        const htmlContent = await page.content();

        const $ = cheerio.load(htmlContent);

        const socialMediaLinks = extractSocialLinks(htmlContent);
        console.log(socialMediaLinks)
        const metaDescription = $('meta[name="description"]').attr('content');
        const metaImage = $('meta[property="og:image"]').attr('content');

        return { link: redirectedUrl, description: metaDescription, image: metaImage, socials: socialMediaLinks };
    } catch (error) {
        console.error('Failed to fetch redirected link:', error);
        return { link: null, description: null, image: null, socials: [] };
    }
};

const extractSocialLinks = (htmlContent) => {
    try {
        const $ = cheerio.load(htmlContent, { decodeEntities: false });
        const socialMediaPattern = /(?:https?:\/\/)?(?:www\.)?(?:facebook|fb|twitter|linkedin|instagram|youtube)\.com\/(?:[\w\-\.]+\/?)+/g;

        const linksSet = new Set();

        $("a").each((_, anchor) => {
            const hrefValue = $(anchor).attr("href");
            if (hrefValue && socialMediaPattern.test(hrefValue)) {
                linksSet.add(hrefValue);
            }
        });

        return [...linksSet];
    } catch (error) {
        console.error("Error extracting data from HTML:", error);
        return [];
    }
};

const fetchProgramsData = async (page) => {
    try {
        const jsonResponseString = await page.evaluate(({ xsrfToken, currentPage }) => {
            return new Promise((resolve, reject) => {
                const xhrRequest = new XMLHttpRequest();
                xhrRequest.open('GET', `https://affilisting.com/list?page=${currentPage}`, true);
                xhrRequest.setRequestHeader('Content-Type', 'application/json');
                xhrRequest.setRequestHeader("x-inertia", true);
                xhrRequest.setRequestHeader("x-inertia-version", 'fc9556c08ecbf859722f010bee10ca59');
                xhrRequest.setRequestHeader("x-requested-with", 'XMLHttpRequest');
                xhrRequest.setRequestHeader("x-xsrf-token", xsrfToken);
                xhrRequest.withCredentials = true;

                xhrRequest.onload = function () {
                    if (xhrRequest.status >= 200 && xhrRequest.status < 300) {
                        resolve(xhrRequest.responseText);
                    } else {
                        reject(new Error('Request failed with status ' + xhrRequest.status));
                    }
                };

                xhrRequest.onerror = function () { reject(new Error('Network error')); };
                xhrRequest.send();
            });
        }, { xsrfToken, currentPage });

        const jsonDataParsed = JSON.parse(jsonResponseString);

        let { data: affiliatesData = [], next_page_url } = jsonDataParsed.props.affiliates;

        if (next_page_url) {
            currentPage++;
        } else {
            currentPage = 1;
        }

        for (let i = 0; i < affiliatesData.length; i++) {
            let item = affiliatesData[i];
            const tagsArray = item.tags.map(tag => tag.id);
            const commissionTypeValue = item.type?.machine_name;
            const languagesArray = item.langs.map(langItem => langItem.id);
            const platformValue = item.platform?.id;
            Object.assign(item, { tags: tagsArray, langs: languagesArray, platform: platformValue, commission_type: commissionTypeValue });
            const { link, description, image, socials = [] } = await retrieveReferences(page, item.uuid);
            item.link = link;
            item.description = description;
            item.image = image;
            item.socials = socials;
            await new Promise((resolve, reject) => setTimeout(resolve, 3000));
        }

        Program.insertMany(affiliatesData).catch(err => console.error('Database insertion failed:', err));

    } catch (error) {
        console.error('Data fetch failed:', error);
    }
};

(async () => {
    console.log(`Scraping page ${currentPage}`);

    try {
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            // env: { DISPLAY: ":10.0" } 
        });

        const page = await browser.newPage();

        await page.setViewport({ width: 1280, height: 768, deviceScaleFactor: 1, isMobile: false });

        await page.setRequestInterception(true);

        page.on('request', (request) => {
            if (request.url().startsWith('https://affilisting.com/')) {
                xsrfToken = request.headers()['x-xsrf-token'];
            }
            request.continue();
        });

        if (!process.env.EMAIL || !process.env.PASSWORD) {
            throw new Error('EMAIL and PASSWORD must be set in environment variables.');
        }

        await loginToWebsite(page);
        await fetchProgramsData(page);

        await page.screenshot({ path: 'example.png' });
        await browser.close();
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();

cron.schedule('*/60 * * * *', async () => {
    console.log(`Scraping page ${currentPage}`);

    try {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'], env: { DISPLAY: ":10.0" } });

        const page = await browser.newPage();

        await page.setViewport({ width: 1280, height: 768, deviceScaleFactor: 1, isMobile: false });

        await page.setRequestInterception(true);

        page.on('request', (request) => {
            if (request.url().startsWith('https://affilisting.com/')) {
                xsrfToken = request.headers()['x-xsrf-token'];
            }
            request.continue();
        });

        if (!process.env.EMAIL || !process.env.PASSWORD) {
            throw new Error('EMAIL and PASSWORD must be set in environment variables.');
        }

        await loginToWebsite(page);
        await fetchProgramsData(page);

        await page.screenshot({ path: 'example.png' });
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {

    }
});