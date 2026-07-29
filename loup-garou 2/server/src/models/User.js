import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

const { Schema, model } = mongoose;

/**
 * Rank ladder derived from XP. Kept here as a single source of truth so
 * both the schema virtual and any client-facing API can reuse it.
 */
export const RANKS = [
  { key: 'bronze', label: 'Bronze', minXp: 0 },
  { key: 'silver', label: 'Silver', minXp: 500 },
  { key: 'gold', label: 'Gold', minXp: 1500 },
  { key: 'platinum', label: 'Platinum', minXp: 3500 },
  { key: 'diamond', label: 'Diamond', minXp: 7000 },
  { key: 'master', label: 'Master', minXp: 12000 },
];

export function rankForXp(xp) {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXp) current = rank;
  }
  return current;
}

/** Level curve: simple sqrt-based progression, tunable later. */
export function levelForXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(xp / 25)) + 1);
}

const AuthProviderSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ['google', 'facebook', 'apple', 'guest'],
      required: true,
    },
    providerId: { type: String, required: true },
  },
  { _id: false }
);

const StatsSchema = new Schema(
  {
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    winsAsVillager: { type: Number, default: 0 },
    winsAsWolf: { type: Number, default: 0 },
    timesVoyante: { type: Number, default: 0 },
    timesSorciere: { type: Number, default: 0 },
    timesChasseur: { type: Number, default: 0 },
    timesLoupNoir: { type: Number, default: 0 },
    successfulInfections: { type: Number, default: 0 },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    // Public-facing unique identifier (safe to expose in socket payloads,
    // separate from the Mongo _id so we never leak internal ids to clients).
    userId: {
      type: String,
      unique: true,
      default: () => `LG-${nanoid(8).toUpperCase()}`,
      index: true,
    },

    displayName: { type: String, required: true, trim: true, maxlength: 24 },
    avatarUrl: { type: String, default: null },

    isGuest: { type: Boolean, default: false },
    authProviders: { type: [AuthProviderSchema], default: [] },
    email: { type: String, default: null, lowercase: true, trim: true },

    xp: { type: Number, default: 0, min: 0 },
    stats: { type: StatsSchema, default: () => ({}) },

    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    preferredLanguage: { type: String, enum: ['en', 'ar'], default: 'en' },

    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserSchema.index({ 'authProviders.provider': 1, 'authProviders.providerId': 1 });

UserSchema.virtual('level').get(function () {
  return levelForXp(this.xp);
});

UserSchema.virtual('rank').get(function () {
  return rankForXp(this.xp).label;
});

UserSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    // Never expose internal Mongo _id or auth provider ids to the client.
    delete ret._id;
    delete ret.__v;
    delete ret.authProviders;
    delete ret.friends;
    return ret;
  },
});

export default model('User', UserSchema);
