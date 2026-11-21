import {createClient} from "redis";

class RedisService{
    constructor(){
        this.client=null;
        this.connecting=null;
    }
    async initialize(){
        if (this.client?.isOpen) return true;
        if (this.connecting) return this.connecting;

        const url = process.env.REDIS_URI;
        if (!url) {
            console.error("REDIS_URI is not defined in environment variables");
            return false;
        }

        const client = createClient({
            url,
            socket: {
                connectTimeout: 5000,
                reconnectStrategy: (retries) => retries > 3 ? false : Math.min(retries * 250, 1000),
            },
        });
        client.on("error",(error)=>console.error("Redis Client Error",error));
        this.client = client;
        this.connecting = client.connect()
            .then(() => {
                console.log("Redis Connected!");
                return true;
            })
            .catch((error) => {
                console.error("Failed to initialize redis",error);
                this.client = null;
                client.destroy();
                return false;
            })
            .finally(() => {
                this.connecting = null;
            });
        return this.connecting;
    }
    async disconnect(){
        const client = this.client;
        this.client = null;
        if (!client) return;
        if (client.isOpen) await client.quit();
        else client.destroy();
        console.log("Redis disconnected!");

    }
    async _safe(action, fallback=null){
        if(!this.client?.isOpen){
            const connected = await this.initialize();
            if(!connected || !this.client?.isOpen)return fallback;
        }
        try{
            return await action();

        }
        catch(error){
            console.error("Redis error",error);
            return fallback;
        }
    }
    async addUserSession(userId, socketId){
        await this._safe(async ()=>{
            const key = `user:${userId}:sessions`;
            await this.client.sAdd(key, socketId);
            await this.client.expire(key,600);
        })
    }
    async refreshUserSession(userId, socketId){
        await this._safe(async ()=>{
            const key = `user:${userId}:sessions`;
            await this.client.sAdd(key, socketId);
            if (await this.client.sIsMember(key, socketId)) {
                await this.client.expire(key, 600);
            }
        })
    }
    async getUserSessionCount(userId){
        return await this._safe(async()=>{
           return this.client.sCard(`user:${userId}:sessions`);

        },0)
    }
    async removeUserSession(userId, socketId){
        await this._safe(async()=>{
           const key = `user:${userId}:sessions`;
           await this.client.sRem(key,socketId);
           const remaining= await this.getUserSessionCount(userId);
           if(remaining==0){
            await this.client.del(key);
           }
        })
    }
    async removeAllUserSessions(userId){
        await this._safe(async()=>{
            await this.client.del(`user:${userId}:sessions`);

        })
    }
    async isUserOnline(userId){
        const count= await this.getUserSessionCount(userId);
        return count>0;
    }
}
export default new RedisService;
