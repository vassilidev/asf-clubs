import cliProgress from 'cli-progress';
import {cpus} from "os";
import puppeteer from "puppeteer";
import {writeFileSync} from 'fs';
import cluster from "cluster";

(async () => {
    const browser = await puppeteer.launch({headless: true, ignoreHTTPSErrors: true});
    const page = await browser.newPage();

    if (cluster.isMaster) {
        const numCPUs = cpus().length;

        const b1 = new cliProgress.SingleBar({
            format: 'Parsing ASF Clubs {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
        });

        await page.goto('https://org.football.ch/fr/notre-profil/clubs/clubs-asf.aspx');

        await page.waitForNetworkIdle();

        let resultAllClubs = await page.evaluate(() => {
            document
                .querySelector("#qc-cmp2-ui > div.qc-cmp2-footer.qc-cmp2-footer-overlay.qc-cmp2-footer-scrolled > div > button.css-11v0p2c > span")
                .click();

            let liElements = document.querySelectorAll('.panel.panel-primary li');

            let dataList = [];

            liElements.forEach(function (li) {
                var aElement = li.querySelector('a');

                dataList.push({
                    href: aElement.getAttribute('href') ?? '',
                    text: aElement.textContent ?? '',
                });
            });

            return dataList;
        });

        b1.start(resultAllClubs.length, 0, {
            speed: "N/A"
        });

        const rowsPerWorker = Math.ceil(resultAllClubs.length / numCPUs);

        var numWorkers = Math.min(numCPUs, Math.ceil(resultAllClubs.length / rowsPerWorker));

        for (let i = 0; i < numWorkers; i++) {
            const start = i * rowsPerWorker;
            const end = (i + 1 === numWorkers) ? resultAllClubs.length : (i + 1) * rowsPerWorker;
            const workerRows = resultAllClubs.slice(start, end);

            var worker = cluster.fork({workerRows: JSON.stringify(workerRows)});

            worker.on('disconnect', () => {
                console.error(`Worker ${worker.process.pid} disconnected.`);
            });
        }

        var completedWorkers = 0;

        var exportAllClubs = [];

        cluster.on('message', (wkr, msg) => {
            if (msg.type === 'increment') {
                b1.increment();
                return;
            }

            if (msg.type === 'result') {
                exportAllClubs.push(...msg.data);
            }

            completedWorkers++;

            if (completedWorkers === numWorkers) {
                b1.stop();

                console.log('All workers have completed, write the final output file')

                writeFileSync(
                    './clubs.json',
                    JSON.stringify(exportAllClubs, null, 2)
                );

                // Disconnect all workers
                Object.values(cluster.workers).forEach(worker => {
                    worker.disconnect();
                });
            }
        });
    } else {
        try {
            const browser = await puppeteer.launch({headless: true, ignoreHTTPSErrors: true});
            const page = await browser.newPage();

            const workerRows = JSON.parse(process.env.workerRows);

            let output = [];

            for (let i = 0; i < workerRows.length; i++) {
                let clubToExtract = workerRows[i];

                await page.goto(clubToExtract.href);

                let basicInfo = await page.evaluate(function (clubToExtract) {
                    var div = document.querySelector('.list-group-item');
                    var textDivs = div.querySelectorAll('.col-8, .col-6'); // Selecting divs containing text

                    function extractValue(toExtractArray) {
                        for (const txtDiv of textDivs) {
                            const dataDivs = txtDiv.querySelectorAll('div');
                            for (const finalDiv of dataDivs) {
                                const textContent = finalDiv.textContent.trim();
                                for (const toExtract of toExtractArray) {
                                    if (textContent.startsWith(toExtract)) {
                                        const colonIndex = textContent.indexOf(':');
                                        if (colonIndex !== -1) {
                                            return textContent.substring(colonIndex + 1).trim();
                                        }
                                        return textContent;
                                    }
                                }
                            }
                        }
                        return null;
                    }


                    let addr = textDivs[0].querySelectorAll('div');

                    return {
                        nom_du_club: document.getElementsByClassName('navbar-brand')[0].text,
                        url_site: extractValue('www.'),
                        numero_club: extractValue(['N° du club:', 'Vereinsnr.:', 'No società:']), // N° du club: 6137
                        adresse: addr[0].innerText + ', ' + addr[1].innerText,
                        nombre_d_equipe: extractValue(['Equipes:', 'Teams:', 'Squadre:']),
                        couleur_maillot: extractValue(['Couleurs:', 'Farben:']),
                        region: extractValue(['Région:', 'Regione:', 'Region:']),
                        appartenance: extractValue(['Appartenance:', 'Appart.:', 'Zugehörigkeit']),
                        logo: document.getElementsByClassName('vereinLogo')[0].src,
                    };
                }, clubToExtract);

                await page.goto(clubToExtract.href + 'a=fu');

                let contacts = await page.evaluate(function () {
                    const headings = document.querySelectorAll('.row.heading');
                    const contacts = [];

                    headings.forEach(heading => {
                        const headingText = heading.querySelector('h5 > div').textContent.trim();

                        const ftNameElement = heading.nextElementSibling.querySelector('.ftName');
                        const ftName = ftNameElement ? ftNameElement.textContent.trim() : null;

                        const phoneElements = heading.nextElementSibling.querySelectorAll('a[href^="tel:"]');
                        const emailElements = heading.nextElementSibling.querySelectorAll('a[href^="javascript:openMess"]');

                        const phoneNumbers = Array.from(phoneElements).map(phoneElement => phoneElement.textContent.trim()).join(', ');
                        const emails = Array.from(emailElements).map(function (email) {
                            let str = email.href;
                            let match = str.match(/openMess\('([^']+)','([^']+)'\)/);
                            if (match && match.length === 3) {
                                return match[2] + "@" + match[1];
                            } else {
                                return null;
                            }
                        }).join(', ');

                        if (headingText && ftName && phoneNumbers.length > 0) {
                            contacts.push({titre: headingText, nom: ftName, emails, telephones: phoneNumbers});
                        }
                    });

                    return contacts;
                });

                for (const contact in contacts) {
                    let newClub = {
                        ...basicInfo,
                        ...contacts[i],
                    };

                    output.push(newClub);
                }

                process.send({type: 'increment'});
            }

            process.send({type: 'result', data: output});
        } catch (parseError) {
            console.log('Error parsing rows:', parseError.message)
        }
    }
})();