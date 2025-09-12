// models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.ObjectId,
    required: true,
    ref: 'User'
  }, 
  receiverId: {
    type: mongoose.Schema.ObjectId,
    required: true,
    ref: 'User'
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  reply: {
    type: String,
    trim: true,
    maxlength: [1000, 'Reply cannot exceed 1000 characters']
  },
  status: {
    type: String,
    enum: ["pending", "replied"],
    default: "pending",
  },
  isRead: {
    type: Boolean,
    default: false
  },
  repliedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Update repliedAt when status changes to replied
messageSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'replied') {
    this.repliedAt = new Date();
  }
  next();
});

export default mongoose.model("Message", messageSchema);