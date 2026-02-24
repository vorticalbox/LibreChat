const passportLogin = require('./localStrategy');
const jwtLogin = require('./jwtStrategy');

module.exports = {
  passportLogin,
  jwtLogin,
};
