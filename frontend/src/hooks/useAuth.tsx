import { useQuery } from "@tanstack/react-query";
import { authService } from "../services/authService";
import { useAuthStore } from "../store/authStore";


export function useAuth() {
    return useQuery({
        queryKey: ['auth'],
        queryFn: async () => {
            try {
                const data = await authService.me();
                useAuthStore.getState().setUser(data.user);
                return data;
            } catch (error) {
                useAuthStore.getState().logout();
                throw error;
            }
        },
        retry: false,
       
    })
}
