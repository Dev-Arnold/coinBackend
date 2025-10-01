import Activity from '../models/Activity.js';

// Get site activity history
const getActivityHistory = async (req, res, next) => {
  try {
    const activities = await Activity.find()
      .populate('user', 'firstName lastName')
      .sort('-createdAt')
      .limit(50);

    res.status(200).json({
      status: 'success',
      results: activities.length,
      data: { activities }
    });
  } catch (error) {
    next(error);
  }
};

// Create activity log
const logActivity = async (type, description, userId = null, amount = null, coinId = null) => {
  try {
    await Activity.create({
      type,
      user: userId,
      description,
      amount,
      coinId
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

export { getActivityHistory, logActivity };