
const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },
  value: {
    type: Number,
    enum: [-1, 0, 1],
    required: true
  }
}, {
  timestamps: true
});

// Ensure a user can only vote once on a post or comment
voteSchema.index({ user: 1, post: 1 }, { unique: true, sparse: true });
voteSchema.index({ user: 1, comment: 1 }, { unique: true, sparse: true });

const Vote = mongoose.model('Vote', voteSchema);

module.exports = Vote;
