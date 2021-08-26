# ORGanizer for Salesforce Connector integration guide

This repo holds an example of how to integrate to AppExchange's **ORGanizer for Salesforce Connector** app if you don't own an [ORGanizer for Salesforce](https://organizer.solutions) extension PRO license.

This specific script lets you download all the details of a given Backup record, handling the decryption using the shared secret assigned to the Backup record.

## Installation 
1. Install all required modules from package: `npm install`
3. Rename a `.env-local` file into `.env` and set the correct values
4. Run `heroku local` ( [How to install Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) )

## Configuration
Before running the script configure the following environment variables:
```
localfolder=path\to\local\folder
loginurl=https://login.salesforce.com
sf_username=myusername@example.
sf_password=PASSWORD+TOKEN
backupId=000XXXXXX
backupSecret=backupSecret
```

## Credits
Enrico Murru 2021 - https://organizer.solutions
