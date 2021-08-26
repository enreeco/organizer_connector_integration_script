'use strict';

/**
 * Global constants
 */
const LOCAL_FOLDER 		= process.env.localfolder;	//local folder: where to store the export file
const LOGIN_URL 		= process.env.sf_loginurl || 'https://login.salesforce.com'; //login URL to your Salesforce org
const SF_USERNAME 		= process.env.sf_username; //Salesforce username
const SF_PASSWORD 		= process.env.sf_password;	// Salesforce password+token
const SF_BACKUP_ID 		= process.env.backupId;	//Salesforce Backup Id (parent record)
const SF_BACKUP_SECRET 	= process.env.backupSecret; //Salesforce Backup Secret (use the "Send Secret by Email" button on the Backup record to get the key)

//ORGanizer for Salesforce Connector WS endpoints
const CONNECTOR_PATH = '/services/apexrest/orgnz_backupper/api/v1.0/backup-management/backups';
const ECHO_PATH = '/services/apexrest/orgnz_backupper/api/v1.0/backup-management/echo';

if(!LOCAL_FOLDER){console.error('Missing "localfolder"'); 		return 1;}
if(!SF_USERNAME){console.error('Missing "username"'); 			return 1;}
if(!SF_PASSWORD){console.error('Missing "password"'); 			return 1;}
if(!SF_BACKUP_ID){console.error('Missing "backupId"'); 			return 1;}
if(!SF_BACKUP_SECRET){console.error('Missing "backupSecret"'); 	return 1;}

/**
 * Main modules
 */
const request = require('request');
const jsforce = require('jsforce');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Encrypts any plain text using a shared base64 secret (AES-256)
 * @param {String} msg : plain text
 * @param {String} base64Secret  : base64 encoded secret key
 * @returns {String}
 */
const encryptForSalesforce = function(msg, base64Secret){
	var encryptedText = null;
	var KEY = Buffer.from(base64Secret, 'base64');
    var textBuffer = Buffer.from(msg, 'utf-8');
    var iv = crypto.randomBytes(16);
 
    var cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
    var encryptedBuffer = cipher.update(textBuffer);
    encryptedText = Buffer.concat([iv, encryptedBuffer, cipher.final()]).toString('base64');
 
    return encryptedText;   
};

/**
 * Decrypts any encrypted text using a shared base64 secret (AES-256)
 * @param {String} msg : base64 encrypted text
 * @param {String} base64Secret  : base64 encoded secret key
 * @returns {String}
 */
const decryptFromSalesforce = function(encryptedText, base64Secret){
	var clearText = null;
	var KEY = Buffer.from(base64Secret, 'base64');
    var encryptedBlob = Buffer.from(encryptedText, 'base64');
    var iv = encryptedBlob.slice(0, 16);
    var textBuffer = encryptedBlob.toString('base64', 16);
 
    var decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
    clearText = decipher.update(textBuffer,'base64','utf-8');
    clearText += decipher.final('utf-8'); 
     
    return clearText;
};

/**
 * Tests the connection (a simple echo webservice)
 * @param {Object} options - connection options
 * @param {Function} cb - callback
 */
const testConnection = function(options, cb){
	console.log(`${(new Date()).toISOString()} ## Testing connection...`);
	return request({
		method:'GET',
		url: `${options.domain}/${ECHO_PATH}`, 
		headers: {
			'Authorization': `Bearer ${options.sessionId}`
		}
	}, (err, res, body) => {

		if (err) { 
			console.error(err); 
			return 1;
		}
		try{
			body = JSON.parse(body);
		}catch(ex){}

		if(!body.success){
			console.error(new Error(`Invalid response from echo service: ${body.message || JSON.stringify(body)}`));
			return 1;
		}
		console.log(`${(new Date()).toISOString()} ## Connection ok!`);

		return cb && cb();
  });
};

/**
 * Gets all Backup Items of a given Backup by Id, decrypting passwords and token with the shared secret
 * @param {Object} options 
 * @param {Function} cb 
 */
const getBackup = function(options, cb){
	console.log(`${(new Date()).toISOString()} ## Retrieving backup ${SF_BACKUP_ID}...`);

	return request({
		method:'GET',
		url: `${options.domain}/${CONNECTOR_PATH}/${SF_BACKUP_ID}`, 
		headers: {
			'Authorization'				: `Bearer ${options.sessionId}`,
			'organizer-authentication'	: encryptForSalesforce(SF_BACKUP_ID, SF_BACKUP_SECRET),
		}
	}, (err, res, body) => {
		
		if (err) { 
			console.error(err); 
			return 1;
		}

		try{
			body = JSON.parse(body);
		}catch(ex){}

		if(!body.success){
			console.error(new Error(`Invalid response from getBackup service: ${body.message || JSON.stringify(body)}`));
			return 1;
		}


		//decrypts password and token of each item
		for(let i = 0; i < body.result.items.length; i++){
			let item = body.result.items[i];
			if(item.token){
				try{
					item.token = decryptFromSalesforce(item.token, SF_BACKUP_SECRET);
				}catch(ex){
					console.error(new Error(`Cannot decrypt token for item ${i} [${JSON.stringify(item)}]`));
					return 1;
				}
			}
			if(item.password){
				try{
					item.password = decryptFromSalesforce(item.password, SF_BACKUP_SECRET);
				}catch(ex){
					console.error(new Error(`Cannot decrypt password for item ${i} [${JSON.stringify(item)}]`));
					return 1;
				}
			}
		}

		console.log(`${(new Date()).toISOString()} ## Backup details retrieved`);

		return cb && cb(body.result.items);
  });
};

/**
 * Saves the list of credentials from Backup into a local JSON file
 * @param {Object} items - array of items to be saved
 * @param {Function} cb 
 */
const saveFile = function(items, cb){
	console.log(`${(new Date()).toISOString()} ## Saving file...`);
	let path = `${LOCAL_FOLDER}\\backup_${SF_BACKUP_ID}.json`;
	return fs.writeFile(path,JSON.stringify(items,null,2), function(err){
		if(err){
			console.error(err); 
			return 1;
		}
		return cb && cb(path);
	});
};

/**
 * Execution starts here...
 */
console.log(`${(new Date()).toISOString()} ## Logging into Salesfoce with username ${SF_USERNAME}...`)
var csfConnection = new jsforce.Connection({
	loginUrl: LOGIN_URL,
})
csfConnection.login(SF_USERNAME, SF_PASSWORD, (err, userInfo) =>{
  	if (err) { 
		console.error(err); 
		return 1;
	}


	console.log(`${(new Date()).toISOString()} ## Salesforce login success with user ${SF_USERNAME}.`);
	
	return testConnection({
		domain: csfConnection.instanceUrl,
		sessionId: csfConnection.accessToken
	}, function(){
		return getBackup({
			domain: csfConnection.instanceUrl,
			sessionId: csfConnection.accessToken
		}, function(items){
			return saveFile(items, function(path){
				console.log(`${(new Date()).toISOString()} ## Backup file successfully saved in ${path}.`);
				return 0;
			});
		});
	});
  	
});
