import mongoose from 'mongoose';
import { customAlphabet } from 'nanoid';

const { Schema, model } = mongoose;

// Human-friendly room codes, e.g. "7QF2K9" — no ambiguous chars (0/O, 1/I).
const roomCodeAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const generateRoomCode = customAlphabet(roomCodeAlphabet, 6);

export const ROLE_KEYS = [
  'villageois',
  'loup_garou',
  'voyante',
  'sorciere',
  'chasseur',
  'loup_garou_noir',
  'cupidon',
  'petite_fille',
  'salvateur',
];

const RoleConfigSchema = new Schema(
  {
    role: { type: String, enum: ROLE_KEYS, required: true },
    count: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const SeatSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userId: { type: String, required: true }, // denormalized public id
    displayName: { type: String, required: true },
    isHost: { type: Boolean, default: false },
    isReady: { type: Boolean, default: false },
    seatIndex: { type: Number, required: true },
    connected: { type: Boolean, default: true },
  },
  { _id: false }
);

const RoomSchema = new Schema(
  {
    code: { type: String, unique: true, default: () => generateRoomCode(), index: true },

    host: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
      type: String,
      enum: ['lobby', 'starting', 'in_progress', 'finished'],
      default: 'lobby',
    },

    // Host-configured capacity, enforced 4-20 at the application layer.
    minPlayers: { type: Number, default: 4 },
    maxPlayers: { type: Number, default: 20 },

    isPrivate: { type: Boolean, default: true },

    seats: { type: [SeatSchema], default: [] },

    // Manual role toggles the host has set. When `autoRecommended` is true,
    // this array was last populated by the Smart Auto-Recommend algorithm
    // (Stage 4) rather than hand-picked by the host.
    roleConfig: { type: [RoleConfigSchema], default: [] },
    autoRecommended: { type: Boolean, default: true },

    language: { type: String, enum: ['en', 'ar'], default: 'en' },

    currentMatch: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
  },
  { timestamps: true }
);

RoomSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default model('Room', RoomSchema);
