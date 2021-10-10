window.onload = () => {
  const form = document.getElementById('inp-form');
  const statusLog = document.getElementById('status-log');
  const customerIn = document.getElementById('customer-in');
  const unameIn = document.getElementById('uname-in');
  const pwdlenIn = document.getElementById('pwdlen-in');
  const profileIn = document.getElementById('profile-in');
  const boothIn = document.getElementById('booth-in');

  const goodBoy = /^[\w ]+$/;

  form.onsubmit = e => {
      e.preventDefault();
      const customer = customerIn.value.trim();
      const uname = unameIn.value.trim();
      const pwdlen = pwdlenIn.value;
      const profile = profileIn.value;
      const booth = boothIn.value;

      if (!customer || !uname || !pwdlen) {
          statusLog.innerHTML = '[!] Bitte alle Felder ausfüllen!';
          return;
      }

      if (!uname.match(goodBoy)) {
        statusLog.innerHTML = '[!] Ungültiger Nutzername! (doesn\'t match /^[\\w ]+$/)';
        return;
      }

      fetch('/api/create', {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer, uname, pwdlen, profile,
          booth: booth||undefined,
        }),
      })
        .then(res => res.json())
        .then(res => {
          if (!res.success) return window.alert(res.error);
          statusLog.innerHTML = '[*] Nutzer wird gedruckt ... ';
          printUser(res.user.username, res.user.password);
        })
        .catch(err => {
          console.log(err);
          statusLog.innerHTML = 'Ein Verbindungsfehler ist aufgetreten! (Create-Request failed)'
        });
  };
};