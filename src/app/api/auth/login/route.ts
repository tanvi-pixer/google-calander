import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { createUserToken } from "@/lib/auth";
import { v4 as uuid } from "uuid";

export async function POST(request: NextRequest) {
	try {
		const { email, name } = await request.json();

		if (!email || !name) {
			return NextResponse.json(
				{
					success: false,
					message: "Email and name are required",
				},
				{ status: 400 }
			);
		}

		const Users = await getCollection("Users");

		// Check if user exists
		let user = await Users.findOne({ email });

		if (!user) {
			// Create new user
			const userId = uuid();
			user = {
				_id: userId as any,
				email,
				name,
				createdAt: new Date(),
				Details: {}, // Will store Google connection later
			};
			await Users.insertOne(user);
		}

		// Create JWT token
		const token = createUserToken({
			id: user._id as any,
			email: user.email,
			name: user.name,
		});

		const response = NextResponse.json({
			success: true,
			user: {
				id: user._id,
				email: user.email,
				name: user.name,
			},
			token,
		});

		// Set HTTP-only cookie
		response.cookies.set("auth-token", token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			maxAge: 7 * 24 * 60 * 60, // 7 days
		});

		return response;
	} catch (error: any) {
		return NextResponse.json(
			{
				success: false,
				error: error.message,
			},
			{ status: 500 }
		);
	}
}
