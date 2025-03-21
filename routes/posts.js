
const express = require('express');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const Community = require('../models/Community');
const Comment = require('../models/Comment');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all posts with sorting
router.get('/', async (req, res) => {
  try {
    const { sort = 'hot', limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let sortOption = {};
    
    switch (sort) {
      case 'new':
        sortOption = { createdAt: -1 };
        break;
      case 'top':
        sortOption = { upvotes: -1 };
        break;
      case 'rising':
        // For rising, we could use a combination of recency and upvote velocity
        sortOption = { createdAt: -1, upvotes: -1 };
        break;
      case 'hot':
      default:
        // For hot, we'll sort by a combination of upvotes and recency
        sortOption = { upvotes: -1, createdAt: -1 };
        break;
    }
    
    const posts = await Post.find()
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'username')
      .exec();
    
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get posts from a specific community
router.get('/community/:communityName', async (req, res) => {
  try {
    const { communityName } = req.params;
    const { sort = 'hot', limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let sortOption = {};
    
    switch (sort) {
      case 'new':
        sortOption = { createdAt: -1 };
        break;
      case 'top':
        sortOption = { upvotes: -1 };
        break;
      case 'rising':
        sortOption = { createdAt: -1, upvotes: -1 };
        break;
      case 'hot':
      default:
        sortOption = { upvotes: -1, createdAt: -1 };
        break;
    }
    
    // Check if community exists
    const community = await Community.findOne({ name: communityName });
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    const posts = await Post.find({ community: communityName })
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'username')
      .exec();
    
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get posts by a specific user
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { sort = 'new', limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Find user by username
    const user = await mongoose.model('User').findOne({ username });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let sortOption = {};
    
    switch (sort) {
      case 'top':
        sortOption = { upvotes: -1 };
        break;
      case 'new':
      default:
        sortOption = { createdAt: -1 };
        break;
    }
    
    const posts = await Post.find({ author: user._id })
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'username')
      .exec();
    
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a single post by ID
router.get('/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username')
      .exec();
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new post
router.post('/', auth, async (req, res) => {
  try {
    const { title, content, community } = req.body;
    
    // Check if community exists
    const communityDoc = await Community.findOne({ name: community });
    
    if (!communityDoc) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    const post = new Post({
      title,
      content,
      author: req.user._id,
      community
    });
    
    await post.save();
    
    // Populate author information
    await post.populate('author', 'username');
    
    res.status(201).json(post);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a post
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, content } = req.body;
    
    // Find post
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check if user is the author
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this post' });
    }
    
    // Update post
    post.title = title || post.title;
    post.content = content || post.content;
    
    await post.save();
    
    // Populate author information
    await post.populate('author', 'username');
    
    res.json(post);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a post
router.delete('/:id', auth, async (req, res) => {
  try {
    // Find post
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check if user is the author
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }
    
    // Delete all comments associated with the post
    await Comment.deleteMany({ post: post._id });
    
    // Delete the post
    await post.remove();
    
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Vote on a post
router.post('/:id/vote', auth, async (req, res) => {
  try {
    const { vote } = req.body;
    const postId = req.params.id;
    const userId = req.user._id;
    
    // Validate vote value (-1, 0, 1)
    if (![1, 0, -1].includes(vote)) {
      return res.status(400).json({ message: 'Invalid vote value' });
    }
    
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check if user has already voted
    const existingVoteIndex = post.voters.findIndex(
      v => v.user.toString() === userId.toString()
    );
    
    // Update the post's vote count
    if (existingVoteIndex !== -1) {
      const existingVote = post.voters[existingVoteIndex].vote;
      
      // Remove existing vote
      if (existingVote === 1) {
        post.upvotes -= 1;
      } else if (existingVote === -1) {
        post.downvotes -= 1;
      }
      
      if (vote === 0) {
        // Remove vote entirely
        post.voters.splice(existingVoteIndex, 1);
      } else {
        // Update vote
        post.voters[existingVoteIndex].vote = vote;
        
        // Add new vote
        if (vote === 1) {
          post.upvotes += 1;
        } else if (vote === -1) {
          post.downvotes += 1;
        }
      }
    } else if (vote !== 0) {
      // Add new vote
      post.voters.push({ user: userId, vote });
      
      if (vote === 1) {
        post.upvotes += 1;
      } else if (vote === -1) {
        post.downvotes += 1;
      }
    }
    
    await post.save();
    
    // Update user karma
    const user = await mongoose.model('User').findById(post.author);
    
    if (user) {
      // Simple karma calculation: upvotes - downvotes
      user.karma = await Post.aggregate([
        { $match: { author: user._id } },
        { $group: { _id: null, karma: { $sum: { $subtract: ['$upvotes', '$downvotes'] } } } }
      ]).then(result => (result[0]?.karma || 0));
      
      await user.save();
    }
    
    res.json({
      message: 'Vote recorded successfully',
      upvotes: post.upvotes,
      downvotes: post.downvotes
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Search posts
router.get('/search', async (req, res) => {
  try {
    const { q, sort = 'relevance', limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    let sortOption = {};
    
    switch (sort) {
      case 'new':
        sortOption = { createdAt: -1 };
        break;
      case 'top':
        sortOption = { upvotes: -1 };
        break;
      case 'relevance':
      default:
        // For relevance, we'll use MongoDB's text score
        sortOption = { score: { $meta: 'textScore' } };
        break;
    }
    
    const searchQuery = {
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } }
      ]
    };
    
    const posts = await Post.find(searchQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'username')
      .exec();
    
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
