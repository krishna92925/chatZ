import Friendship from "../models/Friendship.js"
import User from "../models/User.js"
import Conversation from "../models/Conversation.js"
import { getChatRoom } from "./helper.js";
import RedisService from "../services/redisService.js"
import Message from "../models/Message.js"


export const notifyConversationOnlineStatus = async (io, socket, online) => {
    try {
        const userId = socket.userId;
        const user = socket.user;

        const friendships = await Friendship.find({
            $or: [
                {requester: userId},
                {recipient: userId}
            ],
        })

        friendships.forEach((friendship) => {
            const requesterId = friendship.requester.toString();
            const recipientId = friendship.recipient.toString();
            const isRequester = requesterId === userId.toString();
            const friendId = isRequester ? recipientId : requesterId;

            const room = getChatRoom(userId.toString(), friendId.toString());
            if (online) socket.join(room);

            console.log("emit:conversation:online-status");
            io.to(friendId.toString())
                .emit('conversation:online-status', {
                    friendId: userId,
                    username: user.username,
                    online,
                })
        })


    } catch (error) {
        console.error("notifyConversationOnlineStatus", error);
    }
}
export const conversationRequest = async (io,socket, data)=>{
    try {
        const userId= socket.userId;
        const user= socket.user;
        const {connectCode}= data ?? {};
        const friend = await User.findOne({ connectCode});
        if(!friend){
            socket.emit("conversation:request:error",{error:"Unable to find conversation"});
            return;
        }
        if(friend._id.toString()==userId.toString()){
            socket.emit("conversation:request:error",{error: "Cannot add yourself as a friend"});
            return;
        }
        const existingFriendship= await Friendship.findOne({
            $or: [
                {requester:userId, recipient:friend._id},
                {requester:friend._id, recipient:userId}
            ]
        })
        if(existingFriendship){
            socket.emit("conversation:request:error",{error: "Friendship already exists"});
            return;
        }
        const friendship = await Friendship.create({
            requester: userId,
            recipient: friend._id,
        })
        let conversation;
        try {
            conversation = await Conversation.create({
                participants:[userId, friend._id.toString()]
            });
        } catch (error) {
            await Friendship.deleteOne({_id: friendship._id});
            throw error;
        }
        const room = getChatRoom(userId,friend._id.toString());
        io.in(userId.toString()).socketsJoin(room);
        io.in(friend._id.toString()).socketsJoin(room);
        const conversationData={
            conversationId: conversation._id.toString(),
            lastMessage: null,
            unreadCounts:{
                [userId.toString()]:0,
                [friend._id.toString()]:0,
            },

        };
        io.to(userId.toString()).emit('conversation:accept',{
            ...conversationData,
            friend:{
                id:friend.id,
                fullName: friend.fullName,
                username: friend.username,
                connectCode: friend.connectCode,
                online: await RedisService.isUserOnline(friend._id.toString()),
            }
        })
        io.to(friend._id.toString()).emit('conversation:accept',{
            ...conversationData,
            friend:{
                id:user.id,
                fullName: user.fullName,
                username: user.username,
                connectCode: user.connectCode,
                online: await RedisService.isUserOnline(user._id.toString()),
            }
        })
    } catch (error) {
        console.error("Error conversation: request",error);
        socket.emit("conversation:request:error",{error:"Error conversation request"})
        
    }
}
export const conversationMarkAsRead = async(io,socket, data)=>{
    try {
        const {conversationId, friendId}= data ?? {};
        const userId= socket.userId;
        const friendship = await Friendship.findOne({
            $or:[
                {requester: userId, recipient: friendId},
                {requester: friendId, recipient: userId}
            ],
        })
        if(!friendship){
            socket.emit("conversation:mark-as-read:error",{error:"Error: conversation: mark-as-read:error"});
            return;
        }
        const conversation= await Conversation.findOne({
            _id: conversationId,
            participants: {$all: [userId, friendId], $size: 2},
        });
        if(!conversation){
            socket.emit("conversation:mark-as-read:error",{error:"Error: conversation: mark-as-read:error"});
            return;
        }
        
        conversation.unreadCount.set(userId.toString(),0);
        await conversation.save();
        const room= getChatRoom(userId.toString(),friendId);
        io.to(room).emit('conversation:update-unread-counts',{
            conversationId: conversation._id.toString(),
            unreadCounts:{
                [userId.toString()]:0,
                [friendId.toString()]:conversation.unreadCount.get(friendId.toString()) || 0,

            }
        })
        
    } catch (error) {
        console.error("Error makring conversation as read",error);
        socket.emit("conversation:mark-as-read:error",{error:"Error: conversation: mark-as-read:error"});
        
    }
}
export const conversationSendMessage=async (io,socket,data)=>{
    try {
        const {conversationId,friendId, content}= data ?? {};
        const userId= socket.userId;
        const user= socket.user;
        if (typeof content !== "string" || !content.trim() || content.trim().length > 5000) {
            socket.emit("conversation:send-message:error", {error: "Message must be between 1 and 5000 characters"});
            return;
        }
          const friendship = await Friendship.findOne({
            $or:[
                {requester: userId, recipient: friendId},
                {requester: friendId, recipient: userId}
            ],
        })
        if(!friendship){
            socket.emit("conversation:send-message:error",{error:"No friendship found"});
            return;
        }
        const conversation= await Conversation.findOne({
            _id: conversationId,
            participants: {$all: [userId, friendId], $size: 2},
        });
        if(!conversation){
            socket.emit("conversation:send-message:error",{error:"No conversation found"});
            return;
        }
        const message= new Message({
            conversation: conversationId,
            sender: userId,
            content: content.trim(),

        });
        await message.save();
        const currentUnreadCount = conversation.unreadCount.get(friendId) || 0;
        conversation.unreadCount.set(friendId,currentUnreadCount+1);
        await conversation.save();

        const messageData = {
            _id: message.id,
            sender: {
                _id: userId.toString(),
                username: user.username,
            },
            content: message.content,
            createdAt: message.createdAt,
            read: message.read,
        }
        const updatedConversation = await Conversation.findById(conversationId);
        const room = getChatRoom(userId, friendId);

        io.to(room).emit("conversation:new-message",{
            conversationId: conversation.id,
            message: messageData,
        })
        io.to(room).emit("conversation:update-conversation",{
            conversationId: conversation.id,
            lastMessage:updatedConversation.lastMessagePreview,
            unreadCounts: {
                [userId.toString()]: updatedConversation.unreadCount.get(userId.toString()),
                [friendId]: updatedConversation.unreadCount.get(friendId)
            }

        })
        
    } catch (error) {
        console.error("Error sending message",error);
        socket.emit("conversation:send-message:error",{error:"Error: conversation:send-message:error"});
        
    }
}
export const conversationTyping = async(io,socket, data)=>{
    try {
        const {friendId, isTyping}= data ?? {};
        const userId = socket.userId;
        if (!friendId || typeof isTyping !== "boolean" || userId.toString() === friendId.toString()) return;

        const friendship = await Friendship.findOne({
            $or: [
                {requester: userId, recipient: friendId},
                {requester: friendId, recipient: userId},
            ],
        });
        if (!friendship) return;

        socket.to(friendId.toString()).emit("conversation:update-typing",{
            userId: userId.toString(),
            isTyping,
        })
        
    } catch (error) {
        console.error("Error sending conversation typing state",error);
        
    }
}
