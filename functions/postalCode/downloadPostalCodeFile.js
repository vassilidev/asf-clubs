import axios from "axios";
import fs from "fs";

async function downloadFile(fileUrl, downloadPath) {
    try {
        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
        });

        const writer = fs.createWriteStream(downloadPath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log('File downloaded successfully.');
    } catch (error) {
        console.error('Error downloading the file:', error);
        throw error;
    }
}

export default downloadFile;