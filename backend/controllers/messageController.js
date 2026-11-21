import Message from "../models/Message.js"
import Conversation from "../models/Conversation.js";
import mongoose from "mongoose";

class MessageController {
    static async getMessages(req, res){
        try {
            const {conversationId}= req.params;
            const {cursor}=req.query;
            const limit=20;
            if (!mongoose.isValidObjectId(conversationId)) {
                return res.status(400).json({message: "Invalid conversation id"});
            }
            const conversation = await Conversation.findOne({
                _id: conversationId,
                participants: req.user._id,
            }).select("_id");
            if (!conversation) {
                return res.status(404).json({message: "Conversation not found"});
            }
            const query ={conversation: conversation._id};
            if(cursor){
                const cursorDate = new Date(cursor);
                if (Number.isNaN(cursorDate.getTime())) {
                    return res.status(400).json({message: "Invalid message cursor"});
                }
                query.createdAt = {$lt: cursorDate};
            }
            
            let messages = await Message.find(query)
            .sort({createdAt:-1})
            .limit(limit + 1)
            .populate("sender","username")
            .lean();

            const hasNext = messages.length > limit;
            if (hasNext) messages.pop();
            const nextCursor= messages.length>0 ? messages[messages.length-1].createdAt.toISOString():null;
            messages.reverse();
            res.json({messages, nextCursor, hasNext});

            
        } catch (error) {
            console.error("Error fetching messages",error);
            res.status(500).json({message:"Internal Server error"});
            
        }
    }
}
export default MessageController;
