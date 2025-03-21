
const express = require('express');
const Community = require('../models/Community');
const Post = require('../models/Post');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all communities
router.get('/', async (req, res) => {
  try {
    const communities = await Community.find()
      .sort({ memberCount: -1 })
      .populate('creator', 'username')
      .exec();
    
    res.json(communities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get popular communities
router.get('/popular', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    const communities = await Community.find()
      .sort({ memberCount: -1 })
      .limit(parseInt(limit))
      .exec();
    
    res.json(communities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a single community by name
router.get('/:name', async (req, res) => {
  try {
    const community = await Community.findOne({ name: req.params.name })
      .populate('creator', 'username')
      .populate('moderators', 'username')
      .exec();
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if the authenticated user is a member
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
        
        community.isJoined = community.members.some(member => member.toString() === userId);
      } catch (err) {
        // Ignore token errors here, just don't add the isJoined property
      }
    }
    
    res.json(community);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new community
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Check if community already exists
    const existingCommunity = await Community.findOne({ name });
    
    if (existingCommunity) {
      return res.status(400).json({ message: 'Community already exists' });
    }
    
    const community = new Community({
      name,
      description,
      creator: req.user._id,
      moderators: [req.user._id],
      members: [req.user._id],
      memberCount: 1
    });
    
    await community.save();
    
    // Populate creator information
    await community.populate('creator', 'username');
    
    res.status(201).json(community);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a community
router.put('/:name', auth, async (req, res) => {
  try {
    const { description, rules } = req.body;
    
    // Find community
    const community = await Community.findOne({ name: req.params.name });
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is a moderator
    if (!community.moderators.includes(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to update this community' });
    }
    
    // Update community
    if (description !== undefined) community.description = description;
    if (rules !== undefined) community.rules = rules;
    
    await community.save();
    
    // Populate creator and moderators information
    await community.populate('creator', 'username');
    await community.populate('moderators', 'username');
    
    res.json(community);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Join a community
router.post('/:name/join', auth, async (req, res) => {
  try {
    const community = await Community.findOne({ name: req.params.name });
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is already a member
    if (community.members.includes(req.user._id)) {
      return res.status(400).json({ message: 'Already a member of this community' });
    }
    
    // Add user to members
    community.members.push(req.user._id);
    community.memberCount += 1;
    
    await community.save();
    
    res.json({ message: 'Successfully joined community' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Leave a community
router.post('/:name/leave', auth, async (req, res) => {
  try {
    const community = await Community.findOne({ name: req.params.name });
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is a member
    if (!community.members.includes(req.user._id)) {
      return res.status(400).json({ message: 'Not a member of this community' });
    }
    
    // Remove user from members
    community.members = community.members.filter(
      member => member.toString() !== req.user._id.toString()
    );
    community.memberCount = Math.max(0, community.memberCount - 1);
    
    await community.save();
    
    res.json({ message: 'Successfully left community' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add a moderator
router.post('/:name/moderators', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Find community
    const community = await Community.findOne({ name: req.params.name });
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is the creator
    if (community.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the community creator can add moderators' });
    }
    
    // Check if user to be added exists
    const user = await mongoose.model('User').findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user is already a moderator
    if (community.moderators.includes(userId)) {
      return res.status(400).json({ message: 'User is already a moderator' });
    }
    
    // Add user to moderators
    community.moderators.push(userId);
    
    // Make sure user is also a member
    if (!community.members.includes(userId)) {
      community.members.push(userId);
      community.memberCount += 1;
    }
    
    await community.save();
    
    // Populate moderators information
    await community.populate('moderators', 'username');
    
    res.json(community);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Remove a moderator
router.delete('/:name/moderators/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find community
    const community = await Community.findOne({ name: req.params.name });
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is the creator
    if (community.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the community creator can remove moderators' });
    }
    
    // Check if user to be removed is not the creator
    if (community.creator.toString() === userId) {
      return res.status(400).json({ message: 'Cannot remove the community creator from moderators' });
    }
    
    // Remove user from moderators
    community.moderators = community.moderators.filter(
      mod => mod.toString() !== userId
    );
    
    await community.save();
    
    // Populate moderators information
    await community.populate('moderators', 'username');
    
    res.json(community);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
