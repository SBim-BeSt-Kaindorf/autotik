const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const exphbs = require('express-handlebars');
const User = require('./models/User');
const google = require('./google');
const MikroNode = require('mikrotik-node').MikroNode;
const ping = require('ping');
const fs = require('fs/promises');

const config = require(path.resolve(__dirname, 'config.json'));
let velops = config.velops;
const creds = require(path.resolve(__dirname, 'credentials.json'));
const app = express();

const TESTING = false;
let history = [];

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.use(bodyParser.json());

ping.sys.probe(config.mgm.host, (isAlive) => {
  console.log(`[${isAlive ? '+' : '-'}] Mgm @ ${config.mgm.host} is${(!isAlive?' not ':' ')}reachable`);
});

/**
 * Executes the given command on the MikroTik router/firewall
 * and returns the result.
 * @param {string} cmd
 * @param {any} args
 */
function mikroExec(cmd, args) {
  return new Promise(async (resolve, reject) => {
    try {
      let device = new MikroNode(config.mgm.host);
      let [login] = await device.connect();
      let conn = await login(config.mgm.user, config.mgm.pass);
      let chan = conn.openChannel(`run_forest_run_${Math.random().toString(36).substr(2)}`);

      chan.write(cmd, args);
      chan.on('done', result => {
        chan.close();
        conn.close();
        if (result.data) resolve(MikroNode.resultsToObj(result.data));
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Retrieves all user profiles existent on the firewall
 * and returns them via a `Promise`.
 */
function getProfiles() {
  return new Promise((resolve, reject) => {
    mikroExec('/ip/hotspot/user/profile/print').then(resolve).catch(reject);
  });
}

/**
 * Parses the output of `ip hotspot active print` or
 * `ip hotspot cookie print`.
 * @param {string} output 
 * @param {string} username
 */
function parseSessions(output, username) {
  const users = output.split('\n').slice(2);
  const all = [];
  users.forEach(u => {
    const parts = u.trim().split(/\s{2,}/g);
    console.log(parts);
    if (parts.length < 2) return;
    if (parts[1] === username) all.push(+parts[0]);
  });
  return all;
}

/**
 * Gets all active client sessions
 * using the given username. (Returns
 * array of session indices).
 * @param {string} username 
 */
function getActiveSessions(username) {
  return new Promise((resolve, reject) => {
    mikroExec(`/ip/hotspot/active/print${username !== undefined ? '\n?user='+username : ''}`).then(data => resolve(data instanceof Array ? data : [])).catch(reject);
  });
}

/**
 * Gets all cookie client sessions
 * using the given username. (Returns
 * array of session indices).
 * @param {string} username 
 */
function getCookieSessions(username) {
  return new Promise((resolve, reject) => {
    mikroExec(`/ip/hotspot/cookie/print${username !== undefined ? '\n?user='+username : ''}`).then(data => resolve(data instanceof Array ? data : [])).catch(reject);
  });
}

/**
 * Kicks all clients currently using
 * the given username out of the network.
 * @param {string} username 
 */
function kickUsers(username) {
  return new Promise(async (resolve, reject) => {
    const active = await getActiveSessions(username);
    const cookie = await getCookieSessions(username);
    mikroExec('/ip/hotspot/active/remove', { numbers: active.map(u => u['.id']), })
      .then(() => mikroExec('/ip/hotspot/cookie/remove', { numbers: cookie.map(u => u['.id']), }).then(() => resolve(active.length)).catch(reject))
      .catch(reject);
  });
}

/**
 * Deletes a user from the Hotspot
 * user list.
 * @param {string} username
 */
function deleteUser(username) {
  return new Promise(async (resolve, reject) => {
    mikroExec('/ip/hotspot/user/remove', { numbers: username, }).then(resolve).catch(reject);
  });
}

app.post('/api/create', (req, res) => {
  if (!req.body.customer || !req.body.uname || !req.body.pwdlen || !req.body.profile) {
    res.send({ error: 'Es fehlen Felder!', });
    return;
  }

  const pwdlen = +req.body.pwdlen;
  if (isNaN(pwdlen)) {
    res.send({ error: 'Ung??ltige Passwort-L??nge!', });
    return;
  }

  const user = new User(req.body.uname, req.body.profile, pwdlen, req.body.customer, req.body.booth);
  google.authorize(creds, google.addUser, config.sheets.id, config.sheets.table, user);

  mikroExec('/ip/hotspot/user/add', { server: config.mgm.user_server, 
                                      name: req.body.uname, 
                                      password: user.password, 
                                      profile: req.body.profile, })
    .then(data => {
      res.send({ success: true, user: { username: user.username, password: user.password, }, });
    })
    .catch(err => {
      res.send({ error: 'Erstell-Befehl ist fehlgeschlagen!', })
    });
});

app.get('/api/printer', (req, res) => {
  res.send({ success: true, printer: config.printer, wifi: config.wifi, phone: config.phone, booth: config.booth, })
});

app.get('/api/sessions/:username', async (req, res) => {
  if (!TESTING) {
    res.send({ success: true, sessions: (await getActiveSessions(req.params.username)).length, });
  } else {
    res.send({ success: true, sessions: 0, });
  }
});

app.get('/api/user-stats', (req, res) => {
  res.send(history);
});

app.get('/api/ping', async (req, res) => {
  try {
    let data = await fs.readFile(path.resolve(__dirname, 'config.json'));
    velops = JSON.parse(data.toString()).velops;
    let pings = await Promise.all(velops.filter(h => h.active).map(h => ping.promise.probe(h.ip, { timeout: 1, })));
    res.send({ success: true, pings: velops.filter(h => h.active).map((h, i) => ({ ...h, alive: pings[i].alive, })), });
  } catch (e) {
    console.log(e);
    res.send({ success: false, error: 'some error occurred', });
  }
});

app.delete('/api/kick', async (req, res) => {
  if (!req.body.username) {
    res.send({ error: 'Nutzername fehlt!', });
    return;
  }
  
  kickUsers(req.body.username)
    .then(damage => res.send({ success: true, damage, }))
    .catch(() => res.send({ error: 'something went wrong ... '}));
});

app.delete('/api/delete', async (req, res) => {
  if (!req.body.username) {
    res.send({ error: 'Nutzername fehlt!', });
    return;
  }
  kickUsers(req.body.username)
    .then(damage => deleteUser(req.body.username)
                      .then(() => google.authorize(creds, google.deleteUser, config.sheets.id, config.sheets.table, config.sheets.table_gid, req.body.username)
                                    .then(() => res.send({ success: true, damage, }))
                                    .catch(() => res.send({ error: 'google went wrong', })))
                      .catch(() => res.send({ error: 'something else went wrong', })))
    .catch(() => res.send({ error: 'something went wrong ... '}));
});

app.get('/', async (req, res) => {
  if (!TESTING) {
    res.render('index', { profiles: (await getProfiles()).map(p => p.name).sort((a, b) => {
      a = +a.split('-')[1];
      b = +b.split('-')[1];
      if (isNaN(a)) return 1;
      else if (isNaN(b)) return -1;
      else return a>b?1:-1;
    }), });
  } else {
    res.render('index', { profiles: [ 'a', 'b', 'c', ], });
  }
});

app.get('/users', async (req, res) => {
  let users;
  if (!TESTING) {
    users = await google.authorize(creds, google.getUsers, config.sheets.id, config.sheets.table);
    for (let i = 0; i < users.length; i++) {
      users[i].sessions = (await getActiveSessions(users[i].username)).length;
    }
  } else {
    users = [{
      boothId: '-',
      customerName: 'test',
      username: 'test',
      password: 'password1234',
      profile: 'Velop-15',
      sessions: 2,
    },{
      boothId: '-',
      customerName: 'karli',
      username: 'karli',
      password: 'iKarli',
      profile: 'Velop-Unlimited',
      sessions: 1,
    }];
  }
  res.render('users', { users, });
});

// collect data on number of connected users
setInterval(async () => {
  if (!TESTING) {
    history = [...history.slice(-30*2*12), (await getActiveSessions()).length,];
  } else {
    history = [...history.slice(-30*2*12), Math.floor(Math.random()*10),];
  }
  console.log(`[*] Updated history @ ${new Date().toTimeString()}`)
}, 1000*30);

app.use('/', express.static(path.resolve(__dirname, 'public')));
app.listen(config.port, ()=>console.log(`[+] Listening on http://localhost:${config.port} ... `));