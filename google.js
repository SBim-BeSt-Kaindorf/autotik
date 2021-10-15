const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {google} = require('googleapis');
const User = require('./models/User');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.resolve(__dirname, 'token.json');

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
module.exports.authorize = (credentials, callback, ...args) => {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  return new Promise((resolve, reject) => {
    fs.readFile(TOKEN_PATH, async (err, token) => {
      if (err) return module.exports.getNewToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
      resolve(await callback(oAuth2Client, ...args));
    });
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
module.exports.getNewToken = (oAuth2Client, callback) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error while trying to retrieve access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Add a user entry to the `Users` sheets file specified in `config.json`.
 * @param {google.auth.OAuth2} auth 
 * @param {string} id
 * @param {string} table
 * @param {User} user 
 */
module.exports.addUser = (auth, id, table, user) => {
  const sheets = google.sheets({version: 'v4', auth});
  sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: table,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[ user.boothId, user.customerName, user.username, user.password, user.amountString, false, false, ],], },
  }, (err, result) => {
    if (err) return console.error(err);
  });
};

/**
 * 
 * @param {google.auth.OAuth2} auth 
 * @param {string} id 
 * @param {string} table 
 */
module.exports.getUsers = (auth, id, table) => {
  const sheets = google.sheets({version: 'v4', auth});
  return new Promise((resolve, reject) => {
    sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${table}!A2:E`,
    }, (err, res) => {
      if (err) return reject(err);
      resolve(res.data.values.map(r => new User(r[2], User.profileFromAmount(r[4]), r[3], r[1], r[0])));
    });
  });
};

module.exports.deleteUser = (auth, id, table, table_gid, username) => {
  const sheets = google.sheets({version: 'v4', auth});
  return new Promise((resolve, reject) => {
    module.exports.getUsers(auth, id, table).then(res => {
      res.map((u, i) => {
        if (u.username !== username) return;
        sheets.spreadsheets.batchUpdate({ 
          auth: auth,
          spreadsheetId: id,
          resource: {
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId: table_gid,
                    dimension: 'ROWS',
                    startIndex: i+1,
                    endIndex: i+2,
                  },
                },
              },
            ],
          },
        }, (err, res) => {
          if (err) return reject(err);
          resolve();
        });
      });
      resolve();
    }).catch(reject);
  });
}