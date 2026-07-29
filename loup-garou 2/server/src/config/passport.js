import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as AppleStrategy } from 'passport-apple';
import fs from 'fs';

import User from '../models/User.js';

/**
 * Finds or creates a User document for a given OAuth provider profile.
 * Keeps provider-specific field mapping in one place.
 */
async function findOrCreateOAuthUser({ provider, providerId, displayName, email, avatarUrl }) {
  let user = await User.findOne({
    'authProviders.provider': provider,
    'authProviders.providerId': providerId,
  });

  if (user) {
    user.lastSeenAt = new Date();
    if (avatarUrl && !user.avatarUrl) user.avatarUrl = avatarUrl;
    await user.save();
    return user;
  }

  // If the same email already has an account (e.g. Google then Facebook),
  // link the new provider instead of creating a duplicate profile.
  if (email) {
    user = await User.findOne({ email });
    if (user) {
      user.authProviders.push({ provider, providerId });
      user.lastSeenAt = new Date();
      await user.save();
      return user;
    }
  }

  user = await User.create({
    displayName: displayName || `Player${Math.floor(Math.random() * 10000)}`,
    email: email || null,
    avatarUrl: avatarUrl || null,
    isGuest: false,
    authProviders: [{ provider, providerId }],
  });

  return user;
}

export function configurePassport() {
  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await findOrCreateOAuthUser({
              provider: 'google',
              providerId: profile.id,
              displayName: profile.displayName,
              email: profile.emails?.[0]?.value,
              avatarUrl: profile.photos?.[0]?.value,
            });
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );
  }

  if (process.env.FACEBOOK_CLIENT_ID) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_CLIENT_ID,
          clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
          callbackURL: process.env.FACEBOOK_CALLBACK_URL,
          profileFields: ['id', 'displayName', 'emails', 'photos'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await findOrCreateOAuthUser({
              provider: 'facebook',
              providerId: profile.id,
              displayName: profile.displayName,
              email: profile.emails?.[0]?.value,
              avatarUrl: profile.photos?.[0]?.value,
            });
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );
  }

  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_PRIVATE_KEY_PATH) {
    let privateKeyString;
    try {
      privateKeyString = fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, 'utf8');
    } catch {
      privateKeyString = undefined;
    }

    if (privateKeyString) {
      passport.use(
        new AppleStrategy(
          {
            clientID: process.env.APPLE_CLIENT_ID,
            teamID: process.env.APPLE_TEAM_ID,
            keyID: process.env.APPLE_KEY_ID,
            privateKeyString,
            callbackURL: process.env.APPLE_CALLBACK_URL,
            passReqToCallback: false,
          },
          async (_accessToken, _refreshToken, idToken, profile, done) => {
            try {
              // Apple only sends name/email on first authorization; profile
              // may be sparse on subsequent logins.
              const user = await findOrCreateOAuthUser({
                provider: 'apple',
                providerId: profile?.id || idToken?.sub,
                displayName: profile?.name?.firstName
                  ? `${profile.name.firstName} ${profile.name.lastName || ''}`.trim()
                  : undefined,
                email: profile?.email,
              });
              done(null, user);
            } catch (err) {
              done(err);
            }
          }
        )
      );
    }
  }

  return passport;
}

export { findOrCreateOAuthUser };
