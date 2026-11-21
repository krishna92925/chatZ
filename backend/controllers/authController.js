import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import generateUniqueConnectCode from '../utils/generateUniqueConnectCode.js';

 class AuthController{
    static async register(req, res){
        try{
            const {fullName, username, email, password} = req.body ?? {};
            if (
                typeof fullName !== 'string' ||
                typeof username !== 'string' ||
                typeof email !== 'string' ||
                typeof password !== 'string' ||
                !fullName.trim() || !username.trim() || !email.trim() || !password
            ){
                return res.status(400).json({message: 'All fields are required'});
            }
            if(password.length < 6){
                return res.status(400).json({message: 'Password must be at least 6 characters'});
            }
            const normalizedEmail = email.trim().toLowerCase();
            const normalizedUsername = username.trim().toLowerCase();
            const normalizedFullName = fullName.trim();
            if (normalizedFullName.length < 3 || normalizedFullName.length > 30 || normalizedUsername.length < 3 || normalizedUsername.length > 30) {
                return res.status(400).json({message: 'Full name and username must be between 3 and 30 characters'});
            }
            if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
                return res.status(400).json({message: 'Username can only contain lowercase letters, numbers, and underscores'});
            }
            const existingUser = await User.findOne({$or: [{email: normalizedEmail}, {username: normalizedUsername}]});
            if(existingUser){
                return res.status(400).json({message: 'Email or username already in use'});
            }
            // has password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            const user = new User({
                username: normalizedUsername,
                fullName: normalizedFullName,
                email: normalizedEmail,
                password: hashedPassword,
                connectCode: await generateUniqueConnectCode()
            })
            await user.save();
            console.log('User registered successfully');
            res.status(201).json({message: 'User registered successfully'});

        }
        catch(err){
            if (err?.code === 11000) {
                return res.status(400).json({message: 'Email or username already in use'});
            }
            if (err?.name === 'ValidationError') {
                return res.status(400).json({message: 'Invalid account details'});
            }
            console.error('Error during registration', err);
            res.status(500).json({message: 'Server error during registration'});
        }
    }
    static async login(req, res){
        try{
            const {email, password} = req.body ?? {};
            if(typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password){
                return res.status(400).json({message: 'Email and password are required'});
            }
            const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
            const user = await User.findOne({email: normalizedEmail});
            if(!user){
                return res.status(400).json({message: 'Invalid email or password'});
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if(!isMatch){
                return res.status(400).json({message: 'Invalid email or password'});
            } 
            const token= jwt.sign({userId: user._id}, process.env.JWT_SECRET, {expiresIn: '7d'});
            res.cookie("jwt", token, {
                maxAge: 7*24*60*60*1000, // 7 days
                httpOnly: true,
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                secure: process.env.NODE_ENV === 'production',
         } );
         res.status(200).json({user:{
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            email: user.email,
             connectCode: user.connectCode,
         },message: 'Login successful'});

        }
        catch(err){
            console.error("Login error", err);
            res.status(500).json({message: 'Server error during login'});
        }
    }
    static async me(req,res){
        try{
            const user = req.user;
            if(!user){
                return res.status(401).json({message: 'Not authorized'});
            }
            return res.status(200).json({user:{
                id: user.id,
                username: user.username,
                fullName: user.fullName,
                email: user.email,
                 connectCode: user.connectCode,
            }});   

        }
        catch(err){
            console.error("Error fetching user data", err);
            res.status(500).json({message: 'Server error fetching user data'});
        }
    }

    static async logout(req, res){
        res.clearCookie("jwt", {
            httpOnly: true,
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            secure: process.env.NODE_ENV === 'production',
        });
        return res.status(200).json({message: "Logged out"});
    }

 }
 export default AuthController;
