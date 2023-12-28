import puppeteer from "puppeteer-extra";
import * as dotenv from 'dotenv'
import UserAgent from 'user-agents';
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as winston from 'winston';

dotenv.config();

puppeteer.use(
    StealthPlugin(),
);

const logConfiguration = {
    'transports': [
        new winston.transports.File({
            filename: 'logs/run-' + new Date().toJSON().replaceAll(':', '-') + '.log',
        }),
    ],
};

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

let logger = winston.createLogger(logConfiguration);

(async () => {
    logger.info('Start browser');

    const browser = await puppeteer.launch({headless: false, ignoreHTTPSErrors: true});
    const page = await browser.newPage();

    await page.setDefaultNavigationTimeout(0);

    logger.info('Set User Agent');

    await page.setUserAgent(new UserAgent().toString());

    logger.info('Go to homepage url');

    await page.goto(process.env.HOME_URL);

    logger.info('Cleanup cookie');

    await page.evaluate(() => {
        document.querySelector('#didomi-notice-agree-button')?.click();
    });
})();