import * as dotenv from 'dotenv';
import fs from 'fs';
import cluster from 'cluster';
import fffClient from './functions/axios/fffClient.js';
import * as os from "os";
import cliProgress from 'cli-progress'

dotenv.config();

if (cluster.isMaster) {
    const numCPUs = os.cpus().length;

    fs.readFile(process.env.POSTAL_CODE_DATASET_OUTPUT, 'utf-8', (err, data) => {
        if (err) {
            console.error('Error reading JSON file:', err.message);

            return;
        }

        const b1 = new cliProgress.SingleBar({
            format: 'Searching FFF Clubs... {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
        });

        const rows = JSON.parse(data);

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
        let allClubs = [];

        cluster.on('message', (worker, message) => {
            if (message.type === 'increment') {
                b1.increment();
                return;
            }

            if (message.type === 'result') {
                allClubs.push(...message.data);
            }

            completedWorkers++;

            if (completedWorkers === numWorkers) {
                b1.stop();

                console.log('All workers have completed, write the final output file')

                let uniqueClubs = {};

                for (let i = 0; i < allClubs.length; i++) {
                    uniqueClubs[allClubs[i]?.cl_cod] = allClubs[i];
                }

                fs.writeFile('finalClubs-' + Date.now() + '.json', JSON.stringify(Object.values(uniqueClubs)), 'utf8', (err) => {
                    if (err) {
                        console.error('An error occurred while writing the file:', err);
                    } else {
                        console.log('File has been written successfully');
                    }
                });
            }
        });
    });
} else {
    try {
        const workerRows = JSON.parse(process.env.workerRows);

        parseRows(workerRows).then(response => {
            process.send({type: 'result', data: response})
        });
    } catch (parseError) {
        console.error('Error parsing JSON:', parseError.message);
    }

    async function parseRows(rows) {
        rows.reduce((res, o) => ((res[o.codeInsee] = o), res), {});

        let allClubs = [];

        for (const row of rows) {
            let response = await getData(row);

            if (response) {
                allClubs.push(...response);

                process.send({type: 'increment'});
            }
        }

        return allClubs;
    }

    async function getData(row) {
        let clubs = await fffClient.post(process.env.FFF_FIND_CLUB_PATH, {
            find_club: {
                latitude: row.coordinates[1],
                longitude: row.coordinates[0],
                radius: 10,
            },
        });

        return clubs.data;
    }
}
