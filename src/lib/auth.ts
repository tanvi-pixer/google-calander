import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { getCollection } from "./mongodb";

export interface AuthenticatedUser {
	id: string;
	email: string;
	name: string;
}

export async function getUserFromRequest(
	request: NextRequest
): Promise<AuthenticatedUser | null> {
	try {
		// Get token from Authorization header or cookies
		const authHeader = request.headers.get("authorization");
		const cookieToken = request.cookies.get("auth-token")?.value;

		const token = authHeader?.replace("Bearer ", "") || cookieToken;

		if (!token) return null;

		// Verify JWT token
		const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

		// Get user from database to ensure they still exist
		const Users = await getCollection("Users");
		const user = await Users.findOne({ _id: decoded.userId });

		if (!user) return null;

		return {
			id: user._id as any,
			email: user.email,
			name: user.name,
		};
	} catch (error) {
		console.error("Auth error:", error);
		return null;
	}
}

export function createUserToken(user: AuthenticatedUser): string {
	return jwt.sign(
		{
			userId: user.id,
			email: user.email,
			name: user.name,
		},
		process.env.JWT_SECRET!,
		{ expiresIn: "7d" }
	);
}
