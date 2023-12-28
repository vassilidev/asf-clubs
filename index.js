import * as dotenv from 'dotenv';
import fs from 'fs';
import cluster from 'cluster';
import fffClient from './fffClient.js';
import * as os from "os";

dotenv.config();

if (cluster.isMaster) {
    const numCPUs = os.cpus().length;

    fs.readFile(process.env.POSTAL_CODE_DATASET_OUTPUT, 'utf-8', (err, data) => {
        if (err) {
            console.error('Error reading JSON file:', err.message);
            return;
        }

        const rows = JSON.parse(data);

        const rowsPerWorker = Math.ceil(rows.length / numCPUs); // Adjust based on your preference

        const numWorkers = Math.min(numCPUs, Math.ceil(rows.length / rowsPerWorker));

        // Split rows into chunks for each worker
        for (let i = 0; i < numWorkers; i++) {
            const start = i * rowsPerWorker;
            const end = (i + 1 === numWorkers) ? rows.length : (i + 1) * rowsPerWorker;
            const workerRows = rows.slice(start, end);
            cluster.fork({ workerRows: JSON.stringify(workerRows) });
        }

        let completedWorkers = 0;
        let allClubs = [];

        // Collect results from workers
        cluster.on('message', (worker, message) => {
            if (message.type === 'result') {
                allClubs.push(...message.data);
            }

            completedWorkers++;

            if (completedWorkers === numWorkers) {
                console.log('All workers have completed, write the final output file')

                fs.writeFile('finalClubs.json', JSON.stringify(allClubs), 'utf8', (err) => {
                    if (err) {
                        console.error('An error occurred while writing the file:', err);
                    } else {
                        console.log('File has been written successfully');
                    }
                    // Ensure master process exits after writing the final output file
                    process.exit(0);
                });
            }
        });

        cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} died`);
        });
    });
} else {
    try {
        const workerRows = JSON.parse(process.env.workerRows);
        parseRows(workerRows);
    } catch (parseError) {
        console.error('Error parsing JSON:', parseError.message);
        process.exit(1);
    }

    async function parseRows(rows) {
        rows.reduce((res, o) => ((res[o.codeInsee] = o), res), {});

        let allClubs = [];

        for (const row of rows) {
            let response = await getData(row);

            if (response) {
                allClubs.push(...response);
            }
        }

        // Send the result back to the master process
        process.send({ type: 'result', data: allClubs });
        process.exit(0); // Exit the worker process after completing the task
    }

    async function getData(row) {
        console.log('search clubs for ' + row.coordinates);

        let clubs = await fffClient.post(process.env.FFF_FIND_CLUB_PATH, {
            find_club: {
                latitude: row.coordinates[1],
                longitude: row.coordinates[0],
            },
        });

        return clubs.data;
    }
}
