// Require packages
const puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config(); // Load environment variables from .env file

// Login credentials
const url = 'https://lbapp01.lib.cityu.edu.hk/ezlogin/index.aspx?url=https%3a%2f%2fwww.scopus.com',
    username = process.env.SCOPUS_USERNAME,
    password = process.env.SCOPUS_PASSWORD;

// Create a login function
const login = async () => {
    // Create a new puppeteer browser
    const browser = await puppeteer.launch({
        // Change to `false` if you want to open the window
        headless: false,
    });

    // Create a new browser page
    const page = await browser.newPage();

    // Go to the URL
    await page.goto(url);

    // Input username (selector may need updating)
    await page.type('input[type=text]', username);
    // Input password (selector may need updating)
    await page.type('input[type=password]', password);
    // Click the submit button
    await page.click('input[type=submit]');

    // Wait for a selector to be loaded on the page -
    // this helps make sure the page is fully loaded so you capture all the cookies
    await page.waitForSelector('#basic > span', { timeout: 0 });

    const cookies = JSON.stringify(await page.cookies());
    await fs.writeFileSync('./cookies.json', cookies);

    // Optional - sessions & local storage
    // const sessionStorage = await page.evaluate(() => JSON.stringify(sessionStorage));
    // await fs.writeFileSync('./sessionStorage.json', cookies);

    // const localStorage = await page.evaluate(() => JSON.stringify(localStorage));
    // await fs.writeFileSync('./localStorage.json', cookies);

    // Close the browser once you have finished
    browser.close();
};

// Export the login function
module.exports = { login };

// Fire the function
login();