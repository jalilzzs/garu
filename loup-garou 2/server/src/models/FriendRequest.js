import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const FriendRequestSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

FriendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

/** Separate, ephemeral model for room invites (not persisted friendships). */
const RoomInviteSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roomCode: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending',
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
RoomInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RoomInvite = model('RoomInvite', RoomInviteSchema);
export default model('FriendRequest', FriendRequestSchema);
