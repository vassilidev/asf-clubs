import * as dotenv from 'dotenv'
import downloadFile from './functions/postalCode/downloadPostalCodeFile.js';
import csvParser from "csv-parser";
import fs from "fs";
import fffClient from './functions/axios/fffClient.js';

dotenv.config();

await downloadFile(process.env.POSTAL_CODE_DATASET_URL, process.env.POSTAL_CODE_DATASET_FILENAME);

const rows = [];

fs.createReadStream(process.env.POSTAL_CODE_DATASET_FILENAME)
    .pipe(csvParser({separator: ';'}))
    .on('data', (data) => rows.push(data))
    .on('end', parseData);

/**
 * Read all the lines and loop though.
 */
async function parseData() {
    let cityInfos = [];

    console.log('found ' + rows.length)

    for (const [index, row] of rows.entries()) {
        console.log('parsing row #' + index);

        let response = await getData(index, row);

        if (response) {
            cityInfos.push(response);
        }
    }

    const jsonContent = JSON.stringify(cityInfos, null, 2);

    fs.writeFile(process.env.POSTAL_CODE_DATASET_OUTPUT, jsonContent, 'utf8', (err) => {
        if (err) {
            console.error('An error occurred while writing the file:', err);

            return;
        }
        console.log('File has been written successfully');
    });
}

async function getData(index, row) {
    let codeInseeCity = row['#Code_commune_INSEE'];
    let postalCode = row['Code_postal'];

    let response = await fffClient.get(process.env.FFF_FIND_CITIES_PATH + postalCode);

    let cityInfo = response.data.find(row => row.code === codeInseeCity);

    if (!cityInfo) {
        return {};
    }

    return {
        cityName: cityInfo?.nom,
        codeInsee: codeInseeCity,
        postalCode,
        coordinates: cityInfo?.centre?.coordinates,
    }
}