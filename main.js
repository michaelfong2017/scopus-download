const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Cluster } = require('puppeteer-cluster');
const { createObjectCsvWriter } = require('csv-writer');
const { login } = require('./login');

const getCurrentGMT8Timestamp = () => {
    return new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString();
}

let loginInProgress = false;
let loginPromise = null;

const ensureLogin = async () => {
    if (!loginInProgress) {
        loginInProgress = true;
        loginPromise = login().then(() => {
            loginInProgress = false;
            loginPromise = null;
        }).catch((err) => {
            loginInProgress = false;
            loginPromise = null;
            throw err;
        });
    }
    return loginPromise;
};

const loadCookie = async (page) => {
    const cookiePath = './cookies.json';
    if (fs.existsSync(cookiePath)) {
        const cookieJson = await fs.readFileSync(cookiePath);
        const cookies = JSON.parse(cookieJson);
        await page.setCookie(...cookies);
    } else {
        console.log('Cookies file not found, logging in to create new cookies.');
        logExecution('Cookies file not found, logging in to create new cookies.');
        await ensureLogin();
        const cookieJson = await fs.readFileSync(cookiePath);
        const cookies = JSON.parse(cookieJson);
        await page.setCookie(...cookies);
    }
}

const logExecution = async (message) => {
    const timestamp = getCurrentGMT8Timestamp();
    await fs.promises.appendFile('execution.log', `${timestamp} - ${message}\n`);
}

const createStatusCsv = async () => {
    const filePath = 'status.csv';
    if (!fs.existsSync(filePath)) {
        const headers = 'Index,EID,Done\n';
        await fs.promises.writeFile(filePath, headers);
    }
}

const loadProcessedEids = async () => {
    const processedEids = new Map();
    if (fs.existsSync('status.csv')) {
        return new Promise((resolve, reject) => {
            fs.createReadStream('status.csv')
                .pipe(csv())
                .on('data', (row) => {
                    processedEids.set(row.EID, { index: row.Index, status: row.Done });
                })
                .on('end', () => {
                    resolve(processedEids);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }
    return processedEids;
}

const run = async () => {
    const startTime = Date.now() + (8 * 60 * 60 * 1000);
    await logExecution(`Script started at ${getCurrentGMT8Timestamp()}`);
    await createStatusCsv();

    const processedEids = await loadProcessedEids();
    const eids = [];
    fs.createReadStream('eid.csv')
        .pipe(csv())
        .on('data', (row) => {
            eids.push(row.EID);
        })
        .on('end', async () => {
            console.log('Number of EIDs:', eids.length);
            await logExecution(`Number of EIDs: ${eids.length}`);
            await download(eids, processedEids);
            await writeStatusCsv(processedEids);
            const endTime = Date.now() + (8 * 60 * 60 * 1000);
            const executionTime = (endTime - startTime) / 1000; // in seconds
            await logExecution(`Script ended at ${new Date(endTime).toISOString()}`);
            await logExecution(`Total execution time: ${executionTime} seconds`);
        });
}

const download = async (eids, processedEids) => {
    const outputFolderName = `downloaded`;
    if (!fs.existsSync(outputFolderName)) {
        fs.mkdirSync(outputFolderName);
        await logExecution(`Created output folder: ${outputFolderName}`);
    }

    const MAX_CONCURRENCY = 18
    console.log('Max concurrency:', MAX_CONCURRENCY);
    await logExecution(`Max concurrency: ${MAX_CONCURRENCY}`);

    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_PAGE,
        maxConcurrency: MAX_CONCURRENCY,
        puppeteerOptions: {
            headless: true,
        },
        timeout: 300000,
    });

    await cluster.task(async ({ page, data: { eid, index } }) => {
        const fileIndex = String(index + 1).padStart(8, '0');

        if (processedEids.has(eid) && processedEids.get(eid).status === 'Done') {
            console.log(`Skipping already processed EID: ${eid}`);
            return;
        }

        const maxRetries = 5;
        let attempt = 0;
        let success = false;

        while (attempt < maxRetries && !success) {
            try {
                attempt++;
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                await loadCookie(page);
                const dataUrl = `https://www-scopus-com.ezproxy.cityu.edu.hk/gateway/doc-details/documents/${eid}`;
                console.log(`Request URL: ${dataUrl} (Attempt ${attempt})`);

                const response = await page.goto(dataUrl, { waitUntil: "domcontentloaded" });

                if (response.status() === 403) {
                    console.log(`403 error received, logging in again (Attempt ${attempt})`);
                    await ensureLogin();
                    await loadCookie(page);
                    continue;
                }

                if (response.status() !== 200) {
                    throw new Error(`Non-200 status code (${response.status()})`);
                }

                const responseBody = await response.text();
                const data = JSON.parse(responseBody);

                if (data.status === 'NOT_FOUND' || data.message === 'Forbidden') {
                    throw new Error(JSON.stringify(data));
                } else {
                    const fileName = path.join(outputFolderName, `${fileIndex}_${eid}_doc-details.json`);
                    await fs.promises.writeFile(fileName, JSON.stringify(data, null, 2));
                    success = true;
                    processedEids.set(eid, { index: fileIndex, status: 'Done' });

                    // Save status.csv every 100 processed EIDs
                    if (index % 100 === 0) {
                        console.log(`Saving status.csv at index ${index}`);
                        await writeStatusCsv(processedEids);
                    }
                }
            } catch (error) {
                const timestamp = getCurrentGMT8Timestamp();
                await fs.promises.appendFile('error.log', `${timestamp} - Error occurred on attempt ${attempt} for EID ${eid}: ${error.message}\n${error.stack}\n\n`);
                console.error(`${timestamp} - An error occurred on attempt ${attempt}, check the error.log file for more details.`);
                if (attempt >= maxRetries) {
                    await fs.promises.appendFile('error.log', `${timestamp} - Max retries reached for EID ${eid}. Skipping...\n\n`);
                    console.error(`${timestamp} - Max retries reached for EID ${eid}. Skipping...`);
                    processedEids.set(eid, { index: fileIndex, status: 'Failed' });

                    // Save status.csv every 100 processed EIDs
                    if (index % 100 === 0) {
                        console.log(`Saving status.csv at index ${index}`);
                        await writeStatusCsv(processedEids);
                    }
                }
            }
        }
    });

    eids.forEach((eid, index) => {
        cluster.queue({ eid, index });
    });

    await cluster.idle();
    await cluster.close();
}

const writeStatusCsv = async (processedEids) => {
    const csvWriter = createObjectCsvWriter({
        path: 'status.csv',
        header: [
            { id: 'Index', title: 'Index' },
            { id: 'EID', title: 'EID' },
            { id: 'Done', title: 'Done' }
        ],
        append: false // Overwrite the file with the updated data
    });
    const records = Array.from(processedEids, ([eid, { index, status }]) => ({ Index: index, EID: eid, Done: status }));

    // Sort records by the index before writing
    records.sort((a, b) => a.Index.localeCompare(b.Index));

    await csvWriter.writeRecords(records);
}

run();
