import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { createCalendarClient } from "@/lib/google";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
	try {
		console.log("=== COMPREHENSIVE DEBUG ===");

		// Step 1: Check JWT token
		const authHeader = request.headers.get("authorization");
		const cookieToken = request.cookies.get("auth-token")?.value;
		const token = authHeader?.replace("Bearer ", "") || cookieToken;

		console.log("Auth header present:", !!authHeader);
		console.log("Cookie token present:", !!cookieToken);
		console.log("Final token present:", !!token);

		if (token) {
			try {
				const decoded = JSON.parse(atob(token.split(".")[1]));
				console.log("JWT payload:", {
					userId: decoded.userId,
					email: decoded.email,
					exp: new Date(decoded.exp * 1000).toISOString(),
				});
			} catch (e) {
				console.log("JWT decode error:", e);
			}
		}

		// Step 2: Get user from request
		const user = await getUserFromRequest(request);
		console.log("getUserFromRequest result:", user);

		if (!user) {
			return NextResponse.json(
				{
					success: false,
					message: "Please login first",
					debug: "getUserFromRequest returned null",
				},
				{ status: 401 }
			);
		}

		// Step 3: Check database
		const Users = await getCollection("Users");
		console.log("Looking for user with _id:", user.id);

		const userDoc = await Users.findOne({ _id: user.id as any });
		console.log("User document found:", !!userDoc);

		if (userDoc) {
			console.log("User document structure:", {
				id: userDoc._id,
				email: userDoc.email,
				hasDetails: !!userDoc.Details,
				hasGoogle: !!userDoc.Details?.Google,
				googleConnected: userDoc.Details?.Google?.Connected,
				hasRefreshToken: !!userDoc.Details?.Google?.RefreshToken,
				hasAccessToken: !!userDoc.Details?.Google?.AccessToken,
			});
		} else {
			console.log("❌ User document not found in database!");

			// Let's see what users DO exist
			const allUsers = await Users.find({}).limit(5).toArray();
			console.log(
				"Available users in DB:",
				allUsers.map((u) => ({
					id: u._id,
					email: u.email,
					hasGoogle: !!u.Details?.Google?.Connected,
				}))
			);
		}

		const google = userDoc?.Details?.Google;

		if (!google?.RefreshToken) {
			return NextResponse.json(
				{
					success: false,
					message: "Google not connected. Please connect first.",
					debug: {
						userFound: !!userDoc,
						googleExists: !!google,
						refreshTokenExists: !!google?.RefreshToken,
						connected: google?.Connected,
					},
				},
				{ status: 400 }
			);
		}

		// If we get here, continue with calendar listing
		const calendar = createCalendarClient(google);

		const response = await calendar.calendarList.list({
			maxResults: 250,
		});

		const calendars =
			response.data.items?.map((item) => ({
				id: item.id,
				summary: item.summary,
				description: item.description,
				timeZone: item.timeZone,
				accessRole: item.accessRole,
				primary: item.primary || false,
				backgroundColor: item.backgroundColor,
				foregroundColor: item.foregroundColor,
			})) || [];

		return NextResponse.json({
			success: true,
			calendars,
			totalCount: calendars.length,
			user: { id: user.id, email: user.email, name: user.name },
		});
	} catch (error: any) {
		console.error("List calendars error:", error);
		return NextResponse.json(
			{
				success: false,
				message: "Failed to list calendars",
				error: error.message,
			},
			{ status: 500 }
		);
	}
}
