import mongoose from 'mongoose';
import { ROLE_KEYS } from './Room.js';

const { Schema, model } = mongoose;

const PlayerResultSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    role: { type: String, enum: ROLE_KEYS, required: true },
    // If the player started as villageois/other and was infected by
    // Loup-Garou Noir, this records the conversion.
    convertedToWolf: { type: Boolean, default: false },
    survived: { type: Boolean, default: false },
    isWinner: { type: Boolean, default: false },
    xpEarned: { type: Number, default: 0 },
  },
  { _id: false }
);

const EventLogSchema = new Schema(
  {
    phase: { type: String, enum: ['day', 'night'], required: true },
    cycle: { type: Number, required: true }, // day/night cycle number
    type: {
      type: String,
      enum: [
        'kill', 'vote', 'lynch', 'heal', 'poison',
        'infect', 'seer_check', 'hunter_shot', 'game_start', 'game_end',
      ],
      required: true,
    },
    actor: { type: String, default: null }, // public userId
    target: { type: String, default: null }, // public userId
    detail: { type: Schema.Types.Mixed, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MatchSchema = new Schema(
  {
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    roomCode: { type: String, required: true },

    playerCount: { type: Number, required: true },
    roleConfig: [{ role: String, count: Number }],

    results: { type: [PlayerResultSchema], default: [] },
    events: { type: [EventLogSchema], default: [] },

    winningTeam: {
      type: String,
      enum: ['villagers', 'wolves', 'lovers', 'draw'],
      default: null,
    },

    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: null },
  },
  { timestamps: true }
);

MatchSchema.index({ 'results.user': 1 });

export default model('Match', MatchSchema);
