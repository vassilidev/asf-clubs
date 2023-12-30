# FFF Clubs Scraper

Get all FFF Clubs ez

## Tech Stack

**Node:** 20.10.0

**NPM:** 10.2.5

## Installation

```bash
  git clone git@github.com:vassilidev/fff-clubs.git
  
  cp .env.exemple .env
  
  npm i
  
  node makePostalCodeFile.js
  
  node index.js
```

## How it works ?

1. The script will download the government datasheet in order to obtain all the cities / postal codes in France.
2. makePostalCodeFile.js will send each postal code to the FFF API in order to obtain the available cities and their
   metadata and create a dedicated file
3. With this freshly generated file, the script will send a call per city to the FFF club API in order to obtain the
   clubs by coordinates and create a single file with their metadata.

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file

`POSTAL_CODE_DATASET_URL` (https://www.data.gouv.fr/fr/datasets/r/5ed9b092-a25d-49e7-bdae-0152797c7577)

`POSTAL_CODE_DATASET_FILENAME` (postalCode.csv)

`POSTAL_CODE_DATASET_OUTPUT` (postalCodeFull.json)

`FFF_BASE_URL` (https://www.fff.fr/api/)

`FFF_FIND_CITIES_PATH` (find-cities/)

`FFF_FIND_CLUB_PATH` (find-club)

## Authors

- [@vassilidev](https://www.github.com/vassilidev)

