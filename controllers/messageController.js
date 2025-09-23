import Message from "../models/Message.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";

// User sends message to admin
export const sendMessage = async (req, res, next) => {
  try {
    const { content } = req.body;
    
    if (!content?.trim()) {
      return next(new AppError('Message content is required', 400));
    }

    // Find admin user
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      return next(new AppError('Admin not found', 404));
    }

    const message = await Message.create({
      senderId: req.user.id,
      receiverId: admin._id,
      content: content.trim()
    });

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email');

    res.status(201).json({
      status: 'success',
      data: { message: populatedMessage }
    });
  } catch (error) {
    next(error);
  }
};

// Get current user's messages (conversation with admin)
export const getMyMessages = async (req, res, next) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.user.id },
        { receiverId: req.user.id }
      ]
    })
    .populate('senderId', 'firstName lastName email role')
    .populate('receiverId', 'firstName lastName email role')
    .sort({ createdAt: 1 });

    res.status(200).json({
      status: 'success',
      results: messages.length,
      data: { messages }
    });
  } catch (error) {
    next(error);
  }
};


export const getUserMessages = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const messages = await Message.find({
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ]
    })
    .populate('senderId', 'firstName lastName email role')
    .populate('receiverId', 'firstName lastName email role')
    .sort({ createdAt: 1 });

    res.status(200).json({
      status: 'success',
      results: messages.length,
      data: { messages }
    });
  } catch (error) {
    next(error);
  }
};

export const getAllMessages = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (status) filter.status = status;

    const messages = await Message.find(filter)
      .populate('senderId', 'firstName lastName email role')
      .populate('receiverId', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments(filter);
    const unreadCount = await Message.countDocuments({ status: 'pending' });

    res.status(200).json({
      status: 'success',
      results: messages.length,
      total,
      unreadCount,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: { messages }
    });
  } catch (error) {
    next(error);
  }
};

// Admin replies to message
export const replyMessage = async (req, res, next) => {
  try {
    const { reply } = req.body;
    const { id } = req.params;

    if (!reply?.trim()) {
      return next(new AppError('Reply content is required', 400));
    }

    const message = await Message.findById(id);
    if (!message) {
      return next(new AppError('Message not found', 404));
    }

    if (message.status === 'replied') {
      return next(new AppError('Message already replied', 400));
    }

    message.reply = reply.trim();
    message.status = 'replied';
    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email');

    res.status(200).json({
      status: 'success',
      data: { message: populatedMessage }
    });
  } catch (error) {
    next(error);
  }
};

// Get message statistics (admin only)
export const getMessageStats = async (req, res, next) => {
  try {
    const totalMessages = await Message.countDocuments();
    const pendingMessages = await Message.countDocuments({ status: 'pending' });
    const repliedMessages = await Message.countDocuments({ status: 'replied' });
    
    const recentMessages = await Message.find()
      .populate('senderId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          total: totalMessages,
          pending: pendingMessages,
          replied: repliedMessages
        },
        recentMessages
      }
    });
  } catch (error) {
    next(error);
  }
};