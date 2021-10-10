class User {
  /**
   * Creates a new user object.
   * @param {string} username 
   * @param {string} profile 
   * @param {number|string} pass Either a desired password length or a password string.
   * @param {string} customerName
   * @param {string?} boothId
   */
  constructor (username, profile, pass, customerName, boothId) {
    this.username = username;
    this.profile = profile;
    this.password = typeof pass === 'number' ? User.genPass(pass) : pass;
    this.customerName = customerName;
    this.boothId = boothId||'-';
  }

  /**
   * Gets the `#User` string, which will be inserted into the table.
   * The returned amount will either be a string containing an integer,
   * if the Velop Profile has a user limit, or 'inf', if its an UnLimited
   * profile.
   */
  get amountString () {
    // return (+this.profile.split('-')[1]||'inf').toString();
    return this.profile.split('-')[1];
  }
};

/**
 * Generates a password of the given length.
 * @param {number} len 
 */
User.genPass = len => {
  return 'bm'+new Array(len-2).fill(null).map(()=>Math.floor(Math.random()*16).toString(16)).join('').toUpperCase();
};

User.profileFromAmount = amount => {
  return 'Velop-'+amount;
};

module.exports = User;