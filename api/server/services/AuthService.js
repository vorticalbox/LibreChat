const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  logger,
  DEFAULT_SESSION_EXPIRY,
  DEFAULT_REFRESH_TOKEN_EXPIRY,
} = require('@librechat/data-schemas');
const { SystemRoles, errorsToString } = require('librechat-data-provider');
const { math, isEnabled, isEmailDomainAllowed, shouldUseSecureCookie } = require('@librechat/api');
const {
  findUser,
  createUser,
  updateUser,
  countUsers,
  getUserById,
  findSession,
  deleteSession,
  createSession,
  generateToken,
  deleteUserById,
  generateRefreshToken,
} = require('~/models');
const { registerSchema } = require('~/strategies/validators');
const { getAppConfig } = require('~/server/services/Config');
const genericRegistrationMessage = 'Registration request processed.';

/**
 * Logout user
 *
 * @param {ServerRequest} req
 * @param {string} refreshToken
 * @returns
 */
const logoutUser = async (req, refreshToken) => {
  try {
    const userId = req.user._id;
    const session = await findSession({ userId: userId, refreshToken });

    if (session) {
      try {
        await deleteSession({ sessionId: session._id });
      } catch (deleteErr) {
        logger.error('[logoutUser] Failed to delete session.', deleteErr);
        return { status: 500, message: 'Failed to delete session.' };
      }
    }

    try {
      req.session.destroy();
    } catch (destroyErr) {
      logger.debug('[logoutUser] Failed to destroy session.', destroyErr);
    }

    return { status: 200, message: 'Logout successful' };
  } catch (err) {
    return { status: 500, message: err.message };
  }
};

/**
 * Register a new user.
 * @param {IUser} user <email, password, name, username>
 * @param {Partial<IUser>} [additionalData={}]
 * @returns {Promise<{status: number, message: string, user?: IUser}>}
 */
const registerUser = async (user, additionalData = {}) => {
  const { error } = registerSchema.safeParse(user);
  if (error) {
    const errorMessage = errorsToString(error.errors);
    logger.info(
      'Route: register - Validation Error',
      { name: 'Request params:', value: user },
      { name: 'Validation error:', value: errorMessage },
    );

    return { status: 404, message: errorMessage };
  }

  const { email, password, name, username, provider } = user;

  let newUserId;
  try {
    const appConfig = await getAppConfig();
    if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
      const errorMessage =
        'The email address provided cannot be used. Please use a different email address.';
      logger.error(`[registerUser] [Registration not allowed] [Email: ${user.email}]`);
      return { status: 403, message: errorMessage };
    }

    const existingUser = await findUser({ email }, 'email _id');

    if (existingUser) {
      logger.info(
        'Register User - Email in use',
        { name: 'Request params:', value: user },
        { name: 'Existing user:', value: existingUser },
      );

      // Sleep for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { status: 200, message: genericRegistrationMessage };
    }

    //determine if this is the first registered user (not counting anonymous_user)
    const isFirstRegisteredUser = (await countUsers()) === 0;

    const salt = bcrypt.genSaltSync(10);
    const newUserData = {
      provider: provider ?? 'local',
      email,
      username,
      name,
      avatar: null,
      role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER,
      password: bcrypt.hashSync(password, salt),
      ...additionalData,
    };

    const disableTTL = isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN);
    const newUser = await createUser(newUserData, appConfig.balance, disableTTL, true);
    newUserId = newUser._id;
    await updateUser(newUserId, { emailVerified: true });

    return { status: 200, message: genericRegistrationMessage };
  } catch (err) {
    logger.error('[registerUser] Error in registering user:', err);
    if (newUserId) {
      const result = await deleteUserById(newUserId);
      logger.warn(
        `[registerUser] [Email: ${email}] [Temporary User deleted: ${JSON.stringify(result)}]`,
      );
    }
    return { status: 500, message: 'Something went wrong' };
  }
};

/**
 * Set Auth Tokens
 * @param {String | ObjectId} userId
 * @param {ServerResponse} res
 * @param {ISession | null} [session=null]
 * @returns
 */
const setAuthTokens = async (userId, res, _session = null) => {
  try {
    let session = _session;
    let refreshToken;
    let refreshTokenExpires;
    const expiresIn = math(process.env.REFRESH_TOKEN_EXPIRY, DEFAULT_REFRESH_TOKEN_EXPIRY);

    if (session && session._id && session.expiration != null) {
      refreshTokenExpires = session.expiration.getTime();
      refreshToken = await generateRefreshToken(session);
    } else {
      const result = await createSession(userId, { expiresIn });
      session = result.session;
      refreshToken = result.refreshToken;
      refreshTokenExpires = session.expiration.getTime();
    }

    const user = await getUserById(userId);
    const sessionExpiry = math(process.env.SESSION_EXPIRY, DEFAULT_SESSION_EXPIRY);
    const token = await generateToken(user, sessionExpiry);

    res.cookie('refreshToken', refreshToken, {
      expires: new Date(refreshTokenExpires),
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: 'strict',
    });
    res.cookie('token_provider', 'librechat', {
      expires: new Date(refreshTokenExpires),
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: 'strict',
    });
    return token;
  } catch (error) {
    logger.error('[setAuthTokens] Error in setting authentication tokens:', error);
    throw error;
  }
};

/**
 * @function setOpenIDAuthTokens
 * Set OpenID Authentication Tokens
 * Stores tokens server-side in express-session to avoid large cookie sizes
 * that can exceed HTTP/2 header limits (especially for users with many group memberships).
 *
 * @param {import('openid-client').TokenEndpointResponse & import('openid-client').TokenEndpointResponseHelpers} tokenset
 * - The tokenset object containing access and refresh tokens
 * @param {Object} req - request object (for session access)
 * @param {Object} res - response object
 * @param {string} [userId] - Optional MongoDB user ID for image path validation
 * @returns {String} - id_token (preferred) or access_token as the app auth token
 */
const setOpenIDAuthTokens = (tokenset, req, res, userId, existingRefreshToken) => {
  try {
    if (!tokenset) {
      logger.error('[setOpenIDAuthTokens] No tokenset found in request');
      return;
    }
    const expiryInMilliseconds = math(
      process.env.REFRESH_TOKEN_EXPIRY,
      DEFAULT_REFRESH_TOKEN_EXPIRY,
    );
    const expirationDate = new Date(Date.now() + expiryInMilliseconds);
    if (tokenset == null) {
      logger.error('[setOpenIDAuthTokens] No tokenset found in request');
      return;
    }
    if (!tokenset.access_token) {
      logger.error('[setOpenIDAuthTokens] No access token found in tokenset');
      return;
    }

    const refreshToken = tokenset.refresh_token || existingRefreshToken;

    if (!refreshToken) {
      logger.error('[setOpenIDAuthTokens] No refresh token available');
      return;
    }

    /**
     * Use id_token as the app authentication token (Bearer token for JWKS validation).
     * The id_token is always a standard JWT signed by the IdP's JWKS keys with the app's
     * client_id as audience. The access_token may be opaque or intended for a different
     * audience (e.g., Microsoft Graph API), which fails JWKS validation.
     * Falls back to access_token for providers where id_token is not available.
     */
    const appAuthToken = tokenset.id_token || tokenset.access_token;

    /**
     * Always set refresh token cookie so it survives express session expiry.
     * The session cookie maxAge (SESSION_EXPIRY, default 15 min) is typically shorter
     * than the OIDC token lifetime (~1 hour). Without this cookie fallback, the refresh
     * token stored only in the session is lost when the session expires, causing the user
     * to be signed out on the next token refresh attempt.
     * The refresh token is small (opaque string) so it doesn't hit the HTTP/2 header
     * size limits that motivated session storage for the larger access_token/id_token.
     */
    res.cookie('refreshToken', refreshToken, {
      expires: expirationDate,
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: 'strict',
    });

    /** Store tokens server-side in session to avoid large cookies */
    if (req.session) {
      req.session.openidTokens = {
        accessToken: tokenset.access_token,
        idToken: tokenset.id_token,
        refreshToken: refreshToken,
        expiresAt: expirationDate.getTime(),
      };
    } else {
      logger.warn('[setOpenIDAuthTokens] No session available, falling back to cookies');
      res.cookie('openid_access_token', tokenset.access_token, {
        expires: expirationDate,
        httpOnly: true,
        secure: shouldUseSecureCookie(),
        sameSite: 'strict',
      });
      if (tokenset.id_token) {
        res.cookie('openid_id_token', tokenset.id_token, {
          expires: expirationDate,
          httpOnly: true,
          secure: shouldUseSecureCookie(),
          sameSite: 'strict',
        });
      }
    }

    /** Small cookie to indicate token provider (required for auth middleware) */
    res.cookie('token_provider', 'openid', {
      expires: expirationDate,
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: 'strict',
    });
    if (userId && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
      /** JWT-signed user ID cookie for image path validation when OPENID_REUSE_TOKENS is enabled */
      const signedUserId = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: expiryInMilliseconds / 1000,
      });
      res.cookie('openid_user_id', signedUserId, {
        expires: expirationDate,
        httpOnly: true,
        secure: shouldUseSecureCookie(),
        sameSite: 'strict',
      });
    }
    return appAuthToken;
  } catch (error) {
    logger.error('[setOpenIDAuthTokens] Error in setting authentication tokens:', error);
    throw error;
  }
};

module.exports = {
  logoutUser,
  registerUser,
  setAuthTokens,
  setOpenIDAuthTokens,
};
