
const express = require('express');
const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const auth = require('../middleware/auth');

const router = express.Router();

// Get comments for a post
router.get('/post/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    
    // Find top-level comments (no parentId)
    const comments = await Comment.find({ post: postId, parentId: null })
      .sort({ createdAt: -1 })
      .populate('author', 'username')
      .exec();
    
    // Function to recursively get replies
    const populateReplies = async (comments) => {
      for (let comment of comments) {
        const replies = await Comment.find({ parentId: comment._id })
          .sort({ createdAt: 1 })
          .populate('author', 'username')
          .exec();
        
        if (replies.length > 0) {
          comment.replies = replies;
          await populateReplies(replies);
        }
      }
    };
    
    await populateReplies(comments);
    
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get comments by a specific user
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Find user by username
    const user = await mongoose.model('User').findOne({ username });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const comments = await Comment.find({ author: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'username')
      .populate({
        path: 'post',
        select: 'title community',
      })
      .exec();
    
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new comment
router.post('/', auth, async (req, res) => {
  try {
    const { postId, parentId, content } = req.body;
    
    // Check if post exists
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // If this is a reply, check if parent comment exists
    if (parentId) {
      const parentComment = await Comment.findById(parentId);
      
      if (!parentComment) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }
    }
    
    const comment = new Comment({
      content,
      author: req.user._id,
      post: postId,
      parentId: parentId || null
    });
    
    await comment.save();
    
    // Increment comment count on post
    post.commentCount += 1;
    await post.save();
    
    // Populate author information
    await comment.populate('author', 'username');
    
    res.status(201).json(comment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a comment
router.put('/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;
    
    // Find comment
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user is the author
    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this comment' });
    }
    
    // Update comment
    comment.content = content;
    
    await comment.save();
    
    // Populate author information
    await comment.populate('author', 'username');
    
    res.json(comment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a comment
router.delete('/:id', auth, async (req, res) => {
  try {
    // Find comment
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user is the author
    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }
    
    // Delete comment
    await comment.remove();
    
    // Decrement comment count on post
    const post = await Post.findById(comment.post);
    
    if (post) {
      post.commentCount = Math.max(0, post.commentCount - 1);
      await post.save();
    }
    
    res.json({ message: 'Comment deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Vote on a comment
router.post('/:id/vote', auth, async (req, res) => {
  try {
    const { vote } = req.body;
    const commentId = req.params.id;
    const userId = req.user._id;
    
    // Validate vote value (-1, 0, 1)
    if (![1, 0, -1].includes(vote)) {
      return res.status(400).json({ message: 'Invalid vote value' });
    }
    
    const comment = await Comment.findById(commentId);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user has already voted
    const existingVoteIndex = comment.voters.findIndex(
      v => v.user.toString() === userId.toString()
    );
    
    // Update the comment's vote count
    if (existingVoteIndex !== -1) {
      const existingVote = comment.voters[existingVoteIndex].vote;
      
      // Remove existing vote
      if (existingVote === 1) {
        comment.upvotes -= 1;
      } else if (existingVote === -1) {
        comment.downvotes -= 1;
      }
      
      if (vote === 0) {
        // Remove vote entirely
        comment.voters.splice(existingVoteIndex, 1);
      } else {
        // Update vote
        comment.voters[existingVoteIndex].vote = vote;
        
        // Add new vote
        if (vote === 1) {
          comment.upvotes += 1;
        } else if (vote === -1) {
          comment.downvotes += 1;
        }
      }
    } else if (vote !== 0) {
      // Add new vote
      comment.voters.push({ user: userId, vote });
      
      if (vote === 1) {
        comment.upvotes += 1;
      } else if (vote === -1) {
        comment.downvotes += 1;
      }
    }
    
    await comment.save();
    
    // Update user karma
    const user = await mongoose.model('User').findById(comment.author);
    
    if (user) {
      // Add comment karma to user's total karma
      const commentKarma = await Comment.aggregate([
        { $match: { author: user._id } },
        { $group: { _id: null, karma: { $sum: { $subtract: ['$upvotes', '$downvotes'] } } } }
      ]).then(result => (result[0]?.karma || 0));
      
      const postKarma = await Post.aggregate([
        { $match: { author: user._id } },
        { $group: { _id: null, karma: { $sum: { $subtract: ['$upvotes', '$downvotes'] } } } }
      ]).then(result => (result[0]?.karma || 0));
      
      user.karma = postKarma + commentKarma;
      await user.save();
    }
    
    res.json({
      message: 'Vote recorded successfully',
      upvotes: comment.upvotes,
      downvotes: comment.downvotes
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
