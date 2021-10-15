
/**
 * Disconnects all clients using
 * the given username from the network.
 * @param {string} username 
 */
function kickUsers(username) {
    fetch('/api/kick', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, })
    })
        .then(res => res.json())
        .then(res => {
            if (!res.success) return window.alert(`Fehler: ${res.error}`);
            window.alert(`Erfolg! ${res.damage} Sitzungen wurden beendet!`);
            // window.location.reload();
        });
}

function deleteUser(username) {
    fetch('/api/delete', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, }),
    })
        .then(res => res.json())
        .then(res => {
            if (!res.success) return window.alert(`Fehler: ${res.error}`);
            window.alert(`Erfolg! Nutzer "${username}" wurde gelöscht!`);
            window.location.reload();
        });
}

/**
 * Gets number of active sessions
 * for username.
 * @param {string} username 
 */
function getSessions(username) {
    return new Promise((resolve, reject) => {
        fetch(`/api/sessions/${username}`)
            .then(res => res.json())
            .then(res => {
                if (!res.success) reject(`Fehler: ${res.error}`);
                resolve(res.sessions);
            });
    });
}

/**
 * Performs pings to all active
 * velops and returns the results.
 */
function doPings() {
    return new Promise((resolve, reject) => {
        fetch(`/api/ping`)
            .then(res => res.json())
            .then(res => {
                if (!res.success) reject(`Fehler: ${res.error}`);
                resolve(res.pings);
            });
    })
}