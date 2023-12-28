import axios from "axios";
import * as dotenv from 'dotenv'

dotenv.config();

let fffClient = axios.create({
    baseURL: process.env.FFF_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default fffClient;