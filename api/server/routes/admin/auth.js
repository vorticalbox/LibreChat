const express = require('express');
const { requireAdmin, createSetBalanceConfig } = require('@librechat/api');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { getAppConfig } = require('~/server/services/Config');
const middleware = require('~/server/middleware');
const { Balance } = require('~/db/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  Balance,
});

const router = express.Router();

router.post(
  '/login/local',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.requireLocalAuth,
  requireAdmin,
  setBalanceConfig,
  loginController,
);

router.get('/verify', middleware.requireJwtAuth, requireAdmin, (req, res) => {
  const { password: _p, totpSecret: _t, __v, ...user } = req.user;
  user.id = user._id.toString();
  res.status(200).json({ user });
});

module.exports = router;
