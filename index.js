import * as dotenv from 'dotenv'
import fs from 'fs'
import fffClient from "./fffClient.js";

dotenv.config();

fs.readFile(process.env.POSTAL_CODE_DATASET_OUTPUT, 'utf-8', (err, data) => {
    if (err) {
        console.error('Error reading JSON file:', err.message);
        return;
    }

    try {
        parseRows(JSON.parse(data));
    } catch (parseError) {
        console.error('Error parsing JSON:', parseError.message);
    }
});

async function parseRows(rows) {
    rows.reduce((res, o) => (res[o.codeInsee] = o, res), {});

    let allClubs = [];

    for (const row of rows) {
        let response = await getData(row);

        if (response) {
            allClubs.push(...response);
        }
    }

    fs.writeFile('finalClubs.json', JSON.stringify(allClubs), 'utf8', (err) => {
        if (err) {
            console.error('An error occurred while writing the file:', err);

            return;
        }

        console.log('File has been written successfully');
    });
}

async function getData(row) {
    console.log('search clubs for ' + row.coordinates)

    let clubs = await fffClient.post(process.env.FFF_FIND_CLUB_PATH, {
        find_club: {
            latitude: row.coordinates[1],
            longitude: row.coordinates[0]
        }
    });

    return clubs.data;
}