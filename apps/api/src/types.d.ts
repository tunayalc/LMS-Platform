
import { User as AppUser } from "./auth/utils";

declare global {
    namespace Express {
        interface User extends AppUser { }
    }
}
