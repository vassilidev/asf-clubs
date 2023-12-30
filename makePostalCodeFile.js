import * as dotenv from 'dotenv'
import downloadFile from './functions/postalCode/downloadPostalCodeFile.js';
import csvParser from "csv-parser";
import fs from "fs";
import fffClient from './functions/axios/fffClient.js';
import cluster from "cluster";
import os from "os";
import cliProgress from "cli-progress";

dotenv.config();

if (!fs.existsSync(process.env.POSTAL_CODE_DATASET_FILENAME)) {
    await downloadFile(process.env.POSTAL_CODE_DATASET_URL, process.env.POSTAL_CODE_DATASET_FILENAME);
}

const rows = [];

fs.createReadStream(process.env.POSTAL_CODE_DATASET_FILENAME)
    .pipe(csvParser({separator: ';'}))
    .on('data', (data) => rows.push(data))
    .on('end', parseRow);


function parseRow() {
    if (cluster.isMaster) {
        const numCPUs = os.cpus().length;

        const b1 = new cliProgress.SingleBar({
            format: 'Parsing Postal codes... {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
        });

        b1.start(rows.length, 0, {
            speed: "N/A"
        });

        const rowsPerWorker = Math.ceil(rows.length / numCPUs);

        const numWorkers = Math.min(numCPUs, Math.ceil(rows.length / rowsPerWorker));

        // Split rows into chunks for each worker
        for (let i = 0; i < numWorkers; i++) {
            const start = i * rowsPerWorker;
            const end = (i + 1 === numWorkers) ? rows.length : (i + 1) * rowsPerWorker;
            const workerRows = rows.slice(start, end);

            cluster.fork({workerRows: JSON.stringify(workerRows)});
        }

        let completedWorkers = 0;
        let allCitiesInfos = [];

        cluster.on('message', (worker, message) => {
            if (message.type === 'increment') {
                b1.increment();
                return;
            }

            if (message.type === 'result') {
                allCitiesInfos.push(...message.data);
            }

            completedWorkers++;

            if (completedWorkers === numWorkers) {
                b1.stop();

                allCitiesInfos.reduce((res, o) => ((res[o.codeInsee] = o), res), {});

                console.log('All workers have completed, write the final output file');

                fs.writeFile(process.env.POSTAL_CODE_DATASET_OUTPUT, JSON.stringify(allCitiesInfos, null, 2), 'utf8', (err) => {
                    if (err) {
                        console.error('An error occurred while writing the file:', err);

                        return;
                    }
                    console.log('File has been written successfully');
                });
            }
        });
    } else {
        try {
            const workerRows = JSON.parse(process.env.workerRows);

            parseData(workerRows).then(response => {
                process.send({type: 'result', data: response})
            });
        } catch (parseError) {
            console.error('Error parsing JSON:', parseError.message);
        }
    }
}

/**
 * Read all the lines and loop though.
 */
async function parseData(rows) {
    let cityInfos = [];

    for (const row of rows) {
        let response = await getData(row);

        if (response) {
            cityInfos.push(response);
        }

        process.send({type: 'increment'});
    }

    return cityInfos;
}

async function getData(row) {
    let codeInseeCity = row['#Code_commune_INSEE'];
    let postalCode = row['Code_postal'];

    let response = await fffClient.get(process.env.FFF_FIND_CITIES_PATH + postalCode);

    let cityInfo = response.data.find(row => row.code === codeInseeCity);

    if (!cityInfo) {
        return false;
    }

    return {
        cityName: cityInfo?.nom,
        codeInsee: codeInseeCity,
        postalCode,
        coordinates: cityInfo?.centre?.coordinates,
    }
}